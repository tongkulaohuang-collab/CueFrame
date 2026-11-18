import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {data, write, job, get} from './store.mjs';
import {upload} from './media.mjs';
import {timeline, update} from '../shared/model.mjs';
import {scriptNeeds,sampleInputs} from '../shared/science-flow.mjs';
import {analyzeMusicPCM} from './music-analysis.mjs';
import {speechWindows,voiceMusicFilter} from '../shared/audio-mix.mjs';
const exec = promisify(execFile);
const file = a => path.join(data, 'uploads', path.basename(a.src));
async function ff(args, limit=32*1024*1024) {
  const {stdout} = await exec(ffmpeg.path, ['-hide_banner','-loglevel','error',...args], {
    encoding:'buffer', windowsHide:true, maxBuffer:limit, timeout:60000,
  });
  return stdout;
}
export async function analyzeBgm(p, b) {
  const a = p.assets.find(x=>x.id===b.id && x.kind==='audio');
  const {from, until} = b;
  if (!a || !Number.isFinite(from) || !Number.isFinite(until) || from<0 || until<=from || until>a.duration+0.01) throw Error('请选择有效的音乐起止时间');
  const input = ['-ss',String(from),'-i',file(a),'-t',String(until-from),'-vn'];
  const pcm = await ff([...input,'-ar','8000','-ac','1','-f','s16le','pipe:1'],64*1024*1024);
  const {marks,rhythm}=analyzeMusicPCM(pcm);
  let clip=a;
  if(from!==0 || Math.abs(until-a.duration)>.01) {
    const bytes=await ff([...input,'-codec:a','libmp3lame','-b:a','128k','-f','mp3','pipe:1'],64*1024*1024);
    clip={...upload('选段-'+path.parse(a.name).name+'.mp3',bytes),source:a.source,license:a.license,credit:a.credit,confirmed:a.confirmed,role:'music'};
  }
  const next=update(p,{...p,assets:clip.id===a.id?p.assets.map(x=>x.id===a.id?{...x,role:'music'}:x):[...p.assets,clip],
    scienceFlow:{...p.scienceFlow,bgmId:clip.id}});
  Object.assign(next.scienceFlow,{analysis:{sourceId:a.id,clipId:clip.id,from,until,marks,rhythm},scriptVersion:null,proofVersion:null,proofs:null,sampleJob:null});
  return write(next,p.version);
}
export async function listenMix(p, id) {
  const tl=timeline(p),row=tl.rows.find(r=>r.shot.id===id);
  const v=row?.voices.find(x=>x.asset.role===p.voice)?.asset, m=row?.music;
  if(!m || !v) throw Error('请先分析 BGM 并为本段采用口播');
  const offset=(row.from/p.fps)%m.duration;
  const take=row.voices.find(x=>x.asset.id===v.id);
  const captions=tl.rows.flatMap(r=>r.captionCues.map(c=>({...c,from:r.from+c.from,until:c.until==null?undefined:r.from+c.until})));
  const windows=speechWindows(tl.rows.flatMap(r=>r.voices.map(v=>({...v,from:r.from+v.from}))),p.fps,captions);
  const bytes=await ff(['-i',file(v),'-stream_loop','-1','-ss',String((offset+take.from/p.fps)%m.duration),'-i',file(m),
    '-filter_complex',voiceMusicFilter(windows,v.duration,{origin:(row.from+take.from)/p.fps,wholeDuration:tl.frames/p.fps}),'-map','[out]','-t',String(v.duration),'-f','mp3','pipe:1']);
  return {src:'data:audio/mpeg;base64,'+bytes.toString('base64')};
}
export function approveScience(p, action, id) {
  const f=p.scienceFlow;
  if(!f) throw Error('请先保存科普工作流');
  if(action==='script') {
    const needs=scriptNeeds(p);
    if(needs.length) throw Error(needs.join('；'));
    if(!f.scriptVersion) f.scriptVersion=p.version+1;
  } else if(action==='proofs') {
    if(!f.scriptVersion || f.proofs?.length!==3) throw Error('请查看本版三张效果图');
    f.proofVersion=p.version+1;
    f.sampleJob=null;
  } else if(action==='sample') {
    const j=job(id);
    if(!f.proofVersion || j.project!==p.id || j.type!=='render' || j.scope!=='shot' || j.status!=='done' || j.version<f.proofVersion || sampleInputs(get(p.id,j.version))!==sampleInputs(p)) throw Error('请先观看当前图版导出的有声样片');
    f.sampleJob=j.id;
  } else throw Error('未知审核步骤');
  return write(p,p.version);
}

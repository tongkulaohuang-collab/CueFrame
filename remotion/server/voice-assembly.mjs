import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {data,db,conflict} from './store.mjs';
import {upload} from './media.mjs';
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {timeline} from '../shared/model.mjs';
import {MIX_VERSION,speechWindows,voiceMusicFilter} from '../shared/audio-mix.mjs';
const exec=promisify(execFile), pending=new Map();
db.exec('CREATE TABLE IF NOT EXISTS voice_assemblies (key TEXT PRIMARY KEY, body TEXT NOT NULL)');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=a=>path.join(data,'uploads',path.basename(a.src));
function cached(key) {
  const row=db.prepare('SELECT body FROM voice_assemblies WHERE key=?').get(key);
  if(!row)return null;
  const asset=JSON.parse(row.body);
  return fs.existsSync(file(asset))?asset:null;
}
function keys(p,plan) {
  const narration=hash(plan.signature), music=p.assets.find(a=>a.id===p.scienceFlow?.bgmId&&a.kind==='audio');
  const windows=assemblyWindows(p);
  return {narration,music,windows,mix:music?hash([narration,music.id,music.src,music.duration,MIX_VERSION,windows]):null};
}
function assemblyWindows(p){
  const rows=timeline(p).rows;
  return speechWindows(rows.flatMap(r=>r.voices.map(v=>({...v,from:r.from+v.from}))),p.fps,
    rows.flatMap(r=>r.captionCues.map(c=>({...c,from:r.from+c.from,until:c.until==null?undefined:r.from+c.until}))));
}
export function voiceAssemblyStatus(p) {
  const plan=voiceAssemblyPlan(p), key=keys(p,plan);
  return {signature:plan.signature,narration:plan.ready?cached(key.narration):null,
    mix:plan.ready&&key.mix?cached(key.mix):null};
}
async function render(key,name,args,filters) {
  const found=cached(key);if(found)return found;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    const temp=path.join(data,'exports',randomUUID()+path.extname(name)), filter=temp+'.txt';
    try {
      fs.writeFileSync(filter,filters);
      await exec(ffmpeg.path,['-hide_banner','-loglevel','error',...args,
        '-filter_complex_script',filter,'-map','[out]','-ar','24000',
        ...(name.endsWith('.wav')?['-ac','1','-c:a','pcm_s16le']:['-ac','2','-c:a','libmp3lame','-b:a','192k']),temp],
      {windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});
      const asset={...upload(name,fs.readFileSync(temp)),assemblyKey:key};
      db.prepare('INSERT OR REPLACE INTO voice_assemblies VALUES (?,?)').run(key,JSON.stringify(asset));
      return asset;
    } finally {
      fs.rmSync(temp,{force:true});fs.rmSync(filter,{force:true});
    }
  })();
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}
export async function assembleVoices(p,{kind='narration',signature}={}) {
  if(!['narration','mix'].includes(kind))throw Error('未知音频合成类型');
  const plan=voiceAssemblyPlan(p),key=keys(p,plan);
  if(signature&&signature!==plan.signature)throw conflict('口播段落已变化，请等待同步后再合成');
  if(!plan.ready)throw Error('尚有段落未完成配音，请先生成所有段落配音');
  if(!Number.isFinite(plan.duration)||plan.duration<=0||plan.duration>3600)throw Error('整段音频时长须在一小时以内');
  if(kind==='mix'&&(!key.music||!(key.music.duration>0)))throw Error('请先选择并采用 BGM');
  const takes=plan.segments.flatMap(s=>s.voices).filter(v=>v.asset);
  if(!takes.length)throw Error('当前没有可合成的旁白');
  const args=takes.flatMap(v=>['-i',file(v.asset)]);
  // Equal input lengths keep the bundled FFmpeg's normalization constant.
  const filters=takes.map((v,i)=>`[${i}:a]aresample=24000,aformat=channel_layouts=mono,asetpts=PTS-STARTPTS,adelay=${v.from*1000},apad,atrim=duration=${plan.duration}[v${i}]`);
  filters.push(takes.map((_,i)=>`[v${i}]`).join('')+`amix=inputs=${takes.length}:duration=first:dropout_transition=0,volume=${takes.length}[out]`);
  const narration=await render(key.narration,'完整旁白.wav',args,filters.join(';'));
  if(kind==='mix')await render(key.mix,'BGM与完整旁白.mp3',
    ['-i',file(narration),'-stream_loop','-1','-i',file(key.music)],
    voiceMusicFilter(key.windows,plan.duration));
  return voiceAssemblyStatus(p);
}

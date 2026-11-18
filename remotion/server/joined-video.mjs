import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {data,db,get,jobs,persistJob,conflict} from './store.mjs';
import {probe} from './media.mjs';
import {uid} from '../shared/model.mjs';
import {directorReviewIssues} from '../shared/director-quality.mjs';

export function joinedSignature(rows,variant,final=false) {
  if(!rows.length||rows.some(r=>r.video?.status!=='done'))return null;
  return createHash('sha256').update(JSON.stringify([variant,rows.map(r=>[r.shotId,r.video.id,r.video.evidence?.frames]),...(final?['director-final',rows.map(r=>r.video.review)]:[])])).digest('hex');
}
export function joinedVideoStatus(p,rows,variant,final=false) {
  const signature=joinedSignature(rows,variant,final);
  if(!signature)return null;
  return jobs(p.id).find(j=>j.type==='joined'&&j.signature===signature&&
    (j.status!=='done'||['film.mp4','subtitles.srt'].every(f=>fs.existsSync(path.join(data,'exports',j.id,f)))))||null;
}
const timestamp=ms=>{
  ms=Math.round(ms);
  return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60]
    .map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');
};
const millis=t=>{const [h,m,s,ms]=t.split(/[:,]/).map(Number);return ((h*60+m)*60+s)*1000+ms;};
export function joinSubtitles(parts,fps) {
  const cues=[];let frameOffset=0;
  for(const {text,frames} of parts) {
    const duration=frames/fps*1000;
    for(const block of text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean)) {
      const match=/^\d+\r?\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]+)$/.exec(block);
      if(!match)throw Error('分段字幕格式无效，请重新生成该段视频');
      const from=millis(match[1]),until=millis(match[2]);
      if(until<=from||from<0||until>duration+1)throw Error('分段字幕超出视频时长');
      // Segment SRT timestamps have already been rounded to milliseconds.
      // Recover their source frames before adding the frame offset so the
      // joined SRT rounds once, exactly like the burned-in caption timeline.
      const fromFrame=Math.round(from*fps/1000),untilFrame=Math.min(frames,Math.round(until*fps/1000));
      cues.push(`${cues.length+1}\n${timestamp((frameOffset+fromFrame)*1000/fps)} --> ${timestamp((frameOffset+untilFrame)*1000/fps)}\n${match[3]}`);
    }
    frameOffset+=frames;
  }
  return cues.join('\n\n')+'\n';
}
export function joinVideos(p,rows,variant=p.voice,{final=false}={}) {
  if(!['zh','en'].includes(variant)||p.kind!=='science')throw Error('无效的视频合成请求');
  const signature=joinedSignature(rows,variant,final);
  if(!signature)throw Error('请先生成全部分段视频');
  if(rows.length!==p.shots.length||rows.some((r,i)=>r.shotId!==p.shots[i].id))throw Error('合成段落与当前分镜顺序不一致');
  const quality=rows.map((r,i)=>({shotId:r.shotId,index:i+1,issues:directorReviewIssues(p,r.shotId,r.video.review,r.video.evidence?.frames/p.fps)}));
  if(final&&quality.some(r=>r.issues.length))throw Error(quality.filter(r=>r.issues.length).map(r=>`第 ${r.index} 段：${r.issues.join('；')}`).join('\n'));
  let j;
  db.exec('BEGIN IMMEDIATE');
  try {
    if(get(p.id)?.version!==p.version)throw conflict('内容已更新，请刷新后再合成');
    const existing=joinedVideoStatus(p,rows,variant,final);
    if(existing&&['queued','running','done'].includes(existing.status)){db.exec('COMMIT');return existing;}
    j=persistJob({id:uid(),type:'joined',scope:'joined',owner:process.pid,project:p.id,version:p.version,
      variant,signature,mode:final?'final':'preview',quality,status:'queued',created:new Date().toISOString(),
      segments:rows.map(r=>({shotId:r.shotId,jobId:r.video.id,frames:r.video.evidence.frames}))});
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  Promise.resolve().then(()=>perform(p,j)).catch(e=>persistJob({...j,status:'failed',error:e.message,finished:new Date().toISOString()}));
  return j;
}
async function perform(p,j) {
  const folder=path.join(data,'exports',j.id);fs.mkdirSync(folder,{recursive:true});
  let frameOffset=0;
  const clips=j.segments.map(s=>{
    if(!/^[\da-f-]{36}$/.test(s.jobId)||!Number.isInteger(s.frames)||s.frames<=0)throw Error('分段视频记录无效');
    const file=path.join(data,'exports',s.jobId,'sample.mp4'),meta=probe(file);
    const v=meta.streams.find(x=>x.codec_type==='video'),a=meta.streams.find(x=>x.codec_type==='audio');
    const [n,d]=String(v?.r_frame_rate).split('/').map(Number);
    if(!v||v.codec_name!=='h264'||!a||v.width!==p.width||v.height!==p.height||n/d!==p.fps||Number(v.nb_frames)!==s.frames)
      throw Error('分段视频规格不一致，请更新对应段落');
    const format=JSON.stringify([v.codec_name,v.profile,v.level,v.width,v.height,v.pix_fmt,v.r_frame_rate,v.time_base]);
    const clip={...s,file,format,from:frameOffset,seconds:s.frames/p.fps,
      text:fs.readFileSync(path.join(data,'exports',s.jobId,'subtitles.srt'),'utf8')};
    frameOffset+=s.frames;return clip;
  });
  const duration=frameOffset/p.fps,mp4=path.join(folder,'film.mp4');
  fs.writeFileSync(path.join(folder,'subtitles.srt'),joinSubtitles(clips,p.fps));
  // Packet concatenation requires matching stream parameters, including the
  // container time base. Remotion can produce different time bases for two
  // valid shots. Decode those inputs on their own clocks and use frame indices.
  const copyVideo=clips.every(c=>c.format===clips[0].format);
  const inputs=clips.flatMap(c=>['-i',c.file]);
  if(copyVideo){
    fs.writeFileSync(path.join(folder,'clips.ffconcat'),'ffconcat version 1.0\n'+clips.map(c=>
      `file '../${c.jobId}/sample.mp4'\nduration ${c.seconds.toFixed(9)}`).join('\n')+'\n');
    inputs.unshift('-f','concat','-safe','0','-i','clips.ffconcat');
  }
  const filters=clips.map((c,i)=>{
    const samples=Math.round(c.seconds*48000);
    return `[${i+(copyVideo?1:0)}:a:0]aresample=48000,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=PTS-STARTPTS[a${i}]`;
  });
  filters.push(clips.map((_,i)=>`[a${i}]`).join('')+`concat=n=${clips.length}:v=0:a=1[audio]`);
  if(!copyVideo){
    clips.forEach((c,i)=>filters.push(`[${i}:v:0]trim=end_frame=${c.frames},settb=1/${p.fps},setpts=N,setsar=1,format=yuv420p[v${i}]`));
    filters.push(clips.map((_,i)=>`[v${i}]`).join('')+`concat=n=${clips.length}:v=1:a=0,settb=1/${p.fps},setpts=N[video]`);
  }
  const videoArgs=copyVideo?['-map','0:v:0','-c:v','copy']:
    ['-map','[video]','-c:v','libx264','-preset','veryfast','-crf','16','-r',String(p.fps),'-video_track_timescale',String(p.fps*1000)];
  j.status='running';j.progress=0;persistJob(j);
  await new Promise((resolve,reject)=>{
    const child=spawn(ffmpeg.path,['-hide_banner','-loglevel','error','-y',
      ...inputs,'-filter_complex',filters.join(';'),...videoArgs,
      '-map','[audio]','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
      '-t',String(duration),'-movflags','+faststart','-progress','pipe:1',mp4],
      {cwd:folder,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let error='',buffer='';
    child.stderr.on('data',b=>{error=(error+b).slice(-3000);});
    child.stdout.on('data',b=>{
      buffer+=b;const lines=buffer.split(/\r?\n/);buffer=lines.pop();
      for(const line of lines)if(line.startsWith('out_time_ms=')) {
        const progress=Math.max(0,Math.min(99,Math.floor(Number(line.slice(12))/1000000/duration*100)));
        if(Number.isFinite(progress)&&progress>=j.progress+5){j.progress=progress;persistJob(j);}
      }
    });
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('视频合成失败：'+error)));
  });
  const result=probe(mp4),video=result.streams.find(s=>s.codec_type==='video'),audio=result.streams.find(s=>s.codec_type==='audio');
  if(Number(video?.nb_frames)!==frameOffset||!audio||Math.abs(Number(video.duration)-duration)>1/p.fps||Math.abs(Number(audio.duration)-duration)>.1)
    throw Error('合成后的音画时长校验未通过');
  const evidence={project:p.id,version:p.version,width:p.width,height:p.height,fps:p.fps,frames:frameOffset,duration,audio:true,
    videoMode:copyVideo?'packet-copy':'frame-normalized',reviewStatus:j.mode==='final'?'director-approved':'preview-unreviewed',quality:j.quality,
    segments:clips.map(({shotId,jobId,frames,from,seconds})=>({shotId,jobId,frames,from,seconds})),
    sha256:createHash('sha256').update(fs.readFileSync(mp4)).digest('hex')};
  fs.writeFileSync(path.join(folder,'evidence.json'),JSON.stringify(evidence,null,2));
  persistJob({...j,status:'done',progress:100,output:'/exports/'+j.id+'/',evidence,finished:new Date().toISOString()});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {motionFixture} from './fixtures/motion.mjs';
import {uid} from '../shared/model.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-joined-'));
const store=await import('../server/store.mjs');
const {joinSubtitles,joinVideos,joinedVideoStatus,joinedSignature}=await import('../server/joined-video.mjs');
const {probe}=await import('../server/media.mjs');
test('同帧率 H.264 混用 16k 与 90k 容器时钟可直接合成，各帧按项目时钟连续',async()=>{
  const {p:source}=motionFixture();source.shots.push({...structuredClone(source.shots[0]),id:uid()});
  const p=store.write(source,0),input=path.join(store.root,'examples/sample-generation-ui/test-pipeline.mp4');
  const rows=p.shots.map((s,i)=>{
    const id=uid(),dir=path.join(store.data,'exports',id);fs.mkdirSync(dir);
    const remux=spawnSync(ffmpeg.path,['-v','error','-i',input,'-map','0','-c','copy','-video_track_timescale',String(i?90000:16000),path.join(dir,'sample.mp4')],{windowsHide:true,encoding:'utf8'});
    assert.equal(remux.status,0,remux.stderr);
    fs.writeFileSync(path.join(dir,'subtitles.srt'),`1\n00:00:00,000 --> 00:00:01,000\n段${i+1}\n`);
    return {shotId:s.id,video:{id,status:'done',evidence:{frames:24}}};
  });
  const submitted=joinVideos(p,rows),deadline=Date.now()+30000;let result;
  do{result=store.job(submitted.id);if(!['queued','running'].includes(result.status))break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
  assert.equal(result.status,'done',result.error);
  assert.equal(result.evidence.videoMode,'frame-normalized');
  const file=path.join(store.data,'exports',result.id,'film.mp4');
  const decoded=spawnSync(ffmpeg.path,['-v','error','-i',file,'-map','0:v:0','-f','framecrc','-'],{encoding:'utf8',windowsHide:true});
  assert.equal(decoded.status,0,decoded.stderr);
  assert.deepEqual(decoded.stdout.split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>Number(line.split(',')[2])),Array.from({length:48},(_,i)=>i));
});
test('字幕按累计画面帧偏移，保留分段停顿，不累计容器尾部填充',()=>{
  const text='1\n00:00:00,083 --> 00:00:01,000\n第一行\n第二行\n';
  const result=joinSubtitles([{text,frames:381},{text,frames:258},{text,frames:260}],24);
  assert.match(result,/00:00:15,958 --> 00:00:16,875/);
  assert.match(result,/00:00:26,708 --> 00:00:27,625/);
  assert.match(result,/第一行\n第二行/);
  assert.throws(()=>joinSubtitles([{text:'bad',frames:24}],24),/字幕格式/);
  assert.throws(()=>joinSubtitles([{text,frames:12}],24),/超出视频时长/);
});
test('非整毫秒帧边界先还原帧再合并，避免分段取整产生 1 毫秒漂移',()=>{
  const result=joinSubtitles([
    {text:'',frames:203},
    {text:'1\n00:00:02,958 --> 00:00:05,958\n观察物体\nObserve the object\n',frames:296},
    {text:'1\n00:00:01,208 --> 00:00:05,417\n球体模型\nSphere model\n',frames:792},
  ],24);
  assert.equal(result,'1\n00:00:11,417 --> 00:00:14,417\n观察物体\nObserve the object\n\n2\n00:00:22,000 --> 00:00:26,208\n球体模型\nSphere model\n');
});
test('真实无损拼接保留所有帧和声音，刷新/重复点击复用，换顺序使结果失效',async()=>{
  const {p:source}=motionFixture();source.shots.push({...structuredClone(source.shots[0]),id:uid()});
  const p=store.write(source,0),input=path.join(store.root,'examples/sample-generation-ui/test-pipeline.mp4');
  const rows=p.shots.map((s,i)=>{
    const id=uid(),dir=path.join(store.data,'exports',id);fs.mkdirSync(dir);
    fs.copyFileSync(input,path.join(dir,'sample.mp4'));
    fs.writeFileSync(path.join(dir,'subtitles.srt'),`1\n00:00:00,000 --> 00:00:01,000\n段${i+1}\n`);
    return {shotId:s.id,video:{id,status:'done',evidence:{frames:24}}};
  });
  const first=joinVideos(p,rows),duplicate=joinVideos(p,rows);assert.equal(first.id,duplicate.id);
  assert.throws(()=>joinVideos(p,rows,p.voice,{final:true}),/导演检查/);
  const deadline=Date.now()+30000;let done;
  do{done=store.job(first.id);if(!['queued','running'].includes(done.status))break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
  assert.equal(done.status,'done',done.error);assert.equal(done.evidence.frames,48);assert.equal(done.evidence.duration,4);assert.equal(done.evidence.audio,true);
  assert.equal(done.mode,'preview');assert.equal(done.evidence.reviewStatus,'preview-unreviewed');
  const file=path.join(store.data,'exports',done.id,'film.mp4'),media=probe(file);
  assert.equal(media.streams.find(s=>s.codec_type==='video').nb_frames,'48');
  const hashes=file=>{
    const result=spawnSync(ffmpeg.path,['-v','error','-i',file,'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    return result.stdout.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
  };
  const originals=hashes(input);assert.deepEqual(hashes(file),[...originals,...originals]);
  assert.match(fs.readFileSync(path.join(store.data,'exports',done.id,'subtitles.srt'),'utf8'),/00:00:02,000 --> 00:00:03,000\n段2/);
  assert.equal(joinVideos(p,rows).id,done.id);assert.equal(joinedVideoStatus(p,rows,'zh').id,done.id);
  assert.equal(joinedVideoStatus(p,[...rows].reverse(),'zh'),null);
  assert.notEqual(joinedSignature(rows,'zh'),joinedSignature(rows,'en'));
  assert.throws(()=>joinVideos(p,[{shotId:p.shots[0].id}],p.voice),/先生成全部/);
  store.write({...p,title:'已更新'},p.version);
  assert.throws(()=>joinVideos(p,rows),/内容已更新/);
});

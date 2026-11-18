import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {masterAudio} from '../server/master-audio.mjs';
const run=args=>execFileSync(ffmpeg.path,['-v','error',...args],{windowsHide:true,maxBuffer:8e6});
const pcm=file=>{const b=run(['-i',file,'-ac','1','-ar','16000','-f','f32le','pipe:1']);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
test('无损时间线混音经响度处理和最终 AAC 封装仍保持声音时钟',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-audio-master-')),wave=path.join(dir,'source.wav'),video=path.join(dir,'film.mp4');
  run(['-f','lavfi','-i','aevalsrc=0.08*sin(2*PI*(170*t+45*t*t))+0.04*sin(2*PI*773*t):s=48000:d=3','-c:a','pcm_s16le',wave]);
  const before=fs.readFileSync(wave);
  run(['-f','lavfi','-i','color=c=black:s=96x64:r=24:d=3','-an','-c:v','libx264',video]);
  const report=await masterAudio(video,3,{audioFile:wave}),a=pcm(wave),b=pcm(video);
  let best={score:0,lag:null};
  for(let lag=-800;lag<=800;lag++){let xy=0,xx=0,yy=0;for(let i=1600;i<a.length-1600;i+=5){const x=a[i],y=b[i+lag];xy+=x*y;xx+=x*x;yy+=y*y;}const score=xy/Math.sqrt(xx*yy);if(score>best.score)best={score,lag};}
  assert.ok(best.score>.99,JSON.stringify(best));assert.ok(Math.abs(best.lag)<=1,JSON.stringify(best));
  assert.equal(report.input,'lossless-timeline-mix');assert.ok(Math.abs(report.finalLUFS+16)<.3);assert.deepEqual(fs.readFileSync(wave),before);
});
test('全静音时间线仍导出可解码音轨，不因响度为负无穷丢失音轨',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-silent-master-')),wave=path.join(dir,'silent.wav'),video=path.join(dir,'film.mp4');
  run(['-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1','-c:a','pcm_s16le',wave]);
  run(['-f','lavfi','-i','color=c=black:s=96x64:r=24:d=1','-an','-c:v','libx264',video]);
  const report=await masterAudio(video,1,{audioFile:wave});assert.equal(report.mode,'silent');assert.equal(report.finalLUFS,null);
  const audio=pcm(video);assert.ok(audio.length>=16000);assert.ok(audio.every(x=>x===0));
});

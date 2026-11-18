import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {draft,emptyShot} from '../shared/model.mjs';
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {wave} from '../server/wave.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-assembly-'));
const {data,db}=await import('../server/store.mjs');
const {upload}=await import('../server/media.mjs');
const {assembleVoices,voiceAssemblyStatus}=await import('../server/voice-assembly.mjs');
const audio=(name,value,seconds,metadata={})=>upload(name,wave(new Float32Array(seconds*24000).fill(value),24000),metadata);
function fixture() {
  const p=draft('science');p.fps=24;p.target=null;
  const a=audio('a.wav',.2,.25,{scriptText:'第一段'}),b=audio('b.wav',.4,.25,{scriptText:'第二段'});
  const music={...audio('music.wav',.1,.125),role:'music'};
  p.assets=[a,b,music];p.scienceFlow={bgmId:music.id};
  p.shots=[a,b].map((v,i)=>({...emptyShot(),zh:v.scriptText,seconds:i?.25:.5,transition:'cut',assetIds:[v.id]}));
  return p;
}
function sample(asset,second) {
  const bytes=fs.readFileSync(path.join(data,'uploads',path.basename(asset.src)));
  let offset=12;
  while(bytes.toString('ascii',offset,offset+4)!=='data')offset+=8+bytes.readUInt32LE(offset+4)+(bytes.readUInt32LE(offset+4)%2);
  return bytes.readInt16LE(offset+8+Math.floor(second*24000)*2)/32768;
}
test('完整旁白保留段落顺序、间隔与音量；并发及刷新复用同一文件，BGM 覆盖全长',async()=>{
  const p=fixture(),signature=voiceAssemblyPlan(p).signature;
  const [a,b]=await Promise.all([assembleVoices(p,{signature}),assembleVoices(p,{signature})]);
  assert.equal(a.narration.id,b.narration.id);assert.equal(a.narration.duration,.75);
  assert.ok(Math.abs(sample(a.narration,.1)-.2)<.001);
  assert.equal(sample(a.narration,.35),0);
  assert.ok(Math.abs(sample(a.narration,.6)-.4)<.001);
  assert.equal(voiceAssemblyStatus(p).narration.id,a.narration.id);
  const mixed=await assembleVoices(p,{kind:'mix'});
  assert.ok(Math.abs(mixed.mix.duration-.75)<.1);
  assert.equal(mixed.narration.id,a.narration.id);
  assert.equal((await assembleVoices(p,{kind:'mix'})).mix.id,mixed.mix.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM versions').get().n,0);
});
test('少一段、旧台词、过期签名不可合成；替换音乐只使混音失效',async()=>{
  const p=fixture();await assembleVoices(p,{kind:'mix'});
  const before=voiceAssemblyStatus(p);
  p.scienceFlow.bgmId=null;
  assert.equal(voiceAssemblyStatus(p).narration.id,before.narration.id);
  assert.equal(voiceAssemblyStatus(p).mix,null);
  await assert.rejects(assembleVoices(p,{kind:'mix'}),/BGM/);
  p.shots[1].zh='新的台词';
  assert.equal(voiceAssemblyPlan(p).ready,false);
  assert.equal(voiceAssemblyStatus(p).narration,null);
  await assert.rejects(assembleVoices(p),/尚有段落/);
  await assert.rejects(assembleVoices(p,{signature:before.signature}),/已变化/);
  p.shots[1].zh='第二段';p.shots[1].assetIds=[];
  await assert.rejects(assembleVoices(p),/尚有段落/);
});

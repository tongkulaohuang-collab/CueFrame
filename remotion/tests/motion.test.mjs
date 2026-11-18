import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {motionFixture as legacyMotionFixture} from './fixtures/motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {sampleCreationNeeds} from '../shared/sample-creation.mjs';
import {renderIssues,shotIssues,update} from '../shared/model.mjs';
import {validateMotion,motionAt} from '../shared/motion-plan.mjs';
import {validateMotionResult,motionPrompt} from '../server/motion.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-motion-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
test('已有中文配音与图版即可生成：内部镜头字段和预制视频不作为输入条件',()=>{
  const {p}=motionFixture(),id=p.shots[0].id;
  assert.deepEqual(sampleCreationNeeds(p,id),[]);
  assert.ok(renderIssues(p,id).length>0);
  assert.ok(!shotIssues(p,p.shots[0]).some(e=>/英文/.test(e)));
  assert.ok(shotIssues({...p,captionMode:'bilingual'},p.shots[0]).some(e=>/英文/.test(e)));
  assert.ok(sampleCreationNeeds({...p,assets:[]},id).some(e=>/配音/.test(e)));
  assert.ok(sampleCreationNeeds({...p,claims:[]},id).some(e=>/资料/.test(e)));
});
test('动画允许局部运动与整体缩放；拒绝非法路径、时间和未知依据',()=>{
  const {p,raw}=motionFixture(),j={shotId:p.shots[0].id};
  assert.equal(validateMotionResult(raw,p,j)[0].motionPlan.subjectId,'particle');
  assert.match(motionPrompt(p,j),/不改写旁白/);
  const stationary=structuredClone(raw.motion);
  stationary.nodes[1].frames.forEach(f=>{f.x=100;f.y=100;});
  assert.doesNotThrow(()=>validateMotion(stationary));
  stationary.nodes[1].frames.forEach((f,i)=>{f.scaleX=1+i*.1;f.scaleY=1+i*.1;});
  assert.doesNotThrow(()=>validateMotion(stationary));
  for(const mutate of [m=>m.nodes[0].paths[0].d='<script/>',
    m=>m.nodes[1].frames[1].opacity=0,m=>m.camera[1].time=0,m=>m.nodes[0].paths[0].fill='url(https://example.com)',
    m=>m.annotations[0].nodeId='missing']) {
    const m=structuredClone(raw.motion);mutate(m);assert.throws(()=>validateMotion(m));
  }
  assert.throws(()=>validateMotionResult({...raw,claimIds:['unknown']},p,j));
  const midpoint=motionAt(raw.motion.nodes[1].frames,1);
  assert.equal(midpoint.x,305);
});
test('动画结果沿用已有台词、配音和图版并进入渲染；改动输入使动画重新待生成',async()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0),s=p.shots[0];
  const request=broker.prepare(p,s.id,'motion');
  broker.approve(request.id,async()=>raw);
  while(store.job(request.id).status==='running')await new Promise(r=>setTimeout(r,5));
  assert.equal(store.job(request.id).status,'ready');
  const next=broker.applyJob(request.id);
  assert.deepEqual(next.assets,p.assets);assert.equal(next.shots[0].zh,s.zh);assert.equal(next.shots[0].en,'');
  assert.deepEqual(next.scienceFlow.proofs,p.scienceFlow.proofs);assert.deepEqual(next.claims,p.claims);
  assert.equal(next.shots[0].motionReview,'');assert.deepEqual(next.shots[0].filmQA,[]);
  assert.deepEqual(renderIssues(next,s.id),[]);
  const changed=structuredClone(next);changed.scienceFlow.style='另一种风格';
  assert.match(renderIssues(changed,s.id).join('；'),/重新生成/);
  const saved=update(next,next);assert.deepEqual(renderIssues(saved,s.id),[]);
  assert.throws(()=>broker.approve(request.id),/不能再次提交/);
  const pending=broker.prepare(next,s.id,'motion');broker.approve(pending.id,async()=>raw);
  while(store.job(pending.id).status==='running')await new Promise(r=>setTimeout(r,5));
  store.write({...next,title:'已修改'},next.version);
  assert.throws(()=>broker.applyJob(pending.id),/旧版本/);
});

test('注释生成规范与运行校验共用24字符上限，错误指出具体注释，短来源保留完整动画',()=>{
  const schema=JSON.parse(fs.readFileSync(new URL('../server/motion.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.properties.motion.properties.annotations.items.properties.text.maxLength,24);
  const {raw}=motionFixture(),plan=structuredClone(raw.motion);
  plan.annotations[0].text='OpenStax《Biology 2e》5.2／5.3';
  assert.throws(()=>validateMotion(plan),/第 1 条画面注释太长（27 个字符，最多 24 个）/);
  plan.annotations[0].text='OpenStax 教材';
  assert.equal(validateMotion(plan),plan);
  plan.annotations[0].text='字'.repeat(24);assert.doesNotThrow(()=>validateMotion(plan));
  plan.annotations[0].text='字'.repeat(25);assert.throws(()=>validateMotion(plan),/25 个字符/);
  plan.annotations[0].text='🙂'.repeat(24);assert.doesNotThrow(()=>validateMotion(plan));
  plan.annotations[0].nodeId='missing';assert.throws(()=>validateMotion(plan),/没有对应/);
});

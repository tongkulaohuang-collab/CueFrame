import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture as legacyMotionFixture,explanationScriptFixture} from './fixtures/motion.mjs';
import {compoundMotionFixture} from './fixtures/compound-motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {actionRequirements} from '../shared/director-quality.mjs';
import {checkedMotionDraft,validateMotionResult} from '../server/motion.mjs';
import {uid} from '../shared/model.mjs';

process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-motion-recovery-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const wait=async id=>{
  for(let i=0;i<250;i++){
    const j=store.job(id);
    if(j.status!=='running')return j;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw Error('动画任务未结束');
};
function entrances(){
  const {p,raw}=motionFixture();
  p.scienceFlow.rhythm+='\n• 0｜cueId=design｜对象=陈列区｜动作=分层显现再留读｜形式=reveal\n• 0.5｜cueId=design｜对象=来源条｜动作=上浮落定｜形式=motion';
  explanationScriptFixture(p);
  const [reveal,slide]=actionRequirements(p,p.shots[0].id).slice(1);
  const base=raw.motion.nodes[0].frames[0];
  const frame=(time,y,opacity)=>({...base,time,y,opacity});
  raw.motion.nodes.push({...structuredClone(raw.motion.nodes[0]),id:'display',role:'material',
    frames:[frame(0,180,.65),frame(.25,180,1),frame(2,180,1)]},
    {id:'source',role:'material',paths:[],text:{font:'sans',value:'来源',size:20,weight:400,color:'#fff'},
    frames:[frame(0,180,0),frame(.5,180,0),frame(.55,162,1),frame(.85,160,1),frame(2,160,1)]});
  raw.motion.actionEvidence.push({requirementId:reveal.id,nodeIds:['display'],from:0,until:.4,technique:'reveal',note:'陈列区显现'},
    {requirementId:slide.id,nodeIds:['source'],from:.5,until:1.5,technique:'motion',note:'文字上浮留读'});
  raw.motion.presentation.texts.push({nodeId:'source',role:'source',from:.5,until:2,align:'middle',width:150,lines:['来源']});
  raw.motion.presentation.beats[0].supportIds.push('display','source');
  return {p,raw};
}
function saveDraft(id,name,content) {
  const dir=path.join(store.data,'jobs',id);
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),content);
}
test('同一份动画的两处素材入场能本地完成，完整动作与依据仍需通过原校验',async()=>{
  const {p:input,raw}=entrances(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');
  assert.throws(()=>validateMotionResult(raw,p,j),/所列对象/);
  const original=structuredClone(raw);
  const checked=checkedMotionDraft(raw,p,j);
  assert.equal(checked.adjustments.length,2);assert.deepEqual(raw,original);
  const plan=checked.result[0].motionPlan;
  assert.deepEqual(plan.nodes.find(n=>n.id==='particle'),raw.motion.nodes.find(n=>n.id==='particle'));
  assert.equal(plan.nodes.find(n=>n.id==='source').frames[3].y,160);
  assert.equal(plan.actionEvidence.length,3);
  const noTravel=structuredClone(raw);noTravel.motion.nodes.at(-1).frames.forEach(f=>f.y=180);
  assert.throws(()=>checkedMotionDraft(noTravel,p,j),/所列对象/);
  assert.throws(()=>checkedMotionDraft({...raw,claimIds:[]},p,j),/依据/);
  let submissions=0;
  broker.approve(j.id,async()=>{submissions++;return raw;});
  assert.equal((await wait(j.id)).status,'ready');assert.equal(submissions,1);
  assert.equal(store.job(j.id).localMotionAdjustments.length,2);
});
test('连接中断后读取同一请求的完整回执，未知提交不重发',async()=>{
  const {p:input,raw}=motionFixture(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');
  saveDraft(j.id,'result.json','{"motion":');
  let calls=0;
  broker.approve(j.id,async()=>{
    calls++;saveDraft(j.id,'completed-motion.json',JSON.stringify(raw));
    throw Object.assign(Error('workspace routing discovery failed'),{uncertain:true});
  });
  const done=await wait(j.id);assert.equal(done.status,'ready');assert.equal(calls,1);
  assert.equal(done.recovery.source,'completed-motion.json');assert.equal(done.result[0].motionPlan.duration,2);
  assert.equal(broker.applyJob(j.id).shots[0].zh,p.shots[0].zh);
});
test('重启可从检查快照恢复；保留已编辑版本、未提交请求和仍在运行的工作进程',()=>{
  const {p:input,raw}=entrances(),p=store.write(input,0);
  const seed=(extra={})=>store.persistJob({id:uid(),type:'codex',task:'motion',project:p.id,version:p.version,
    shotId:p.shots[0].id,status:'unknown',error:'原连接中断',...extra});
  const old=seed(),empty=seed(),pending=seed({status:'awaiting'}),activelyWriting=seed({status:'running',workerPid:process.pid});
  saveDraft(old.id,'result.json','{}');saveDraft(old.id,'validation-2.json',JSON.stringify({result:raw,error:'入场不清楚'}));
  for(const j of [pending,activelyWriting])saveDraft(j.id,'result.json',JSON.stringify(raw));
  const newer=store.write({...p,title:'用户新版本'},p.version);
  store.recover(broker.recoverRhythmJob,broker.recoverMotionJob);
  const restored=store.job(old.id);
  assert.equal(restored.status,'ready');assert.equal(restored.recovery.source,'validation-2.json');
  assert.equal(restored.recovery.adjustments.length,2);
  assert.throws(()=>broker.applyJob(old.id),/旧版本/);assert.deepEqual(store.get(p.id),newer);
  assert.equal(store.job(empty.id).status,'unknown');assert.equal(store.job(pending.id).status,'awaiting');
  assert.equal(store.job(activelyWriting.id).status,'running');
  store.recover(broker.recoverRhythmJob,broker.recoverMotionJob);
  assert.deepEqual(store.job(old.id),restored);
});

test('已失败的组合动作从原文件恢复为新回执，不重发、不删除失败原因且重复恢复幂等',()=>{
  const {p:input,raw}=compoundMotionFixture(),p=store.write(input,0);
  const source=store.persistJob({...broker.prepare(p,p.shots[0].id,'motion'),status:'failed',error:'旧版混合动作误报'});
  const bytes=JSON.stringify({result:raw,error:source.error});saveDraft(source.id,'validation-1.json',bytes);
  const recovered=broker.recoverSavedMotion(source.id,p.version);
  assert.equal(recovered.status,'ready');assert.equal(recovered.externalGenerationCalls,0);
  assert.equal(recovered.recovery.source,'validation-1.json');assert.notEqual(recovered.id,source.id);
  assert.deepEqual(store.job(source.id),{...source,recoveryJobId:recovered.id});
  assert.equal(fs.readFileSync(path.join(store.data,'jobs',source.id,'validation-1.json'),'utf8'),bytes);
  assert.deepEqual(broker.recoverSavedMotion(source.id,p.version),recovered);
  const updated=broker.applyJob(recovered.id);assert.equal(updated.version,p.version+1);
  assert.deepEqual(updated.assets,p.assets);assert.deepEqual(updated.shots[0].zh,p.shots[0].zh);
});

test('本地恢复拒绝未知请求、变更版本和真实无效稿，保留全部原记录',()=>{
  for(const mode of ['unknown','changed','invalid']) {
    const {p:input,raw}=compoundMotionFixture(),p=store.write(input,0);
    const source=store.persistJob({...broker.prepare(p,p.shots[0].id,'motion'),status:mode==='unknown'?'unknown':'failed',error:'原原因'});
    if(mode==='invalid')raw.motion.nodes.find(n=>n.id==='compute').frames.forEach(f=>f.draw=.2);
    saveDraft(source.id,'result.json',JSON.stringify(raw));
    if(mode==='changed')store.write({...p,title:'新稿'},p.version);
    assert.throws(()=>broker.recoverSavedMotion(source.id,store.get(p.id).version));
    assert.deepEqual(store.job(source.id),source);
  }
});

test('新组合动作通过正常生成入口一次接收，无修复重试',async()=>{
  const {p:input,raw}=compoundMotionFixture(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');
  let calls=0;broker.approve(j.id,async()=>{calls++;return raw;});
  const done=await wait(j.id);assert.equal(done.status,'ready',done.error);assert.equal(calls,1);
  assert.equal(done.validationAttempts,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture} from './fixtures/motion.mjs';
import {normalizeMotionIds} from '../server/motion-normalize.mjs';
import {checkedMotionDraft} from '../server/motion.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {motionStructureIssues,MOTION_ID_PATTERN} from '../shared/motion-structure.mjs';
import {issueHelp} from '../shared/issue-help.mjs';
import {worldState} from '../shared/actor-rig.mjs';

process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-motion-contract-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const wait=async id=>{for(let i=0;i<250;i++){const j=store.job(id);if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,10));}throw Error('任务未结束');};
function legacy(){
  const {p,raw}=motionFixture({presentation:true});
  const id='particle.cortex';
  // Reproduce the original error across rendering, actor, camera and evidence.
  raw.motion.nodes[1].id=id;raw.motion.subjectId=id;
  raw.motion.cameraShots[0].focusId=id;raw.motion.annotations[0].nodeId=id;
  raw.motion.actionEvidence[0].nodeIds=[id];
  raw.motion.styleEvidence.forEach(e=>e.nodeIds=['channel',id]);
  raw.motion.presentation.beats[0].primaryIds=[id];
  raw.motion.explanationEvidence[0].changes[0].nodeId=id;
  raw.motion.actors[0].rootId=id;raw.motion.actors[0].parts[0].nodeId=id;
  raw.motion.performance.events[0].rootId=id;raw.motion.performance.events[0].coverage[0].nodeId=id;
  raw.visual+=' particle.cortex';
  return {p,raw};
}
test('旧语义式编号经本地转换可通过完整动画检查，世界姿态、时序和原稿不变',()=>{
  const {p,raw}=legacy(),before=structuredClone(raw),checked=checkedMotionDraft(raw,p,{shotId:p.shots[0].id,performanceVersion:1,presentationVersion:1});
  const plan=checked.result[0].motionPlan;
  assert.equal(plan.subjectId,'particle_cortex');assert.equal(checked.adjustments.length,1);
  assert.deepEqual(plan.nodes[1].frames,before.motion.nodes[1].frames);
  assert.deepEqual(plan.nodes[1].paths,before.motion.nodes[1].paths);
  assert.equal(plan.actors[0].id,before.motion.actors[0].id);
  assert.equal(plan.actors[0].parts[0].id,before.motion.actors[0].parts[0].id);
  assert.equal(plan.explanationEvidence[0].changes[0].entity,'粒子');
  for(const t of [0,.3,.8,1,1.2,2])assert.deepEqual(worldState(plan,t).get('particle_cortex').matrix,worldState(before.motion,t).get('particle.cortex').matrix);
  assert.equal(checked.result[0].visual,before.visual);assert.deepEqual(raw,before);
});
test('所有节点引用一起转换，语义实体、文字和部件编号不被误替换',()=>{
  const {raw}=legacy();raw.motion.nodes[0].rig={parentId:'particle.cortex',actorId:'particle.cortex',partId:'particle.cortex'};
  raw.motion.nodes[0].attachments=[{parentId:'particle.cortex'}];raw.motion.nodes[0].text={value:'particle.cortex'};
  raw.motion.layout.connectors=[{id:'particle.cortex',fromId:'particle.cortex',toId:'channel'}];
  raw.motion.sceneDesign={environmentIds:['particle.cortex']};
  raw.motion.performance.events[0].partIds=['particle.cortex'];
  raw.motion.performance.events[0].contacts=[{a:{nodeId:'particle.cortex'},b:{nodeId:'channel'}}];
  raw.motion.explanationEvidence[0].changes[0].entity='particle.cortex';
  raw.effectSelections=[{effectId:'mask',targets:['particle.cortex']}];raw.bindings=[{nodeId:'particle.cortex'}];
  const {raw:r}=normalizeMotionIds(raw);
  assert.equal(r.motion.nodes[0].rig.parentId,'particle_cortex');assert.equal(r.motion.nodes[0].rig.actorId,'particle.cortex');
  assert.equal(r.motion.nodes[0].rig.partId,'particle.cortex');assert.equal(r.motion.nodes[0].text.value,'particle.cortex');
  assert.equal(r.motion.nodes[0].attachments[0].parentId,'particle_cortex');
  assert.equal(r.motion.layout.connectors[0].fromId,'particle_cortex');assert.equal(r.motion.layout.connectors[0].id,'particle.cortex');
  assert.deepEqual(r.motion.sceneDesign.environmentIds,['particle_cortex']);assert.deepEqual(r.effectSelections[0].targets,['particle_cortex']);
  assert.equal(r.bindings[0].nodeId,'particle_cortex');assert.deepEqual(r.motion.performance.events[0].partIds,['particle_cortex']);
  assert.equal(r.motion.performance.events[0].contacts[0].a.nodeId,'particle_cortex');
  assert.equal(r.motion.explanationEvidence[0].changes[0].entity,'particle.cortex');
  assert.equal(normalizeMotionIds(r).adjustments.length,0);
});
test('编号碰撞、重复、恶意字符串、缺失路径和路径超量不被本地兼容吞掉',()=>{
  const {p,raw}=legacy(),job={shotId:p.shots[0].id};
  const collision=structuredClone(raw);collision.motion.nodes.push({...collision.motion.nodes[0],id:'particle_cortex'});
  assert.throws(()=>checkedMotionDraft(collision,p,job),/产生重复/);
  for(const value of [null,'<script>','a/b','a'.repeat(61),'', 'a..b']){
    const copy=structuredClone(raw);copy.motion.nodes[1].id=value;
    assert.throws(()=>checkedMotionDraft(copy,p,job),/nodes\[1\]\.id/);
  }
  const duplicate=structuredClone(raw);duplicate.motion.nodes.push(structuredClone(duplicate.motion.nodes[1]));
  assert.throws(()=>checkedMotionDraft(duplicate,p,job),/重复/);
  const plan=motionFixture().raw.motion;delete plan.nodes[0].paths;
  assert.throws(()=>validateMotion(plan),/nodes\[0\]\.paths.*必须是数组/);
  plan.nodes[0].paths=Array(101).fill({});assert.throws(()=>validateMotion(plan),/101.*100/);
});
test('一次定位多处部件缺项与上游映射，拒绝凭空改父坐标或删除要求',()=>{
  const {p,raw}=motionFixture({presentation:true});
  raw.motion.actors[0].parts.push({id:'channel',nodeId:'channel',replaceable:false});
  raw.motion.performance.events[0].partIds=['channel'];raw.motion.nodes[1].rig=null;
  const original=structuredClone(raw),requirements=p.scienceFlow.referenceScript.performanceRequirements;
  const issues=motionStructureIssues(raw.motion,requirements);
  assert.ok(issues.some(i=>i.message.includes('channel 缺少 rig')));
  assert.ok(issues.some(i=>i.message.includes('particle 缺少 rig')));
  assert.ok(issues.some(i=>i.path.endsWith('.partIds')&&i.message.includes('上游部件')));
  assert.throws(()=>checkedMotionDraft(raw,p,{shotId:p.shots[0].id}),/动画结构校验失败/);assert.deepEqual(raw,original);
  assert.equal(issueHelp('动画主体无效').title,'动画对象与部件数据不一致');
});
test('动画和效果图的生成编号限制与运行时完全一致',()=>{
  for(const name of ['motion','science-frames']){
    const schema=JSON.parse(fs.readFileSync(new URL(`../server/${name}.schema.json`,import.meta.url)));
    const found=[];function visit(s){if(!s||typeof s!=='object')return;for(const [k,v]of Object.entries(s.properties||{}))if(k==='nodes')found.push(v.items.properties.id);for(const v of Object.values(s))if(Array.isArray(v))v.forEach(visit);else visit(v);}visit(schema);
    assert.ok(found.length);for(const id of found){assert.equal(id.pattern,MOTION_ID_PATTERN);assert.equal(id.maxLength,60);assert.equal(new RegExp(id.pattern).test('motor_path.cortex'),false);assert.equal(new RegExp(id.pattern).test('motor_path_cortex'),true);}
  }
});
test('真实任务链兼容旧编号后直接采用，不多发模型请求；原音频与版本保留',async()=>{
  const {p:input,raw}=legacy(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');let calls=0;
  broker.approve(j.id,async()=>{calls++;return raw;});const done=await wait(j.id);
  assert.equal(done.status,'ready');assert.equal(calls,1);assert.equal(done.localMotionAdjustments.length,1);
  const next=broker.applyJob(j.id);assert.deepEqual(next.assets,p.assets);assert.equal(next.shots[0].zh,p.shots[0].zh);assert.deepEqual(store.get(p.id,p.version),p);
});
test('没有进展时停止重复生成，保存完整字段诊断和原结果',async()=>{
  const {p:input,raw}=legacy(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');raw.motion.nodes[1].rig=null;let calls=0;
  broker.approve(j.id,async prompt=>{calls++;if(calls===2){assert.match(prompt,/缺少 rig/);assert.match(prompt,/"issues"/);}return raw;});
  const done=await wait(j.id);assert.equal(done.status,'failed');assert.equal(calls,2);assert.match(done.error,/停止重复生成/);
  assert.ok(done.validationAttempts[1].issues.length);assert.deepEqual(store.get(p.id),p);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(store.data,'jobs',j.id,'result.json'))),raw);
});

test('相机覆盖下限错误带字段和值进入定向修复提示，修正后通过原任务链',async()=>{
 const {p:input,raw}=legacy(),p=store.write(input,0),j=broker.prepare(p,p.shots[0].id,'motion');let calls=0;
 raw.motion.performance.events[0].coverage[0].minPixels=4;
 broker.approve(j.id,async prompt=>{
  calls++;
  if(calls===2){
   assert.match(prompt,/motion\.performance\.events\[0\]\.coverage\[0\]\.minPixels/);
   assert.match(prompt,/minPixels=4/);
   raw.motion.performance.events[0].coverage[0].minPixels=8;
  }
  return structuredClone(raw);
 });
 const done=await wait(j.id);assert.equal(done.status,'ready',done.error);assert.equal(calls,2);
 assert.equal(done.validationAttempts[0].issues[0].path,'motion.performance.events[0].coverage[0].minPixels');
 const failed=JSON.parse(fs.readFileSync(path.join(store.data,'jobs',j.id,'validation-1.json')));
 assert.equal(failed.result.motion.performance.events[0].coverage[0].minPixels,4);
 const next=broker.applyJob(j.id);assert.deepEqual(next.assets,p.assets);assert.deepEqual(store.get(p.id,p.version),p);
});
function failedOriginal(p,raw){
  const j=broker.prepare(p,p.shots[0].id,'motion'),dir=path.join(store.data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(raw));
  return store.persistJob({...j,status:'failed',error:'两次定向修复后仍未通过检查，已保留原视频及失败结果。动画主体无效'});
}
test('历史失败稿重检向界面与修复提示传入当前字段诊断，不重写原回执',()=>{
  const {p:input,raw}=legacy(),p=store.write(input,0);raw.motion.nodes[1].rig=null;
  const original=failedOriginal(p,raw),help=broker.jobHelp(original);
  assert.equal(help.originalError,original.error);assert.match(help.error,/完整清单见技术详情/);
  assert.ok(help.error.length<200);assert.ok(help.motionValidation.issues.some(i=>/缺少 rig/.test(i.message)));
  assert.equal(help.motionValidation.adjustments.length,1);assert.deepEqual(store.job(original.id),original);
  const repair=broker.prepare(p,p.shots[0].id,'motion',{repairOf:original.id});
  assert.match(broker.prompt(p,repair),/"motionValidation"/);assert.match(broker.prompt(p,repair),/缺少 rig/);
});
test('历史稿仅编号不兼容时，修复入口本地恢复，新增生成调用为零',async()=>{
  const {p:input,raw}=legacy(),p=store.write(input,0),original=failedOriginal(p,raw);
  const repair=broker.prepare(p,p.shots[0].id,'motion',{repairOf:original.id});let calls=0;
  broker.approve(repair.id,async()=>{calls++;throw Error('不应生成');});const done=await wait(repair.id);
  assert.equal(done.status,'ready');assert.equal(done.localRecoveryOf,original.id);assert.equal(calls,0);
  broker.applyJob(repair.id);assert.deepEqual(store.job(original.id),original);
});
test('冲突编号无法本地恢复，但明确请求的修复仍可收到原数据与冲突原因',async()=>{
  const {p:input,raw}=legacy(),p=store.write(input,0);
  raw.motion.nodes.push({...raw.motion.nodes[0],id:'particle_cortex'});
  const original=failedOriginal(p,raw),repair=broker.prepare(p,p.shots[0].id,'motion',{repairOf:original.id});
  assert.match(broker.prompt(p,repair),/产生重复/);
});

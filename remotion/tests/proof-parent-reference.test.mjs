import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture} from './fixtures/motion.mjs';
import {compileMotionBindings} from '../shared/motion-bindings.mjs';
import {proofPlan} from '../shared/visual-continuity.mjs';
import {worldState} from '../shared/actor-rig.mjs';
import {checkedProofDraft,sciencePrompt} from '../server/science-ai.mjs';
import {issueHelp} from '../shared/issue-help.mjs';

process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-proof-parent-'));
const store=await import('../server/store.mjs'),broker=await import('../server/codex.mjs');
const wait=async id=>{for(let i=0;i<200;i++){const j=store.job(id);if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,10));}throw Error('Worker did not finish');};
function fixture(version=1) {
  const {p,raw}=motionFixture({presentation:true});
  const node=(id,role)=>({id,role,paths:[{d:'M0 0L40 0L40 30L0 30Z',fill:'#CCAA55',stroke:'none',strokeWidth:0}],text:null,media:null});
  const parentKey=version===2?'parentPartId':'parentId';
  const scene={id:'system',bindingVersion:version,bg:'#080906',subjectId:'motor_path_cortex',
    nodes:[node('motor_path_cortex','subject'),node('motor_path_spinal','mechanism')],
    actors:[{...raw.motion.actors[0],id:'motor_path',rootId:'motor_path_cortex',parts:[
      {id:'cortex',nodeId:'motor_path_cortex',replaceable:false,[parentKey]:null,pivot:{x:4,y:7}},
      {id:'spinal',nodeId:'motor_path_spinal',replaceable:false,[parentKey]:'cortex',pivot:{x:3,y:5}},
    ]}]};
  return {p,raw:{scenes:[scene],frames:[0,.5,1].map(time=>({time,sceneId:'system',caption:'完整系统状态',camera:{x:320,y:180,zoom:1},poses:[
    {id:'motor_path_cortex',x:120,y:80,rotation:22,scaleX:1.2,scaleY:.8,opacity:1},
    {id:'motor_path_spinal',x:30+time*8,y:50,rotation:-12,scaleX:1,scaleY:1,opacity:.75},
  ]}))}};
}
test('旧父部件编号仅在唯一对应时解析；世界位置、旋转、缩放、透明度与标准节点引用完全一致',()=>{
  const {p,raw}=fixture(),original=structuredClone(raw),direct=structuredClone(raw);
  direct.scenes[0].actors[0].parts[1].parentId='motor_path_cortex';
  const resolved=checkedProofDraft(raw,p),canonical=checkedProofDraft(direct,p);
  assert.equal(resolved.adjustments.length,1);assert.equal(resolved.adjustments[0].path,'scenes[0].actors[0].parts[1].parentId');
  assert.deepEqual(resolved.result,canonical.result);assert.deepEqual(raw,original);
  for(let i=0;i<3;i++)for(const time of [0,.5,1])for(const n of raw.scenes[0].nodes)
    assert.deepEqual(worldState(proofPlan(resolved.result[i]),time).get(n.id),worldState(proofPlan(canonical.result[i]),time).get(n.id));
});
test('新 parentPartId 有明确语义，与旧节点及唯一别名结果相同；拒绝错误节点号或双父级字段',()=>{
  const old=fixture(),fresh=fixture(2);assert.deepEqual(checkedProofDraft(fresh.raw,fresh.p).result,checkedProofDraft(old.raw,old.p).result);
  fresh.raw.scenes[0].actors[0].parts[1].parentPartId='motor_path_cortex';
  assert.throws(()=>checkedProofDraft(fresh.raw,fresh.p),/parentPartId 必须引用 parts\[\]\.id/);
  fresh.raw.scenes[0].actors[0].parts[1].parentPartId='cortex';fresh.raw.scenes[0].actors[0].parts[1].parentId='motor_path_cortex';
  assert.throws(()=>checkedProofDraft(fresh.raw,fresh.p),/不能混用/);
  assert.match(sciencePrompt(fresh.p,'proofs'),/bindingVersion=2/);
  assert.match(sciencePrompt(fresh.p,'proofs'),/不是 nodeId/);
});
test('两种编号指向不同节点、其他主体同名节点、缺父、自指、循环与重复部件均拒绝',()=>{
  const {raw}=fixture(),source=raw.scenes[0];
  const ambiguous=structuredClone(source);ambiguous.nodes.push({...ambiguous.nodes[1],id:'cortex'});
  assert.throws(()=>compileMotionBindings(ambiguous),/有歧义/);
  const missing=structuredClone(source);missing.actors[0].parts[1].parentId='missing';assert.throws(()=>compileMotionBindings(missing),/不在本主体内/);
  const self=structuredClone(source);self.actors[0].parts[1].parentId='spinal';assert.throws(()=>compileMotionBindings(self),/自身/);
  const duplicate=structuredClone(source);duplicate.actors[0].parts[1].id='cortex';assert.throws(()=>compileMotionBindings(duplicate),/重复/);
  const cross=structuredClone(source);cross.nodes.push({...cross.nodes[1],id:'foreign'});cross.actors[0].parts[1].parentId='foreign';assert.throws(()=>compileMotionBindings(cross),/跨主体/);
  const cycle=structuredClone(source);cycle.nodes.push({...cycle.nodes[1],id:'terminal'});cycle.actors[0].parts.push({id:'end',nodeId:'terminal',replaceable:false,parentId:'spinal',pivot:{x:0,y:0}});cycle.actors[0].parts[1].parentId='end';assert.throws(()=>compileMotionBindings(cycle),/循环/);
});
test('新效果图一次接收并采用，转换记录可追溯，源数据和配音不变',async()=>{
  const {p:initial,raw}=fixture(),p=store.write(initial,0),j=broker.prepare(p,null,'proofs');let calls=0;
  broker.approve(j.id,async()=>{calls++;return raw;});const ready=await wait(j.id);
  assert.equal(ready.status,'ready');assert.equal(calls,1);assert.equal(ready.localProofAdjustments.length,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(store.data,'jobs',j.id,'result.json'))),raw);
  const next=broker.applyJob(j.id);assert.equal(next.scienceFlow.proofs.length,3);assert.deepEqual(next.assets,p.assets);assert.deepEqual(store.get(p.id,p.version),p);
});
test('已失败图版优先本地恢复，完整验证后采用，模型调用零；历史回执不改写',async()=>{
  const {p:initial,raw}=fixture(),p=store.write(initial,0),original=broker.prepare(p,null,'proofs'),folder=path.join(store.data,'jobs',original.id);
  fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(raw));
  const failed=store.persistJob({...original,status:'failed',error:'动画绑定编译失败：parentId 必须明确本主体内的父对象'});
  const repair=broker.prepare(p,null,'proofs',{repairOf:failed.id});let calls=0;
  broker.approve(repair.id,async()=>{calls++;throw Error('Unexpected generation');});const ready=await wait(repair.id);
  assert.equal(ready.status,'ready');assert.equal(ready.localRecoveryOf,failed.id);assert.equal(calls,0);
  broker.applyJob(repair.id);assert.deepEqual(store.job(failed.id),failed);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder,'result.json'))),raw);
});
test('本地恢复不会吞掉其他设计错误或覆盖并发版本；错误显示针对部件关系的说明',async()=>{
  const {p:initial,raw}=fixture(),p=store.write(initial,0),j=broker.prepare(p,null,'proofs');raw.frames[0].poses.pop();
  broker.approve(j.id,async()=>raw);const failed=await wait(j.id);assert.equal(failed.status,'failed');assert.match(failed.error,/姿态不完整/);assert.deepEqual(store.get(p.id),p);
  store.write({...p,title:'用户的新编辑'},p.version);assert.throws(()=>broker.prepare(store.get(p.id),null,'proofs',{repairOf:failed.id}),/版本已变化/);
  assert.equal(issueHelp('动画绑定编译失败：parentId 无效').title,'动画对象与部件数据不一致');
});

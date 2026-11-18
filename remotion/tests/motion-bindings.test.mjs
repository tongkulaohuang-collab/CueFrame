import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture} from './fixtures/motion.mjs';
import {compileMotionBindings} from '../shared/motion-bindings.mjs';
import {assertActionContract} from '../shared/action-contract.mjs';
import {checkedMotionDraft} from '../server/motion.mjs';
import {worldState} from '../shared/actor-rig.mjs';
import {validateSharedProofs} from '../shared/visual-continuity.mjs';
import {checkedRhythm} from '../server/rhythm-script.mjs';
import {coverageIssues} from '../shared/performance-plan.mjs';

process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-single-binding-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
function generated(raw) {
  const result=structuredClone(raw),m=result.motion;m.bindingVersion=1;
  for(const a of m.actors)for(const p of a.parts){const rig=m.nodes.find(n=>n.id===p.nodeId).rig;p.parentId=rig.parentId;p.pivot=rig.pivot;}
  for(const n of m.nodes)delete n.rig;
  for(const e of m.performance.events){delete e.rootId;delete e.partIds;}
  return result;
}
test('单一绑定表编译节点和事件，完整校验与逐帧世界姿态保持一致',()=>{
  const {p,raw}=motionFixture({presentation:true}),input=generated(raw),before=structuredClone(input);
  const result=checkedMotionDraft(input,p,{shotId:p.shots[0].id,performanceVersion:1,presentationVersion:1}).result[0];
  assert.deepEqual(result.motionPlan.actors,raw.motion.actors);
  assert.deepEqual(result.motionPlan.performance,raw.motion.performance);
  for(let f=0;f<=24;f++)for(const n of raw.motion.nodes)assert.deepEqual(worldState(result.motionPlan,f/12).get(n.id).matrix,worldState(raw.motion,f/12).get(n.id).matrix);
  assert.deepEqual(input,before);
});
test('父坐标由设计明确声明；漏父项、重复部件、跨主体与循环均拒绝',()=>{
  const {raw}=motionFixture({presentation:true}),input=generated(raw).motion;
  const bad=structuredClone(input);delete bad.actors[0].parts[0].parentId;
  assert.throws(()=>compileMotionBindings(bad),/parentId/);
  const duplicate=structuredClone(input);duplicate.actors[0].parts.push({...duplicate.actors[0].parts[0],id:'other'});
  assert.throws(()=>compileMotionBindings(duplicate),/重复/);
  const cross=structuredClone(input);cross.actors[0].parts[0].parentId='channel';assert.throws(()=>compileMotionBindings(cross),/本主体内/);
  const cycle=structuredClone(input),a=cycle.actors[0];
  cycle.nodes.push({...structuredClone(cycle.nodes[0]),id:'branch'});
  a.parts.push({id:'one',nodeId:'channel',replaceable:false,parentId:'branch',pivot:{x:0,y:0}},{id:'two',nodeId:'branch',replaceable:false,parentId:'channel',pivot:{x:0,y:0}});
  assert.throws(()=>compileMotionBindings(cycle),/循环/);
  const noRoot=structuredClone(input);noRoot.actors[0].rootId='missing';assert.throws(()=>compileMotionBindings(noRoot),/rootId/);
});
test('编译不掩盖不存在的上游部件或虚假静态动作',()=>{
  const {p,raw}=motionFixture({presentation:true}),input=generated(raw),requirements=p.scienceFlow.referenceScript.performanceRequirements;
  requirements[0].kind='state';requirements[0].partIds=['missing'];
  assert.throws(()=>checkedMotionDraft(input,p,{shotId:p.shots[0].id}),/缺少要求部件 missing/);
  requirements[0].partIds=['particle'];
  // Root translation is not an internal state change; the old gate still fires.
  assert.throws(()=>checkedMotionDraft(input,p,{shotId:p.shots[0].id}),/没有必要的内部姿态变化/);
});
test('新格式拒绝第二份矛盾绑定，旧格式漏 rig 仍拒绝而不猜父坐标',()=>{
  const {p,raw}=motionFixture({presentation:true}),input=generated(raw);
  input.motion.nodes[1].rig=null;assert.throws(()=>checkedMotionDraft(input,p,{shotId:p.shots[0].id}),/不重复填写 rig/);
  delete input.motion.nodes[1].rig;input.motion.performance.events[0].partIds=['channel'];
  assert.throws(()=>checkedMotionDraft(input,p,{shotId:p.shots[0].id}),/由绑定表编译/);
  raw.motion.nodes[1].rig=null;assert.throws(()=>checkedMotionDraft(raw,p,{shotId:p.shots[0].id}),/缺少 rig/);
});
test('效果图也用相同绑定编译器，保存后的运行数据可正常再读取',()=>{
  const {p,raw}=motionFixture({presentation:true}),m=generated(raw).motion;
  delete m.performance;
  const {nodes,actors,bindingVersion}=m;
  const scenes=[{id:'scene',bg:m.bg,subjectId:m.subjectId,nodes:nodes.map(n=>{const out={...n};delete out.frames;return out;}),actors,bindingVersion}];
  const frames=[0,.5,1].map(time=>({sceneId:'scene',time,caption:'测试构图',camera:{x:320,y:180,zoom:1},poses:raw.motion.nodes.map(n=>({id:n.id,...n.frames[0]}))}));
  const result=validateSharedProofs({scenes,frames},p,2,{mode:'design-guide'});
  assert.equal(result[0].scene.nodes[1].rig.partId,'particle');
  assert.equal(result[0].scene.bindingVersion,undefined);
});
test('动画和图版 schema 均不再要求模型重复输出 rig 或事件映射',()=>{
  for(const name of ['motion','science-frames']) {
    const schema=JSON.parse(fs.readFileSync(new URL('../server/'+name+'.schema.json',import.meta.url)));let count=0;
    function walk(s){if(!s||typeof s!=='object')return;if(s.properties?.nodes&&s.properties.actors){count++;assert.equal(s.properties.bindingVersion.const,2);assert.ok(s.required.includes('bindingVersion'));const parts=s.properties.actors.items.properties.parts.items;assert.ok(parts.required.includes('parentPartId'));assert.equal(parts.properties.parentId,undefined);assert.ok(parts.required.includes('pivot'));assert.equal(s.properties.nodes.items.properties.rig,undefined);const event=s.properties.performance?.properties.events.items;if(event){assert.equal(event.properties.partIds,undefined);assert.equal(event.properties.rootId,undefined);}}for(const v of Object.values(s))if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(schema);assert.ok(count);
  }
});
test('显现冒充唯一机制变化在节奏采用及动画请求前阻止；正常揭示合法',()=>{
  const {p}=motionFixture({presentation:true});
  p.scienceFlow.rhythm='• 0–2｜cueId=speech-zh-0｜eventId=process-0｜对象=粒子｜动作=固定膜段改变局部形状｜形式=reveal';
  assert.throws(()=>assertActionContract(p),/契约冲突/);
  assert.throws(()=>broker.prepare(p,p.shots[0].id,'motion'),/契约冲突/);
  assert.throws(()=>checkedRhythm({text:p.scienceFlow.rhythm,referenceApplications:[],explanationBeats:p.scienceFlow.referenceScript.explanationBeats},p),/契约冲突/);
  p.scienceFlow.referenceScript.explanationBeats[0].intent='reveal';assert.doesNotThrow(()=>assertActionContract(p));
  p.scienceFlow.referenceScript.explanationBeats[0].intent='change';p.scienceFlow.rhythm=p.scienceFlow.rhythm.replace('形式=reveal','形式=motion');assert.doesNotThrow(()=>assertActionContract(p));
});
test('真实任务新格式一次接收并保存，不追加修复调用；诊断不误报漏 rig',async()=>{
  const {p:initial,raw}=motionFixture({presentation:true}),p=store.write(initial,0),input=generated(raw),j=broker.prepare(p,p.shots[0].id,'motion');let calls=0;
  broker.approve(j.id,async()=>{calls++;return input;});
  let done;for(let i=0;i<200;i++){done=store.job(j.id);if(done.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(done.status,'ready');assert.equal(calls,1);
  const next=broker.applyJob(j.id);assert.equal(store.get(p.id).shots[0].motionPlan.nodes[1].rig.partId,'particle');assert.deepEqual(next.assets,p.assets);
  const dir=path.join(store.data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(input));
  assert.equal(broker.jobHelp({...j,status:'failed',error:'其他错误'}).motionValidation,undefined);
});
test('同一节点的整体和细节观察区域分别实测，不互相覆盖尺寸与裁切结果',()=>{
  const {raw}=motionFixture({presentation:true}),plan=raw.motion;
  const whole={nodeId:'particle',x:-12,y:-12,width:24,height:24,minPixels:20},detail={nodeId:'particle',x:-4,y:-4,width:8,height:8,minPixels:8};
  const event={from:0,until:2,coverage:[whole,detail]};
  const measured=new Map([[whole,{x:300,y:150,width:24,height:24,opacity:1}],[detail,{x:310,y:160,width:8,height:8,opacity:1}]]);
  assert.deepEqual(coverageIssues(plan,event,1,measured),[]);
  measured.set(detail,{x:310,y:160,width:8,height:8,opacity:1,clipped:true});assert.equal(coverageIssues(plan,event,1,measured).length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture} from './fixtures/motion.mjs';
import {validateScienceResult,sciencePrompt} from '../server/science-ai.mjs';
import {motionPrompt,validateMotionResult} from '../server/motion.mjs';
import {visualReference,visualContract,inheritVisuals,needsVisualScopeUpdate} from '../shared/visual-continuity.mjs';
import {motionAt} from '../shared/motion-plan.mjs';

function setup(later=false) {
  const {p,raw}=motionFixture();p.fps=20;
  raw.motion.styleEvidence.forEach(e=>e.nodeIds=['particle']);
  if(later)p.shots.push({...structuredClone(p.shots[0]),id:'later'});
  p.scienceFlow.proofs=validateScienceResult({
    scene:{bg:raw.motion.bg,subjectId:raw.motion.subjectId,nodes:raw.motion.nodes.map(({id,paths})=>({id,paths}))},
    frames:[.25,1,1.75].map(time=>({time:time+(later?2:0),caption:'粒子通过通道',camera:{x:320,y:180,zoom:1},
      poses:raw.motion.nodes.map(n=>({id:n.id,...motionAt(n.frames,time)}))})),
  },p,'proofs').map(f=>({...f,constraintMode:'legacy-anchors'}));
  return {p,raw};
}
function extra(motion,id='scale') {
  return {id,role:'mechanism',paths:[{d:'M -30 0 L 30 0 L 0 30 Z',fill:'#7deded',stroke:'#d7ffff',strokeWidth:2}],
    frames:[0,.5,1.5,2].map(time=>({time,x:140+time*10,y:250,rotation:0,scaleX:1,scaleY:1,opacity:1}))};
}

test('后段效果图不锁住开场：可省略无关对象并新增秤，复用角色仍保持原设计',()=>{
  const {p,raw}=setup(true),before=structuredClone(p.scienceFlow.proofs);
  raw.motion.nodes=raw.motion.nodes.filter(n=>n.id==='particle');
  raw.motion.nodes[0].paths[0].fill='#ff0000';
  raw.motion.nodes.push(extra(raw.motion));
  raw.motion.bg='#ffffff';raw.motion.camera.forEach(f=>{f.zoom=1.5;});
  const plan=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;
  assert.deepEqual(plan.nodes.map(n=>n.id),['particle','scale']);
  assert.deepEqual(plan.nodes[0].paths,before[0].scene.nodes.find(n=>n.id==='particle').paths);
  assert.equal(plan.bg,'#ffffff');assert.equal(plan.camera[0].zoom,1.5);
  assert.deepEqual(plan.nodes[1],raw.motion.nodes[1]);
  assert.deepEqual(plan.visualLock.proofTimes,[]);
  assert.deepEqual(p.scienceFlow.proofs,before);
  const prompt=motionPrompt(p,{shotId:p.shots[0].id}),context=JSON.parse(prompt.split('\n').at(-1));
  assert.equal(context.visualLock,null);assert.ok(context.visualReference.scene.nodes.length);
  assert.match(prompt,/按节奏脚本新增/);assert.match(prompt,/历史限制，本次已取消/);
  assert.doesNotMatch(prompt,/不增删或重画对象/);
  assert.match(sciencePrompt(p,'proofs'),/其他镜头可按脚本新增对象/);
});

test('新增对象在图版时刻保持连续可见，原有对象构图仍完全继承',()=>{
  const {p,raw}=setup(),added=extra(raw.motion);
  raw.motion.nodes=[raw.motion.nodes[1],added,raw.motion.nodes[0]];
  const plan=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;
  assert.deepEqual(plan.nodes.map(n=>n.id),['channel','scale','particle']);
  for(const f of p.scienceFlow.proofs){
    for(const expected of f.scene.poses){
      const at=motionAt(plan.nodes.find(n=>n.id===expected.id).frames,f.time);
      for(const key of ['x','y','rotation','scaleX','scaleY','opacity'])assert.equal(at[key],expected[key]);
    }
    assert.equal(motionAt(plan.nodes.find(n=>n.id==='scale').frames,f.time).opacity,1);
    assert.equal(motionAt(plan.camera,f.time).zoom,f.scene.camera.zoom);
  }
  assert.equal(motionAt(plan.nodes.find(n=>n.id==='scale').frames,.5).opacity,1);
  const missing=structuredClone(raw);missing.motion.nodes=missing.motion.nodes.filter(n=>n.id!=='channel');
  assert.throws(()=>validateMotionResult(missing,p,{shotId:p.shots[0].id}),/缺少图中可见对象：channel/);
});

test('图版中始终隐藏的占位对象不强制保留；保留时仍在图版时刻隐藏',()=>{
  const {p,raw}=setup();
  for(const f of p.scienceFlow.proofs)f.scene.poses.find(n=>n.id==='channel').opacity=0;
  raw.motion.nodes=raw.motion.nodes.filter(n=>n.id==='particle');
  const plan=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;
  assert.deepEqual(plan.nodes.map(n=>n.id),['particle']);
  assert.deepEqual(plan.visualLock.requiredNodeIds,['particle']);
  raw.motion.nodes.push({...extra(raw.motion,'channel')});
  const kept=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;
  assert.equal(motionAt(kept.nodes.find(n=>n.id==='channel').frames,.25).opacity,0);
});

test('切点上的效果图只属于后一镜，跨语种较长配音不会夺取后镜图版',()=>{
  const {p,raw}=setup(true);
  p.scienceFlow.proofs[0].time=2;
  assert.equal(visualContract(p.scienceFlow.proofs,0,2),null);
  const contract=visualContract(p.scienceFlow.proofs,2,2);
  assert.equal(contract.anchors[0].time,0);
  p.language='separate';
  p.assets.push({...p.assets[0],id:'english',role:'en',duration:3});
  for(const s of p.shots){s.en='Test narration';s.assetIds.push('english');}
  const context=JSON.parse(motionPrompt(p,{shotId:p.shots[0].id}).split('\n').at(-1));
  assert.equal(context.duration,3);assert.equal(context.visualLock,null);
  raw.motion.duration=3;
  raw.motion.cameraShots[0].until=3;
  for(const n of raw.motion.nodes)n.frames.at(-1).time=3;
  raw.motion.camera.at(-1).time=3;
  raw.motion.nodes=raw.motion.nodes.filter(n=>n.id==='particle');
  assert.deepEqual(validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan.visualLock.proofTimes,[]);
});

test('相邻镜头节点集合可以不同，旧版锁定元数据只接续共有角色，不删新增对象',()=>{
  const {p,raw}=setup(true),reference=visualReference(p.scienceFlow.proofs);
  const previous=structuredClone(raw.motion),next=structuredClone(raw.motion);
  previous.visualLock={version:1,key:reference.key};next.visualLock={version:1,key:reference.key};
  raw.motion.nodes=raw.motion.nodes.filter(n=>n.id==='particle');raw.motion.nodes.push(extra(raw.motion));
  const before=structuredClone(raw.motion.nodes[1]);
  const plan=inheritVisuals(raw.motion,null,previous,next,reference);
  assert.deepEqual(plan.nodes.map(n=>n.id),['particle','scale']);
  assert.equal(plan.nodes[0].frames[0].x,previous.nodes[1].frames.at(-1).x);
  assert.equal(plan.nodes[0].frames.at(-1).x,next.nodes[1].frames[0].x);
  assert.deepEqual(plan.nodes[1],before);
});

test('无对应效果图时可选择本镜的新主角，不被其他镜头主体和相机强制覆盖',()=>{
  const {p,raw}=setup(true),reference=visualReference(p.scienceFlow.proofs);
  const previous=structuredClone(raw.motion);previous.visualLock={key:reference.key};
  raw.motion.nodes=[extra(raw.motion,'falling-object')];raw.motion.subjectId='falling-object';raw.motion.annotations=[];
  raw.motion.cameraShots[0].focusId='falling-object';
  raw.motion.camera.forEach(f=>{f.zoom=2;});
  const plan=inheritVisuals(raw.motion,null,previous,null,reference);
  assert.equal(plan.subjectId,'falling-object');assert.equal(plan.camera[0].zoom,2);
  assert.deepEqual(plan.visualLock.anchorTimes,[]);
});

test('开放素材集合仍拒绝新增对象的脚本路径、外部 URL 和非法运动数据',()=>{
  const {p,raw}=setup(true);raw.motion.nodes.push(extra(raw.motion));
  for(const change of [n=>n.paths[0].d='<script/>',n=>n.paths[0].fill='url(https://example.com)',n=>n.frames[1].time=-1]){
    const invalid=structuredClone(raw);change(invalid.motion.nodes.at(-1));
    assert.throws(()=>validateMotionResult(invalid,p,{shotId:p.shots[0].id}));
  }
});

test('旧素材锁定的样镜需重新设计，已有录像仍保留，新规则结果无需再次升级',()=>{
  const {p,raw}=setup(true),s=p.shots[0];
  s.motionPlan={...structuredClone(raw.motion),visualLock:{version:1,key:'legacy'}};
  const before=JSON.stringify(p);
  assert.equal(needsVisualScopeUpdate(p,s.id),true);
  assert.equal(JSON.stringify(p),before);
  s.motionPlan=validateMotionResult(raw,p,{shotId:s.id})[0].motionPlan;
  assert.equal(needsVisualScopeUpdate(p,s.id),false);
  delete s.motionPlan;assert.equal(needsVisualScopeUpdate(p,s.id),false);
  assert.equal(needsVisualScopeUpdate(p,'missing'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {compoundMotionFixture} from './fixtures/compound-motion.mjs';
import {checkedMotionDraft,motionPrompt} from '../server/motion.mjs';
import {designReport,validateDesignEvidence} from '../shared/director-quality.mjs';

test('同一 state 动作按真实部件与阶段核对，不强迫接收、计算和结果使用相同形式',()=>{
  const {p,raw}=compoundMotionFixture(),before=structuredClone(raw),j={shotId:p.shots[0].id};
  for(const technique of ['motion','draw','reveal']) {
    raw.motion.actionEvidence[0].technique=technique;
    const plan=checkedMotionDraft(raw,p,j).result[0].motionPlan;
    const report=designReport(p,j.shotId,plan);
    assert.deepEqual(report.issues,[]);
    assert.deepEqual(report.actions[0].stages.map(s=>s.technique),['draw','draw','reveal']);
    assert.equal(report.actions[0].validationMode,'verified-state-stages');
    assert.deepEqual(raw.motion.nodes,before.motion.nodes,'无需追加无意义移动或修改原关键帧');
  }
  assert.match(motionPrompt(p,j),/一条动作只保留一条 actionEvidence/);
});

test('混合动作不能用注释、伪造前后值、遗漏部件、装饰、隐藏结果或提前显示过关',()=>{
  const edits=[
    m=>m.nodes.find(n=>n.id==='compute').frames.forEach(f=>f.draw=.2),
    m=>m.explanationEvidence[1].changes[0].from=.9,
    m=>m.actionEvidence[0].nodeIds.pop(),
    m=>m.nodes.find(n=>n.id==='compute').role='decoration',
    m=>m.nodes.find(n=>n.id==='result').frames.forEach(f=>f.opacity=0),
    m=>m.nodes.find(n=>n.id==='result').frames.forEach(f=>f.opacity=1),
    m=>m.actionEvidence[0].until=1,
    m=>m.performance.events[0].coverage.find(c=>c.nodeId==='result').minPixels=100,
    m=>m.actionEvidence[0].technique='hold',
  ];
  for(const edit of edits){const {p,raw}=compoundMotionFixture();edit(raw.motion);assert.throws(()=>checkedMotionDraft(raw,p,{shotId:p.shots[0].id}));}
});

test('仅修改类别或说明不能启用组合通道，显现仍不能代替机制',()=>{
  for(const edit of [
    (p,m)=>{p.scienceFlow.referenceScript.performanceRequirements[0].kind='rigid';},
    (p,m)=>{p.scienceFlow.referenceScript.explanationBeats=[];m.explanationEvidence=[];},
    (p,m)=>{m.explanationEvidence[0].changes[0]={entity:'receiver',nodeId:'receiver',property:'opacity',from:1,to:1};},
    (p,m)=>{p.scienceFlow.rhythm=p.scienceFlow.rhythm.replace('形式=motion','形式=draw');},
  ]){const {p,raw}=compoundMotionFixture();edit(p,raw.motion);assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id));}
});

test('重复记录与真实缺动作返回可修复的字段、节点和预期形式',()=>{
  const {p,raw}=compoundMotionFixture();raw.motion.actionEvidence.push(structuredClone(raw.motion.actionEvidence[0]));
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),e=>e.issues.some(i=>i.path==='motion.actionEvidence[1].requirementId'));
  raw.motion.actionEvidence.pop();p.scienceFlow.referenceScript.performanceRequirements[0].kind='rigid';
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),e=>e.issues.some(i=>i.path==='motion.actionEvidence[0].nodeIds'&&/compute.*motion/.test(i.message)));
  raw.motion.actionEvidence[0].technique='draw';
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),e=>e.issues.some(i=>i.path.endsWith('.technique')&&/motion.*draw/.test(i.message)));
});

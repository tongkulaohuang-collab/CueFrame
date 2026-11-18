import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {storageRuntime} from '../server/runtime.mjs';
import {draft,emptyShot} from '../shared/model.mjs';
import {proofsReady,retainScienceFlow} from '../shared/science-flow.mjs';
import {workflowStages} from '../shared/workflow-status.mjs';
import {contentGraph,repairPlan} from '../shared/content-contract.mjs';
import {compileSemanticScene,evaluateSemanticScene,semanticFamilies,semanticStyles,validateSemanticBinding} from '../shared/semantic-scenes.mjs';
import {semanticCase,semanticAssets} from './fixtures/semantic-cases.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {graphicsState} from '../shared/graphics-state.mjs';
import {actionRequirements,designReport,directorReviewIssues} from '../shared/director-quality.mjs';
import {sampleReviewRecord} from '../shared/sample-review.mjs';
import {reviseSegment} from '../server/segments.mjs';
import {motionFixture,explanationFixture} from './fixtures/motion.mjs';
import {validateExplanationBeats,validateExplanationEvidence} from '../shared/explanation-plan.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {sampleCreationNeeds} from '../shared/sample-creation.mjs';
import {parseAudioSilences} from '../server/audio-continuity.mjs';

test('test storage cannot resolve to production and workers inherit isolation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-root-'));
  try{
    assert.throws(()=>storageRuntime(root,{FRAMEBOARD_ENV:'test',FRAMEBOARD_DATA:path.join(root,'data','child')}),/正式 data/);
    const env={NODE_TEST_CONTEXT:'child-v8'},r=storageRuntime(root,env);
    assert.equal(r.environment,'test');assert.equal(env.FRAMEBOARD_DATA,r.data);
    assert.equal(storageRuntime(root,env).data,r.data);
    fs.rmSync(r.data,{recursive:true,force:true});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('old proofs and done renders cannot complete invalid current upstream stages',()=>{
  const p={...draft('science'),topic:'旧主题',version:7,scienceFlow:{proofs:[{time:0},{time:1},{time:2}],proofVersion:2,rhythm:'旧脚本'},shots:[emptyShot()]};
  assert.equal(proofsReady(p),false);
  const states=workflowStages(p,[{project:p.id,scope:'shot',version:7,status:'done'}]);
  assert.equal(states[6].state,'outdated');assert.equal(states[2].ready,false);
  const next=structuredClone(p);next.topic='新主题';retainScienceFlow(p,next);
  assert.equal(next.scienceFlow.artifactHistory[0].version,7);
  assert.deepEqual(next.scienceFlow.artifactHistory[0].proofs,p.scienceFlow.proofs);
  assert.equal(next.scienceFlow.proofs,undefined);
});
test('changing one visual keeps both recordings and identifies only affected segment',()=>{
  const before={...draft('science'),shots:[{...emptyShot(),id:'one'},{...emptyShot(),id:'two'}]},after=structuredClone(before);
  after.shots[0].visual='不同的构图';
  const plan=repairPlan(before,after);
  assert.equal(plan[0].preserveAudio,true);assert.ok(plan[0].stages.includes('动画'));assert.deepEqual(plan[1].stages,[]);
});
test('a completed joined preview marks the video step current only for its project, version and voice',()=>{
  const {p}=motionFixture();
  p.productionMode='model-process';p.version=4;p.voice='zh';p.shots[0].semanticScene=semanticCase('ratio');
  const job={type:'joined',scope:'joined',status:'done',project:p.id,version:4,variant:'zh'};
  assert.equal(workflowStages(p,[job])[3].state,'current');
  assert.equal(workflowStages(p,[{...job,version:3}])[3].state,'outdated');
  for(const difference of [{variant:'en'},{project:'another'},{status:'running'}])
    assert.equal(workflowStages(p,[{...job,...difference}])[3].state,'pending');
});
test('explicit event identity survives rewriting action prose',()=>{
  const p={...draft('science'),shots:[{...emptyShot(),id:'one',seconds:6}],scienceFlow:{rhythm:'• 0–4｜cueId=design｜eventId=transfer｜对象=水量｜动作=从甲到乙｜形式=motion'}};
  const id=actionRequirements(p,'one')[0].id;
  p.scienceFlow.rhythm=p.scienceFlow.rhythm.replace('从甲到乙','先看甲，再跟随水量进入乙');
  assert.equal(actionRequirements(p,'one')[0].id,id);
  assert.equal(contentGraph(p).version,1);
});
for(const family of semanticFamilies)for(const variant of [0,1])for(const style of Object.keys(semanticStyles))test(`model ${family.id} / dataset ${variant+1} / ${style}`,()=>{
  const scene=semanticCase(family.id,variant,style),options={width:variant?720:960,height:variant?960:540,duration:6,fps:24,assets:semanticAssets};
  const a=compileSemanticScene(scene,options),b=compileSemanticScene(scene,options);
  assert.deepEqual(a,b);assert.doesNotThrow(()=>validateMotion(a));
  assert.doesNotThrow(()=>validateSemanticBinding(a,scene,options));
  const corrupted=structuredClone(a);corrupted.nodes[0].text.value='伪造的结论';
  assert.throws(()=>validateSemanticBinding(corrupted,scene,options),/被改写/);
  for(let frame=0;frame<144;frame++)for(const n of a.nodes){const state=graphicsState(n,frame/24,a);assert.ok(Number.isFinite(state.opacity));assert.ok(state.paths.every(v=>!v.d.includes('NaN')));}
});
test('bar geometry and number agree throughout animation, not only at endpoints',()=>{
  const scene=semanticCase('comparison'),plan=compileSemanticScene(scene),max=Math.max(...scene.items.flatMap(v=>[v.value,v.to]));
  for(let frame=0;frame<144;frame++){
    const t=frame/24,bar=graphicsState(plan.nodes.find(n=>n.id==='sem-entity-0'),t,plan),label=graphicsState(plan.nodes.find(n=>n.id==='sem-value-entity-0'),t,plan);
    const coords=bar.paths[0].d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
    const value=coords[2]/(plan.width*.48)*max;
    assert.ok(Math.abs(value-Number(label.value))<=.051,`${t}s: ${value} vs ${label.value}`);
  }
});
test('models enforce conservation, graph integrity and actual random outcomes',()=>{
  const p=semanticCase('proportion'),v=evaluateSemanticScene(p);assert.ok(Math.abs(v.shares.reduce((a,b)=>a+b,0)-1)<1e-12);
  const ratio=semanticCase('ratio');ratio.items[1].value=0;assert.throws(()=>evaluateSemanticScene(ratio),/分母/);
  const graph=semanticCase('causal');graph.edges.push({from:'entity-2',to:'entity-0'});assert.throws(()=>evaluateSemanticScene(graph),/循环/);
  const sample=semanticCase('probability'),out=evaluateSemanticScene(sample);assert.equal(out.successes,out.outcomes.filter(Boolean).length);assert.equal(out.frequency,out.successes/sample.parameters.count);
  const opt=evaluateSemanticScene(semanticCase('optimization'));assert.ok(opt.losses.every((v,i)=>i===0||v<opt.losses[i-1]));
});
test('model route reaches production scene with original narration and no AI proof gate',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0],voices=sceneProps(p,s.id).voices,assets=structuredClone(p.assets);
  Object.assign(s,{title:raw.title,purpose:raw.purpose,visual:raw.visual,continuity:raw.continuity,claimIds:raw.claimIds});
  p.productionMode='model-process';s.semanticScene=semanticCase('comparison');p.scienceFlow={};
  const props=sceneProps(p,s.id);
  assert.equal(props.shot.motionPlan.semanticModel.family,'comparison');assert.deepEqual(props.voices,voices);assert.deepEqual(p.assets,assets);
  assert.deepEqual(sampleCreationNeeds(p,s.id),[]);
  p.claims[0].verified=false;assert.ok(sampleCreationNeeds(p,s.id).length>0);
});
test('causal dependencies may cross shots but cannot point back from future events',()=>{
 const {p}=motionFixture();p.shots.push({...structuredClone(p.shots[0]),id:'later'});
 const beats=explanationFixture(p);beats[1].dependsOn=[beats[0].id];
 assert.doesNotThrow(()=>validateExplanationBeats(beats,p));beats[0].dependsOn=[beats[1].id];assert.throws(()=>validateExplanationBeats(beats,p),/因果顺序/);
});
test('silence measurements retain natural pauses as review candidates',()=>{
 assert.deepEqual(parseAudioSilences('silence_start: 1.25\nsilence_end: 2.0\nsilence_start: 4',5),[{from:1.25,until:2},{from:4,until:5}]);
});
test('model review requires continuous viewing and explicit checks without AI script prerequisites',()=>{
 const {p}=motionFixture(),s=p.shots[0];p.productionMode='model-process';p.version=1;s.semanticScene=semanticCase('comparison');p.scienceFlow={};
 const report=designReport(p,s.id);assert.deepEqual(report.issues,[]);assert.equal(report.mode,'content-model');
 const job={type:'render',scope:'shot',status:'done',output:'/test/',project:p.id,version:p.version,shotId:s.id,evidence:{frames:24}};
 const input={version:1,decision:'approved',time:2};
 assert.throws(()=>sampleReviewRecord(job,p,input),/正常速度|实际听完/);
 Object.assign(input,{watched:[[0,2]],actions:report.requirements.map(r=>r.id),audioChecked:true,styleChecked:true,captionsChecked:true});
 const review=sampleReviewRecord(job,p,input);assert.deepEqual(directorReviewIssues(p,s.id,review,2),[]);
 s.semanticScene.items[0].value+=1;assert.ok(directorReviewIssues(p,s.id,review,2).length);
 assert.throws(()=>reviseSegment(p,job,'visual','http://localhost'),/内容组件/);
 s.semanticScene.items[0].value=-1;assert.equal(workflowStages(p)[1].ready,false);
});
test('morph evidence identifies the changing path instead of always reading path zero',()=>{
 const plan=compileSemanticScene(semanticCase('comparison')),node=plan.nodes.find(n=>n.id==='sem-entity-0');
 const changing=structuredClone(node.graphics.morphs[0]);changing.pathIndex=1;
 node.paths.push({...node.paths[0]});node.graphics.morphs[0].frames.forEach(f=>f.value=0);node.graphics.morphs.push(changing);
 const beat={id:'change-bar',from:0,until:6,intent:'change',entities:['数据条']};
 plan.explanationEvidence=[{beatId:beat.id,resultAt:6,changes:[{entity:'数据条',nodeId:node.id,property:'morph',pathIndex:1,from:0,to:1}]}];
 assert.doesNotThrow(()=>validateExplanationEvidence(plan,[beat]));
 plan.explanationEvidence[0].changes[0].pathIndex=0;
 assert.throws(()=>validateExplanationEvidence(plan,[beat]),/状态.*不符/);
});

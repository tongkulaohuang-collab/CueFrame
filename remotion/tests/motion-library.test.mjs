import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryItems,effects,templates,defaultParams,validateParams} from '../shared/motion-library.mjs';
import {demoFor,templatePlan,compileEffects} from '../shared/library-compiler.mjs';
import {libraryProject} from '../shared/library-project.mjs';
import {validateMotion,motionAt} from '../shared/motion-plan.mjs';
import {draft,emptyShot,update,timeline} from '../shared/model.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {segmentFingerprint} from '../server/segment-fingerprint.mjs';
const project=()=>({...draft(),topic:'隔离动效测试',shots:[{...emptyShot(),id:'shot-a',title:'示例镜头',silentOK:true}]});
const applyTemplate=(p,id='mechanism')=>libraryProject(p,{shotId:p.shots[0].id,action:'template',itemId:id,params:defaultParams(id)}).project;
test('21 个动效与 4 个模板在横竖画幅和短时长均可验证',()=>{
  assert.equal(effects.length,21);assert.equal(templates.length,4);
  for(const [width,height] of [[960,540],[540,960],[160,160]])for(const item of libraryItems){
    const {plan}=demoFor(item.id,defaultParams(item.id),{width,height});validateMotion(plan);
  }
  for(const item of templates)validateMotion(templatePlan(item.id,defaultParams(item.id),{duration:.25,preview:true}));
});
test('模板应用、实际对象动效与撤销保留声音和字幕',()=>{
  const p=project();p.shots[0].subtitleTracks={zh:[{from:0,until:2,text:'测试字幕'}]};
  let next=applyTemplate(p);const base=structuredClone(next.shots[0].motionPlan),audioBefore=timeline(next);
  const body={shotId:'shot-a',action:'effect',itemId:'arc',targets:['subject'],params:{...defaultParams('arc'),x0:15,x1:85,until:5}};
  next=libraryProject(next,body).project;
  assert.equal(next.shots[0].motionLibrary.instances.length,1);assert.deepEqual(next.shots[0].subtitleTracks,p.shots[0].subtitleTracks);
  assert.equal(timeline(next).frames,audioBefore.frames);
  const n=next.shots[0].motionPlan.nodes.find(n=>n.id==='subject');assert.ok(motionAt(n.frames,2.5).y<next.height*.45);
  const restored=libraryProject(next,{shotId:'shot-a',action:'remove',instanceId:next.shots[0].motionLibrary.instances[0].instanceId}).project;
  delete base.inputs;const after=structuredClone(restored.shots[0].motionPlan);delete after.inputs;assert.deepEqual(after,base);
  const original=libraryProject(restored,{shotId:'shot-a',action:'restore'}).project;
  assert.equal(original.shots[0].motionPlan,null);assert.equal(original.shots[0].motionLibrary,undefined);
});
test('参数更改替换同一实例，重开不重复叠加，重置审片与渲染缓存',()=>{
  let p=applyTemplate(project());p.shots[0].reviewed=true;p.shots[0].filmQA=['检查'];
  const before=segmentFingerprint(p,'shot-a','zh');
  const body={action:'effect',shotId:'shot-a',itemId:'line',targets:['subject'],instanceId:'effect-a',params:defaultParams('line')};
  p=libraryProject(p,body).project;p=libraryProject(JSON.parse(JSON.stringify(p)),{...body,params:{...body.params,x1:60}}).project;
  assert.equal(p.shots[0].motionLibrary.instances.length,1);assert.equal(p.shots[0].reviewed,false);assert.deepEqual(p.shots[0].filmQA,[]);
  assert.notEqual(segmentFingerprint(p,'shot-a','zh'),before);assert.doesNotThrow(()=>update(null,p));
});
test('转场保持镜头、音频、字幕入点，前镜修改使后镜指纹失效',()=>{
  let p=applyTemplate(project());p.shots.push({...emptyShot(),id:'shot-b',silentOK:true});
  p=libraryProject(p,{shotId:'shot-b',action:'template',itemId:'data-scene',params:defaultParams('data-scene')}).project;
  const before=timeline(p);
  p=libraryProject(p,{shotId:'shot-b',action:'effect',itemId:'fade',params:defaultParams('fade'),targets:[]}).project;
  assert.deepEqual(timeline(p).rows.map(r=>[r.from,r.frames,r.voices,r.captionCues]),before.rows.map(r=>[r.from,r.frames,r.voices,r.captionCues]));
  const props=sceneProps(p,'shot-b');assert.equal(props.previousScene.shot.id,'shot-a');assert.equal(props.previousScene.previousScene,undefined);
  const fingerprint=segmentFingerprint(p,'shot-b','zh');p.shots[0].motionPlan.bg='#ffffff';assert.notEqual(segmentFingerprint(p,'shot-b','zh'),fingerprint);
});
test('拒绝错对象、无来源图片、越界参数、未知组件与主体消失',()=>{
  const p=applyTemplate(project());
  assert.throws(()=>validateParams('line',{...defaultParams('line'),until:8},6),/动作时间/);
  assert.throws(()=>validateParams('counter',{...defaultParams('counter'),decimals:1.5}),/小数位/);
  assert.throws(()=>libraryProject(p,{action:'effect',shotId:'shot-a',itemId:'text',targets:['subject'],params:defaultParams('text')}));
  assert.throws(()=>libraryProject(p,{action:'template',shotId:'shot-a',itemId:'product-scene',params:{...defaultParams('product-scene'),assetId:'fake'}}),/图片/);
  assert.throws(()=>libraryProject(p,{action:'effect',shotId:'shot-a',itemId:'line',targets:['missing'],params:defaultParams('line')}),/目标对象/);
  const plan=structuredClone(p.shots[0].motionPlan);plan.nodes[0].libraryEffects=[{kind:'eval',params:{}}];assert.throws(()=>validateMotion(plan),/动效类型/);
});
test('数据柱形基线固定，公式各符号保留身份，模板时长取实际帧表',()=>{
  const plan=templatePlan('data-scene',defaultParams('data-scene'));
  assert.ok(plan.nodes.find(n=>n.id==='subject').libraryBounds.height>0);
  const formula=templatePlan('formula-scene',defaultParams('formula-scene'));
  assert.equal(formula.nodes.find(n=>n.id==='symbol-2').text.value,'B');
  assert.ok(formula.nodes.find(n=>n.id==='symbol-2').frames.at(-1).x>formula.nodes.find(n=>n.id==='symbol-2').frames[0].x);
  const p=project();p.shots[0].seconds=11;const q=applyTemplate(p);assert.equal(q.shots[0].motionPlan.duration,11);
});

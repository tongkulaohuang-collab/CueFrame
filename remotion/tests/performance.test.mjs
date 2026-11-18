import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {worldState,worldPoint,validateRig,multiply,transformPoint} from '../shared/actor-rig.mjs';
import {actorDesigns,mergeActorCatalog,validateActorCatalog,actorSkinIssues} from '../shared/actor-catalog.mjs';
import {validatePerformance,validatePerformanceRequirements,MIN_COVERAGE_PIXELS} from '../shared/performance-plan.mjs';
import {shotImagePlan} from '../shared/shot-images.mjs';
import {motionIssues,motionInputs,sameMotionInputs} from '../shared/motion-plan.mjs';
import {motionFixture} from './fixtures/motion.mjs';
import {performanceSkill,performanceSkillInput} from '../server/performance-skill.mjs';
import {sampleMotion} from '../shared/motion-dynamics.mjs';
import {compileEffects} from '../shared/library-compiler.mjs';
import {defaultParams} from '../shared/motion-library.mjs';

const style={silhouette:'圆头黄衣',proportions:'固定头身比',material:'平面纸张',light:'无定向阴影',palette:'黄灰',stroke:'2px',perspective:'侧视'};
const frame=(time,x,y,rotation=0,scaleX=1,scaleY=1)=>({time,x,y,rotation,scaleX,scaleY,opacity:1});
const node=(id,parentId,frames)=>({id,role:'subject',paths:[{d:'M -10 -10 L 10 -10 L 10 10 L -10 10 Z',fill:'#eeeeee',stroke:'none',strokeWidth:0}],frames,
  rig:{actorId:'shopper',partId:id,parentId,pivot:{x:0,y:0}}});
function fixture() {
  const plan={width:640,height:360,duration:2,bg:'#101010',subjectId:'body',annotations:[],layout:{version:1,connectors:[]},
    nodes:[node('body',null,[frame(0,160,160),frame(1,160,160),frame(2,160,160)]),node('hand','body',[frame(0,0,0),frame(1,60,0),frame(2,80,-20)]),
      {id:'prop',role:'mechanism',paths:[{d:'M -8 -8 L 8 -8 L 8 8 L -8 8 Z',fill:'#dddddd',stroke:'none',strokeWidth:0}],frames:[frame(0,220,160),frame(2,240,140)],attachments:[{parentId:'hand',from:1,until:2}]}],
    camera:[{time:0,x:320,y:180,zoom:1},{time:2,x:320,y:180,zoom:1}],cameraShots:[{from:0,until:2,framing:'medium',focusId:'hand',transition:'move',reason:'观察手与道具接触',eventIds:['grab']}],
    actors:[{id:'shopper',designId:'shopper-side',version:1,capability:'articulated',rootId:'body',style,parts:[{id:'body',nodeId:'body',replaceable:false},{id:'hand',nodeId:'hand',replaceable:true}]}],
    performance:{version:1,events:[{requirementId:'grab',from:0,at:1,until:2,rootId:'body',partIds:['hand'],contacts:[{a:{nodeId:'hand',x:0,y:0},b:{nodeId:'prop',x:0,y:0},at:1,until:2,tolerance:1}],supports:[],coverage:[{nodeId:'hand',x:-8,y:-8,width:16,height:16,minPixels:8},{nodeId:'prop',x:-8,y:-8,width:16,height:16,minPixels:8}]}]}};
  // Before contact the prop is static. The final authored pose matches release.
  plan.nodes[2].frames=[frame(0,220,160),frame(1,220,160),frame(2,240,140)];
  const requirements=[{id:'grab',shotId:'s',actionId:'a',kind:'contact',actorId:'shopper',partIds:['hand'],cueId:'voice-0',from:0,until:2,dependsOn:[],note:'句级区间内先伸手接触，再带走'}];
  const options={fps:24,speech:[{id:'voice-0',time:0,until:2}],required:true};
  return {plan,requirements,options};
}
test('父旋转、非均匀缩放和枢轴保留完整仿射矩阵；乱序与重开一致',()=>{
  const {plan}=fixture();plan.nodes[0].frames.forEach(f=>{f.rotation=30;f.scaleX=2;f.scaleY=.7;});
  plan.nodes[1].rig.pivot={x:5,y:8};plan.nodes[1].frames.forEach(f=>f.rotation=-40);
  const state=worldState(plan,1),parent=state.get('body').matrix,atPivot=state.point('hand',{x:5,y:8});
  assert.deepEqual(atPivot,transformPoint(parent,{x:60,y:0}));
  const expected=new Map([0,.5,1,1.5,2].map(t=>[t,worldState(plan,t).get('hand')]));
  for(const t of [2,1,0,1.5,.5,1])assert.deepEqual(worldState(JSON.parse(JSON.stringify(plan)),t).get('hand'),expected.get(t));
  assert.deepEqual(multiply([1,0,0,1,20,30],[1,0,0,1,4,5]),[1,0,0,1,24,35]);
});
test('脚本指定数值显现时接受真实透明度轨道，机制、空转与串节拍依旧拒绝',()=>{
  const {plan,requirements,options}=fixture();
  const node=plan.nodes[1],event=plan.performance.events[0];
  Object.assign(node,{paths:[],text:{value:'4 公里/小时',size:32},frames:[{...frame(0,0,0),opacity:0},frame(1,0,0),frame(2,0,0)]});
  Object.assign(event,{contacts:[],coverage:[{nodeId:'hand',x:-8,y:-8,width:16,height:16,minPixels:8,from:1,until:2}]});
  requirements[0].kind='state';
  options.beats=[{id:'number',intent:'reveal',entities:['label'],cueIds:['voice-0'],from:0,until:2}];
  plan.explanationEvidence=[{beatId:'number',resultAt:1,changes:[{entity:'label',nodeId:'hand',property:'opacity',from:0,to:1}]}];
  assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
  for(const intent of ['hold','change','result','compare'])assert.throws(()=>validatePerformance(plan,requirements,{...options,beats:[{...options.beats[0],intent}]}),/内部姿态/);
  assert.throws(()=>validatePerformance(plan,requirements,{...options,beats:[{...options.beats[0],cueIds:['another-cue']}]}),/内部姿态/);
  node.frames[0].opacity=1;
  assert.throws(()=>validatePerformance(plan,requirements,options),/内部姿态/);
});
test('拒绝丢失父节点、循环、跨主体连接和释放跳变',()=>{
  const {plan}=fixture();assert.doesNotThrow(()=>validateRig(plan));
  for(const mutate of [p=>p.nodes[1].rig.parentId='missing',p=>p.nodes[0].rig.parentId='hand',p=>p.nodes[1].rig.actorId='other',
    p=>{p.nodes[2].attachments[0].until=1.5;p.nodes[2].frames.at(-1).x=300;}]) {const p=structuredClone(plan);mutate(p);assert.throws(()=>validateRig(p));}
});
test('先接触再附着的拿取合法；未接触、提前附着、内部不动均拒绝',()=>{
  const {plan,requirements,options}=fixture();
  for(const fps of [12,24,30,60])assert.doesNotThrow(()=>validatePerformance(plan,requirements,{...options,fps}));
  assert.deepEqual(worldPoint(plan,'hand',1.5),worldPoint(plan,'prop',1.5));
  for(const mutate of [p=>p.nodes[2].frames[1].x=235,p=>p.nodes[2].attachments[0].from=.5,
    p=>p.nodes[1].frames.forEach(f=>{f.x=60;f.y=0;})]){const p=structuredClone(plan);mutate(p);assert.throws(()=>validatePerformance(p,requirements,options));}
});
test('相机目的支持固定镜头；画外、过小、错时、漏观察部件均被拒绝',()=>{
  const {plan,requirements,options}=fixture();
  assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
  for(const mutate of [p=>p.camera.forEach(f=>f.x=2000),p=>p.camera.forEach(f=>f.zoom=.2),
    p=>p.performance.events[0].at=1.7,p=>p.performance.events[0].coverage.pop(),p=>p.cameraShots[0].eventIds=[]]) {
    const p=structuredClone(plan);mutate(p);assert.throws(()=>validatePerformance(p,requirements,options));
  }
});
test('大结构可要求超过画高四成的观察尺寸，真实尺寸不足仍拒绝',()=>{
 const {plan,requirements,options}=fixture(),e=plan.performance.events[0],hand=plan.nodes[1];
 requirements[0].kind='rigid';e.contacts=[];delete plan.nodes[2].attachments;
 hand.paths[0].d='M-90 -90L90 -90L90 90L-90 90Z';hand.frames.forEach(f=>{f.x=160;f.y=20;});
 e.coverage=[{nodeId:'hand',x:-90,y:-90,width:180,height:180,minPixels:180}];
 assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
 plan.camera.forEach(f=>f.zoom=.5);
 assert.throws(()=>validatePerformance(plan,requirements,options),/小于动作要求的可读尺寸/);
});

test('观察区域诊断给出具体节点、字段、实际值和下限，合法边界仍检查实际尺寸',()=>{
 const {plan,requirements,options}=fixture(),target=plan.performance.events[0].coverage[0];
 target.minPixels=4;
 assert.throws(()=>validatePerformance(plan,requirements,options),error=>{
  assert.equal(error.code,'PERFORMANCE_INVALID');
  assert.equal(error.issues[0].path,'motion.performance.events[0].coverage[0].minPixels');
  assert.match(error.issues[0].message,/hand.*minPixels=4.*8–360/);return true;
 });
 target.minPixels=MIN_COVERAGE_PIXELS;
 assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
 plan.camera.forEach(f=>f.zoom=.4);
 assert.throws(()=>validatePerformance(plan,requirements,options),/小于动作要求的可读尺寸/);
 const schema=JSON.parse(fs.readFileSync(new URL('../server/motion.schema.json',import.meta.url)));
 assert.equal(schema.properties.motion.properties.performance.properties.events.items.properties.coverage.items.properties.minPixels.minimum,MIN_COVERAGE_PIXELS);
});

test('观察区域同时报告节点、尺寸、数值与区间问题，不自动改写坏数据',()=>{
 const {plan,requirements,options}=fixture(),targets=plan.performance.events[0].coverage;
 Object.assign(targets[0],{nodeId:'missing',x:NaN,width:0,minPixels:361,from:-1,until:3});
 targets[1].from=1;targets[1].until=1;
 const before=structuredClone(plan);
 assert.throws(()=>validatePerformance(plan,requirements,options),error=>{
  const fields=error.issues.map(i=>i.path);
  for(const field of ['nodeId','x','width','minPixels','from','until'])assert.ok(fields.includes('motion.performance.events[0].coverage[0].'+field));
  assert.ok(fields.includes('motion.performance.events[0].coverage[1].until'));return true;
 });
 assert.deepEqual(plan,before);
});

test('观察区域 null 时间沿用事件，非数值、空对象和倒序区间明确拒绝',()=>{
 for(const mutate of [c=>c.minPixels=Infinity,c=>c.height=-1,c=>c.from='0',c=>c.until=NaN,c=>{c.from=1.5;c.until=1;}]){
  const {plan,requirements,options}=fixture();mutate(plan.performance.events[0].coverage[0]);
  assert.throws(()=>validatePerformance(plan,requirements,options),error=>error.code==='PERFORMANCE_INVALID'&&error.issues.length>0);
 }
 const {plan,requirements,options}=fixture();Object.assign(plan.performance.events[0].coverage[0],{from:null,until:null});
 assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
 plan.performance.events[0].coverage[0]=null;
 assert.throws(()=>validatePerformance(plan,requirements,options),error=>error.issues[0].path==='motion.performance.events[0].coverage[0]');
});
test('稳定设计跨镜复用，部件换图保留动作，整图替换和同版改形被拒绝',()=>{
  const {plan}=fixture(),catalog=mergeActorCatalog([],plan),other=structuredClone(plan);
  other.nodes[0].frames[1].x+=50;assert.deepEqual(mergeActorCatalog(catalog,other),catalog);
  assert.equal(validateActorCatalog({actorCatalog:catalog,shots:[{motionPlan:plan},{motionPlan:other}]}).length,1);
  other.nodes[1].paths[0].fill='#ff0000';assert.throws(()=>mergeActorCatalog(catalog,other),/不一致/);
  other.actors[0].version++;assert.equal(mergeActorCatalog(catalog,other).length,2);
  const binding={nodeId:'hand',assetId:'hand-image',box:{x:-10,y:-10,width:20,height:20}};
  assert.throws(()=>shotImagePlan(plan,[binding]),/部件图片/);
  const bound=shotImagePlan(plan,[{...binding,scope:'part',actorId:'shopper',partId:'hand',designVersion:1}]);
  assert.deepEqual(worldPoint(bound,'hand',1.5),worldPoint(plan,'hand',1.5));
  assert.throws(()=>shotImagePlan(plan,[{...binding,nodeId:'body'}]),/整图不能/);
  assert.equal(actorDesigns(plan)[0].spec.parts.length,2);
  const shots=[{motionPlan:plan,imageBindings:[binding]},{motionPlan:plan,imageBindings:[{...binding,assetId:'different'}]}];
  assert.equal(actorSkinIssues({shots}).length,1);shots[1].imageBindings[0].assetId=binding.assetId;assert.deepEqual(actorSkinIssues({shots}),[]);
});
test('行走必须有交替支撑，刚体平移不强加四肢；上游要求不可由回执降级',()=>{
  const {plan,requirements,options}=fixture();requirements[0].kind='locomotion';requirements[0].partIds=['hand','body'];plan.performance.events[0].partIds=['hand','body'];
  assert.throws(()=>validatePerformance(plan,requirements,options),/根位移/);
  const f=motionFixture({presentation:true});assert.deepEqual(motionIssues(f.raw.motion,f.p,24,f.p.shots[0]),[]);
  const context=[{shotId:'s',duration:2,actions:[{id:'a'}],speech:options.speech}];
  const good=fixture().requirements;assert.doesNotThrow(()=>validatePerformanceRequirements(good,context));
  good[0].cueId='estimated-0';assert.throws(()=>validatePerformanceRequirements(good,context),/语音/);
});
test('保存输入包含设计、动作时机、绑定与 skill；实际指导从文件载入',()=>{
  const {p,raw}=motionFixture({presentation:true}),s=p.shots[0];s.motionPlan=raw.motion;
  const before=motionInputs(p,s);s.imageBindings=[{nodeId:'particle',assetId:'new'}];assert.notEqual(before,motionInputs(p,s));
  s.imageBindings=[];p.scienceFlow.referenceScript.performanceRequirements[0].until=1.8;assert.notEqual(before,motionInputs(p,s));
  const skill=performanceSkill();assert.match(skill.fingerprint,/^[a-f0-9]{64}$/);assert.match(performanceSkillInput('motion'),/接触瞬间|接触后保持/);
  assert.equal(performanceSkillInput('narration'),'');
  const emptyStyle=motionInputs(p,s);p.scienceFlow.lemoStyleId='';assert.ok(sameMotionInputs(emptyStyle,motionInputs(p,s)),'保存时省略空风格不应作废已渲染动画');
});
test('真实样片的交替支撑在多帧率通过；脚滑和冻结四肢被拒绝',()=>{
  const {plan,requirements}=JSON.parse(fs.readFileSync(new URL('./fixtures/performance-character.json',import.meta.url)));
  const speech=[{id:'speech-zh-0',time:0,until:3.765},{id:'speech-zh-1',time:4.4,until:8.925}];
  for(const fps of [12,24,30,60])assert.doesNotThrow(()=>validatePerformance(plan,requirements,{fps,speech}));
  const slide=structuredClone(plan);slide.nodes.find(n=>n.id==='left-foot').frames.forEach(f=>f.x+=f.time*30);
  assert.throws(()=>validatePerformance(slide,requirements,{fps:24,speech}),/支撑脚滑动/);
  const frozen=structuredClone(plan);for(const n of frozen.nodes.filter(n=>n.rig?.parentId))n.frames=n.frames.map(f=>({...n.frames[0],time:f.time}));
  assert.throws(()=>validatePerformance(frozen,requirements,{fps:24,speech}),/内部姿态/);
});
test('合法固定轴开合与局部近景通过；轴心漂移被拒绝',()=>{
  const {plan,requirements,options}=fixture();requirements[0].kind='hinge';plan.nodes[1].frames=[frame(0,60,0,0),frame(1,60,0,45),frame(2,60,0,80)];
  plan.performance.events[0].contacts=[];plan.performance.events[0].coverage=plan.performance.events[0].coverage.slice(0,1);delete plan.nodes[2].attachments;
  assert.doesNotThrow(()=>validatePerformance(plan,requirements,options));
  plan.nodes[1].frames[1].x+=5;assert.throws(()=>validatePerformance(plan,requirements,options),/轴心/);
  const close=fixture();close.plan.nodes[0].frames.forEach(f=>f.x-=1000);close.plan.nodes[1].frames.forEach(f=>f.x+=1000);
  assert.doesNotThrow(()=>validatePerformance(close.plan,close.requirements,close.options),'主体根可在画外，手与书才是近景目标');
  const compiled=compileEffects(close.plan,[{instanceId:'follow-hand',effectId:'follow',params:{...defaultParams('follow',2),from:0,until:2,zoom:1},targets:['hand']}]).plan;
  assert.deepEqual(compiled.cameraShots,close.plan.cameraShots);
  assert.doesNotThrow(()=>validatePerformance(compiled,close.requirements,close.options),'库跟随保留事件目的并观察真实的世界位置');
});
test('人物图片和符号可静态展示；人物姿态、附着、动画效果不可进入新设计',()=>{
  const {plan}=fixture();plan.nodes=plan.nodes.slice(0,1);plan.actors[0]={...plan.actors[0],contentType:'person-symbol',capability:'rigid',parts:[plan.actors[0].parts[0]]};
  assert.doesNotThrow(()=>actorDesigns(plan));
  plan.nodes[0].frames[0].opacity=0;assert.doesNotThrow(()=>actorDesigns(plan),'静态素材可以淡入');
  for(const change of [p=>p.nodes[0].frames[1].x+=10,p=>p.nodes[0].frames[1].rotation=10,p=>p.nodes[0].frames[1].draw=.5,
    p=>p.nodes[0].attachments=[{parentId:'other',from:0,until:2}],p=>p.nodes[0].libraryEffects=[{id:'line'}]]) {
    const bad=structuredClone(plan);change(bad);assert.throws(()=>actorDesigns(bad),/人物/);
  }
});
test('文字图像样片按原声词点改变状态；冻结内部图形不能靠根位移通过',()=>{
  const {plan,requirements:req,speech,anchors}=JSON.parse(fs.readFileSync(new URL('./fixtures/performance-graphics.json',import.meta.url)));
  for(const fps of [12,24,30,60])assert.doesNotThrow(()=>validatePerformance(plan,req,{fps,speech}));
  assert.equal(sampleMotion(plan.nodes.find(n=>n.id==='price-arrow').frames,anchors.price-.01).draw,0);
  assert.equal(sampleMotion(plan.nodes.find(n=>n.id==='price-arrow').frames,anchors.priceEnd).draw,1);
  assert.equal(sampleMotion(plan.nodes.find(n=>n.id==='comparison-symbol').frames,anchors.unequal-.01).draw,0);
  assert.equal(plan.presentation.texts.find(t=>t.nodeId==='inflation').from,anchors.inflation);
  assert.ok(plan.actors.every(a=>a.contentType==='object'));
  const frozen=structuredClone(plan);frozen.nodes.find(n=>n.id==='price-arrow').frames.forEach(f=>f.draw=1);frozen.nodes.find(n=>n.id==='book').frames[2].x+=100;
  assert.throws(()=>validatePerformance(frozen,req,{fps:24,speech}),/内部姿态/);
});

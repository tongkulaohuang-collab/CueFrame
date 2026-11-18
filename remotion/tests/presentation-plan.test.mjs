import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture} from './fixtures/motion.mjs';
import {validatePresentation,textPresentation,focusOpacity} from '../shared/presentation-plan.mjs';
import {validateMotionResult} from '../server/motion.mjs';
function fixture(){
 const {p,raw}=motionFixture(),plan=raw.motion;
 plan.layout={version:1,connectors:[]};
 plan.nodes.push({id:'amount',role:'material',paths:[],text:{value:'4.1%',font:'sans',size:100,weight:900,color:'#ffffff'},frames:structuredClone(plan.nodes[0].frames)});
 plan.presentation={version:1,texts:[{nodeId:'amount',role:'value',from:.3,until:1.7,align:'middle',width:200,lines:['4.1%']}],
  beats:[{from:0,until:2,primaryIds:['particle','amount'],supportIds:['channel'],reason:'粒子经过通道后显示读数'}]};
 return {p,raw,plan};
}
test('文字生命周期、统一大小与相机缩放分离',()=>{
 const {plan}=fixture();assert.doesNotThrow(()=>validatePresentation(plan));
 assert.equal(textPresentation(plan,'amount',.1).opacity,0);assert.equal(textPresentation(plan,'amount',1.7).opacity,0);
 const before=textPresentation(plan,'amount',1);plan.camera.forEach(c=>c.zoom=2);
 const after=textPresentation(plan,'amount',1);assert.equal(after.size,before.size);assert.equal(after.scaleX,before.scaleX/2);
 plan.presentation.texts[0].role='source';assert.ok(textPresentation(plan,'amount',1).size<after.size);
 plan.presentation.texts[0].until=plan.duration;assert.equal(textPresentation(plan,'amount',plan.duration-1/24).opacity,1);
});
test('未规划的环境减弱，重点按阶段交接；过期文字不会残留',()=>{
 const {plan}=fixture();assert.equal(focusOpacity(plan,'particle',1),1);assert.equal(focusOpacity(plan,'channel',1),.65);
 plan.presentation.beats[0].supportIds=[];assert.equal(focusOpacity(plan,'channel',1),.16);
 plan.presentation.beats=[{...plan.presentation.beats[0],until:1},{from:1,until:2,primaryIds:['channel','amount'],supportIds:[],reason:'观察通道'}];
 assert.ok(focusOpacity(plan,'particle',1.09)>.16);assert.equal(focusOpacity(plan,'particle',1.2),.16);
});
test('拒绝漏设退出、假分栏、画面无重点及同时堆叠文字',()=>{
 let {plan}=fixture();plan.presentation.texts[0].until=undefined;assert.throws(()=>validatePresentation(plan),/退场/);
 ({plan}=fixture());plan.presentation.texts[0].lines=['4.1%    其他'];assert.throws(()=>validatePresentation(plan),/分行/);
 ({plan}=fixture());plan.presentation.beats[0].primaryIds=[];assert.throws(()=>validatePresentation(plan),/主信息/);
 ({plan}=fixture());plan.presentation.beats[0].until=1;assert.throws(()=>validatePresentation(plan),/结尾/);
 ({plan}=fixture());for(let i=0;i<6;i++){const id='extra-'+i;plan.nodes.push({...plan.nodes.at(-1),id});plan.presentation.texts.push({...plan.presentation.texts[0],nodeId:id});plan.presentation.beats[0].supportIds.push(id);}
 assert.throws(()=>validatePresentation(plan),/同时出现过多/);
});
test('新动画任务不能绕过排版契约，旧结果仍可读取',()=>{
 const {p,raw}=motionFixture({presentation:true});delete raw.motion.presentation;assert.doesNotThrow(()=>validateMotionResult(raw,p,{shotId:p.shots[0].id}));
 assert.throws(()=>validateMotionResult(raw,p,{shotId:p.shots[0].id,presentationVersion:1}),/缺少文字角色/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture} from './fixtures/motion.mjs';
import {validateExplanationBeats,validateExplanationEvidence} from '../shared/explanation-plan.mjs';
import {designReport} from '../shared/director-quality.mjs';
import {routeConnector,segmentHitsBox,expandBox,labelIssues,validateLayout} from '../shared/layout-geometry.mjs';
import {referenceScriptKey} from '../shared/reference-motion.mjs';
import {validateCameraPlan} from '../shared/camera-plan.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {scienceGate} from '../shared/science-flow.mjs';
import {actionTiming} from '../shared/action-timing.mjs';
import {validatePerformanceRequirements} from '../shared/performance-plan.mjs';

test('句间实测空隙可以延续同一对象，仍拒绝跨入旁白、新对象和用停留伪装动作',()=>{
 const {p}=motionFixture(),shot=p.shots[0],id=shot.id;
 shot.zh='第一句话。第二句话。';
 p.assets.find(a=>a.role==='zh').segments=[{text:'第一句话。',from:0,until:.75},{text:'第二句话。',from:1,until:2}];
 const timing=actionTiming(p,id),[first,second]=timing.speech;
 const base={shotId:id,entities:['标尺'],before:'标尺尚待观察',after:'标尺显示结果',holdReason:'',dependsOn:[]};
 const beats=[{...base,id:'first',from:0,until:.75,cueIds:[first.id],intent:'establish'},
   {...base,id:'gap',from:.75,until:1,cueIds:[],intent:'hold',holdReason:'沿用已显示的同一标尺供比较',dependsOn:['first']},
   {...base,id:'second',from:1,until:2,cueIds:[second.id],intent:'result',dependsOn:['gap']}];
 assert.doesNotThrow(()=>validateExplanationBeats(beats,p));
 for(const patch of [{from:.70},{entities:['其他对象']},{intent:'reveal'},{dependsOn:[]}])assert.throws(()=>validateExplanationBeats([beats[0],{...beats[1],...patch},beats[2]],p),/实际旁白/);
 const req={id:'pause',kind:'hold',shotId:id,actionId:'hold',actorId:'ruler',partIds:['edge'],from:.75,until:1,cueId:'design',dependsOn:[],note:'静默时维持标尺'};
 const ctx=[{shotId:id,duration:2,speech:timing.speech,actions:[{id:'hold',technique:'hold'}]}];
 assert.doesNotThrow(()=>validatePerformanceRequirements([req],ctx));
 for(const patch of [{kind:'state'},{until:1.05}])assert.throws(()=>validatePerformanceRequirements([{...req,...patch}],ctx));
});

function fixture(){
 const {p,raw}=motionFixture(),plan=raw.motion;
 const beats=[{id:'cross',shotId:p.shots[0].id,from:0,until:2,cueIds:['voice-0'],intent:'change',entities:['粒子'],before:'粒子在通道左侧',after:'粒子穿过通道到右侧',dependsOn:[],holdReason:''}];
 plan.layout={version:1,connectors:[]};plan.explanationEvidence=[{beatId:'cross',resultAt:2,changes:[{entity:'粒子',nodeId:'particle',property:'x',from:80,to:550}]}];
 return {p,plan,beats};
}
test('逐句机制契约核对真实轨迹，拒绝延迟结果和伪报状态',()=>{
 const {p,plan,beats}=fixture();assert.doesNotThrow(()=>validateExplanationBeats(beats,p));assert.doesNotThrow(()=>validateExplanationEvidence(plan,beats));
 plan.explanationEvidence[0].resultAt=2.5;assert.throws(()=>validateExplanationEvidence(plan,beats),/结果出现时间/);
 plan.explanationEvidence[0].resultAt=2;plan.nodes[1].frames.at(-1).x=80;assert.throws(()=>validateExplanationEvidence(plan,beats),/实际关键帧/);
});
test('不能用标签显现代替机制，也不能遗漏组内第二个对象',()=>{
 const {p,plan,beats}=fixture();plan.nodes[1].paths=[];plan.nodes[1].text={value:'穿过'};
 assert.throws(()=>validateExplanationEvidence(plan,beats),/文字/);
 const other=fixture();other.beats[0].entities.push('第二粒子');assert.throws(()=>validateExplanationEvidence(other.plan,other.beats),/每个变化对象/);
 const {p:legacy,raw}=motionFixture();raw.motion.actionEvidence[0].nodeIds.push('channel');
 assert.match(designReport(legacy,legacy.shots[0].id,raw.motion,{newResult:true}).issues.join(' '),/没有相应的可见运动/);
});
test('语句缺口、错误依赖和假词级时间被拒绝',()=>{
 const {p,beats}=fixture();beats[0].cueIds=['invented-word-time'];assert.throws(()=>validateExplanationBeats(beats,p),/实际旁白/);
 beats[0].cueIds=['voice-0'];beats[0].dependsOn=['cross'];assert.throws(()=>validateExplanationBeats(beats,p),/因果顺序/);
 beats[0].dependsOn=[];beats[0].from=1;assert.throws(()=>validateExplanationBeats(beats,p),/信息空档/);
});
test('路由绕开真实字框；无通道明确失败而非画到字上',()=>{
 const obstacle={x:90,y:30,width:60,height:40},start={x:20,y:50},end={x:220,y:50};
 const route=routeConnector(start,end,[obstacle],{x:0,y:0,width:240,height:150},10);
 assert.ok(route.length>2);assert.ok(route.slice(1).every((p,i)=>!segmentHitsBox(route[i],p,expandBox(obstacle,10))));
 assert.throws(()=>routeConnector(start,end,[{x:80,y:-50,width:80,height:250}],{x:0,y:0,width:240,height:150}),/没有可用通道/);
});
test('穿字、两字框重叠、字幕区与上沿裁切都可定位',()=>{
 assert.equal(segmentHitsBox({x:0,y:40},{x:100,y:40},{x:45,y:30,width:20,height:30}),true);
 const issues=labelIssues([{id:'a',x:40,y:40,width:90,height:30},{id:'b',x:110,y:40,width:90,height:30},{id:'caption',x:40,y:325,width:90,height:30},{id:'cropped',x:40,y:-1,width:90,height:30}],640,360);
 assert.ok(issues.some(s=>s.includes('a 与 b')));assert.ok(issues.some(s=>s.includes('caption')));assert.ok(issues.some(s=>s.includes('cropped')));
 const {plan}=fixture();plan.nodes[1].text={value:'需求端    供给端'};assert.throws(()=>validateLayout(plan),/空格模拟列/);
});
test('配音时间或音乐改变会使节奏依赖失效',()=>{
 const {p}=fixture(),before=referenceScriptKey(p);p.assets[0].segments=[{start:.2,end:1.7,text:'测试'}];assert.notEqual(referenceScriptKey(p),before);
 const after=referenceScriptKey(p);p.scienceFlow.bgmId='different';assert.notEqual(referenceScriptKey(p),after);
});
test('有讲解契约时允许目的明确的固定镜头；旧计划继续原有检查',()=>{
 const {plan}=fixture();plan.duration=30;plan.camera.at(-1).time=30;plan.cameraShots[0].until=30;
 assert.doesNotThrow(()=>validateCameraPlan(plan,{required:true,purposeDriven:true}));
 assert.throws(()=>validateCameraPlan(plan,{required:true}),/视觉镜头/);
});
test('生产动画校验保留契约并核对编译后的对象，不能省略排版门禁',()=>{
 const {p,raw}=motionFixture(),data=fixture();data.beats[0].shotId=p.shots[0].id;
 p.scienceFlow.referenceScript={explanationVersion:1,explanationBeats:data.beats};
 raw.motion.layout=data.plan.layout;raw.motion.explanationEvidence=data.plan.explanationEvidence;
 const [result]=validateMotionResult(raw,p,{shotId:p.shots[0].id});assert.equal(result.motionPlan.explanationEvidence.length,1);
 delete raw.motion.layout;assert.throws(()=>validateMotionResult(raw,p,{shotId:p.shots[0].id}),/实测排版|实际字形测量/);
});
test('旧批准标记不能放行缺少机制的时间轴草稿；画外结果不能冒充可见',()=>{
 const {p,plan,beats}=fixture();p.scienceFlow.referenceScript={explanationVersion:1,explanationBeats:[]};
 p.scienceFlow.referenceScript.inputs=referenceScriptKey(p);p.scienceFlow.referenceScript.text=p.scienceFlow.rhythm;
 assert.ok(scienceGate(p).some(s=>s.includes('逐句讲解过程')));
 plan.nodes[1].frames.at(-1).x=800;plan.explanationEvidence[0].changes[0].to=800;
 assert.throws(()=>validateExplanationEvidence(plan,beats),/可见主体区域/);
});

test('可见性检查实际路径位置，不能把画外枢轴当作画外图形，也不能反向漏检',()=>{
 const {plan,beats}=fixture(),node=plan.nodes[1],change=plan.explanationEvidence[0].changes[0];
 node.paths=[{d:'M180 120L220 120L220 160L180 160Z',fill:'#ffffff',stroke:'none',strokeWidth:0}];
 node.frames.forEach((f,i)=>{f.x=i===node.frames.length-1?20:0;f.y=0;});
 plan.camera.forEach(c=>{c.x=320;c.y=180;c.zoom=1.4;});
 change.from=0;change.to=20;
 assert.doesNotThrow(()=>validateExplanationEvidence(plan,beats),'实际图形可见，原点在画外');
 node.paths[0].d='M1000 120L1040 120L1040 160L1000 160Z';
 node.frames.forEach((f,i)=>{f.x=i===node.frames.length-1?320:300;f.y=180;});
 change.from=300;change.to=320;
 assert.throws(()=>validateExplanationEvidence(plan,beats),/可见主体区域/,'原点可见，真实图形在画外');
});

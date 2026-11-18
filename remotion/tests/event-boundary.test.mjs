import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture} from './fixtures/motion.mjs';
import {validatePerformance} from '../shared/performance-plan.mjs';
import {quantizeCameraTiming} from '../shared/camera-plan.mjs';
import {actionTiming} from '../shared/action-timing.mjs';

test('六位小数动作时间与帧对齐相机边界保持同一归属，真实漏关联仍拒绝',()=>{
 for(const fps of [24,30,60])for(const boundary of [25/fps,26/fps]){
  const {p,raw}=motionFixture({presentation:true}),plan=raw.motion,r=p.scienceFlow.referenceScript.performanceRequirements[0];
  const cut=Math.round(boundary*1e6)/1e6,duration=plan.duration;
  const requirements=[{...r,id:'before',until:cut},{...r,id:'after',from:cut}];
  const e=plan.performance.events[0];plan.performance.events=[{...structuredClone(e),requirementId:'before',until:cut,at:cut/2},
    {...structuredClone(e),requirementId:'after',from:cut,at:(cut+duration)/2}];
  const camera=plan.camera[0],shot=plan.cameraShots[0];plan.camera=[camera,{...camera,time:cut},{...camera,time:duration}];
  plan.cameraShots=[{...shot,until:cut,eventIds:['before']},{...shot,from:cut,eventIds:['after']}];
  quantizeCameraTiming(plan,fps);
  const options={fps,speech:actionTiming(p,p.shots[0].id).speech,required:true};
  assert.doesNotThrow(()=>validatePerformance(plan,requirements,options),`fps=${fps},cut=${cut}`);
  plan.cameraShots[1].eventIds=[];
  assert.throws(()=>validatePerformance(plan,requirements,options),/缺少关联/);
 }
});

test('最后一帧附近的十进制舍入不能误判为相机没有覆盖',()=>{
 const {p,raw}=motionFixture({presentation:true}),plan=raw.motion,r=p.scienceFlow.referenceScript.performanceRequirements[0],duration=1.916667;
 plan.duration=duration;plan.camera.at(-1).time=duration;plan.cameraShots[0].until=duration;
 plan.performance.events[0].until=duration;r.until=duration;
 quantizeCameraTiming(plan,24);
 assert.doesNotThrow(()=>validatePerformance(plan,[r],{fps:24,speech:actionTiming(p,p.shots[0].id).speech}));
});
test('片尾半开区间保留末个可显示帧的检查，结束时间没有额外一帧',()=>{
 const {p,raw}=motionFixture({presentation:true}),plan=raw.motion,r=p.scienceFlow.referenceScript.performanceRequirements[0];
 const e=plan.performance.events[0],id=e.coverage[0].nodeId,n=plan.nodes.find(node=>node.id===id);
 const end=plan.duration,lastDisplay=end-1/24;
 const f=n.frames.at(-1);
 n.frames=n.frames.filter(frame=>frame.time<lastDisplay);
 n.frames.push({...f,time:lastDisplay,opacity:1},{...f,time:end,opacity:0});
 const options={fps:24,speech:actionTiming(p,p.shots[0].id).speech};
 assert.doesNotThrow(()=>validatePerformance(plan,[r],options));
 n.frames.at(-2).opacity=0;
 assert.throws(()=>validatePerformance(plan,[r],options),/不可见/);
});

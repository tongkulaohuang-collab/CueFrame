import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {motionFixture} from './fixtures/motion.mjs';
import {cameraAt,cameraVariation,validateCameraPlan,quantizeCameraTiming,needsCameraPlanUpdate} from '../shared/camera-plan.mjs';
import {motionAt,validateMotion} from '../shared/motion-plan.mjs';
import {visualReference,inheritVisuals} from '../shared/visual-continuity.mjs';
import {motionPrompt,validateMotionResult} from '../server/motion.mjs';
import {issueHelp} from '../shared/issue-help.mjs';

function coverage() {
  const {p,raw}=motionFixture();p.fps=24;p.assets[0].duration=12;p.shots[0].seconds=12;
  const m=raw.motion;m.duration=12;
  for(const n of m.nodes)for(const f of n.frames)f.time*=6;
  m.camera=[{time:0,x:320,y:180,zoom:1},{time:4-1/24,x:310,y:180,zoom:1.1,easing:'smooth'},
    {time:4,x:280,y:180,zoom:2.2},{time:6,x:320,y:180,zoom:2.6,easing:'smooth'},
    {time:8,x:400,y:180,zoom:1.4,easing:'smooth'},{time:12,x:450,y:180,zoom:1.4}];
  m.cameraShots=[{from:0,until:4,framing:'wide',transition:'cut',focusId:'particle',reason:'先建立粒子与通道的空间关系'},
    {from:4,until:8,framing:'detail',transition:'cut',focusId:'particle',reason:'切近观察通过通道的动作'},
    {from:8,until:12,framing:'medium',transition:'move',focusId:'particle',reason:'拉远交代离开后的空间'}];
  return {p,raw};
}

test('切镜在指定帧跳到特写，之前不插值穿越；物体动作不重置',()=>{
  const {raw}=coverage(),m=raw.motion;
  assert.equal(cameraAt(m,4-1/24).zoom,1.1);
  assert.equal(cameraAt(m,4-.000001).zoom,1.1);
  assert.equal(cameraAt(m,4).zoom,2.2);
  assert.ok(cameraAt(m,4+1/24).zoom>2.2);
  assert.ok(motionAt(m.nodes[1].frames,4).x>motionAt(m.nodes[1].frames,4-1/24).x);
  assert.ok(Math.abs(motionAt(m.nodes[1].frames,4).x-motionAt(m.nodes[1].frames,4-1/24).x)<5);
});
test('连续推进支持平滑加减速，旧相机计划仍保持线性行为',()=>{
  const m={camera:[{time:0,x:0,y:0,zoom:1},{time:4,x:400,y:200,zoom:2,easing:'smooth'}]};
  assert.equal(cameraAt(m,1).x,62.5);assert.equal(cameraAt(m,3).x,337.5);
  delete m.camera[1].easing;assert.equal(cameraAt(m,1).x,100);
  assert.equal(cameraAt(m,4).zoom,2);assert.equal(cameraAt(m,9).zoom,2);
});
test('真实多景别计划通过，假近景、无切镜或单一长构图会被拒绝',()=>{
  const {p,raw}=coverage(),id=p.shots[0].id;
  const plan=validateMotionResult(raw,p,{shotId:id})[0].motionPlan;
  assert.equal(plan.cameraPlanVersion,1);assert.deepEqual(cameraVariation(plan).cuts,[4]);
  assert.ok(cameraVariation(plan).zoomRatio>=2.5);
  const flat=structuredClone(raw);flat.motion.camera.forEach(f=>{f.zoom=1;f.x=320;});
  assert.throws(()=>validateMotionResult(flat,p,{shotId:id}),/实际远近变化不足/);
  const noCut=structuredClone(raw);noCut.motion.cameraShots.forEach(s=>{s.transition='move';});
  assert.throws(()=>validateMotionResult(noCut,p,{shotId:id}),/没有有效切镜/);
  const single=structuredClone(raw);single.motion.cameraShots=[{...single.motion.cameraShots[0],until:12}];
  assert.throws(()=>validateMotionResult(single,p,{shotId:id}),/至少需要 2 个视觉镜头/);
  const missing=structuredClone(raw);delete missing.motion.cameraShots;
  assert.doesNotThrow(()=>validateMotion(missing.motion));
  assert.throws(()=>validateMotionResult(missing,p,{shotId:id}),/缺少视觉镜头/);
});
test('镜头安排覆盖完整口播，拒绝空隙、重叠、未知焦点与无对应相机的切点',()=>{
  const {raw}=coverage();
  for(const change of [m=>m.cameraShots[1].from=4.5,m=>m.cameraShots[1].from=3.5,
    m=>m.cameraShots[1].focusId='missing',m=>m.cameraShots[1].framing='invented',
    m=>m.cameraShots[2].until=11,m=>m.cameraShots[1].reason='',
    m=>m.camera=m.camera.filter(f=>f.time!==4),m=>m.camera[1].easing='bounce']){
    const invalid=structuredClone(raw.motion);change(invalid);
    assert.throws(()=>validateMotion(invalid),/镜头安排/);
  }
});
test('镜头时间按帧率量化，量化后碰撞的相机关键帧不会静默合并',()=>{
  const {raw}=coverage(),m=raw.motion;
  m.camera.find(f=>f.time===4).time=4.001;m.cameraShots[0].until=4.001;m.cameraShots[1].from=4.001;
  quantizeCameraTiming(m,24);assert.equal(m.cameraShots[1].from,4);assert.equal(m.camera[2].time,4);
  m.camera[1].time=3.99;quantizeCameraTiming(m,24);
  assert.throws(()=>validateMotion(m),/轨迹/);
});
test('相邻段通过切镜衔接时保留对象连续性，不能把新景别强制改回旧相机',()=>{
  const {raw}=coverage(),m=raw.motion;
  const scene={width:m.width,height:m.height,bg:m.bg,subjectId:m.subjectId,nodes:m.nodes.map(({id,paths})=>({id,paths}))};
  const reference=visualReference([{scene}]),previous=structuredClone(m),next=structuredClone(m);
  previous.visualLock={key:reference.key};next.visualLock={key:reference.key};
  previous.camera.at(-1).zoom=4;next.camera[0].zoom=3;
  const result=inheritVisuals(m,null,previous,next,reference);
  assert.equal(result.camera[0].zoom,1);assert.equal(result.camera.at(-1).zoom,1.4);
  assert.equal(result.nodes[1].frames[0].x,previous.nodes[1].frames.at(-1).x);
  assert.equal(result.nodes[1].frames.at(-1).x,next.nodes[1].frames[0].x);
});
test('效果图锚点与切镜共存，图版不会清除前后镜头的切换方式',()=>{
  const {raw}=coverage(),m=raw.motion;
  const scene={width:m.width,height:m.height,bg:m.bg,subjectId:m.subjectId,nodes:m.nodes.map(({id,paths})=>({id,paths}))};
  const reference=visualReference([{scene}]);
  const contract={...reference,anchors:[{time:6,poses:m.nodes.map(n=>({id:n.id,...motionAt(n.frames,6)})),camera:{x:320,y:180,zoom:1}}]};
  inheritVisuals(m,contract,null,null,reference);
  assert.equal(cameraAt(m,6).zoom,1);assert.equal(cameraAt(m,4).zoom,2.2);
  assert.equal(m.camera.find(f=>f.time===6).easing,'smooth');
  assert.doesNotThrow(()=>validateCameraPlan(m,{required:true}));
});
test('长口播不能只用两镜或让一个构图停留过久；短镜可保留一个完整动作',()=>{
  const {raw}=motionFixture();assert.doesNotThrow(()=>validateCameraPlan(raw.motion,{required:true}));
  const long=coverage().raw.motion;long.duration=24;long.camera.at(-1).time=24;long.cameraShots.at(-1).until=24;
  assert.throws(()=>validateCameraPlan(long,{required:true}),/超过 12 秒/);
  long.cameraShots=[{...long.cameraShots[0],until:4},{...long.cameraShots[1],until:24}];
  assert.throws(()=>validateCameraPlan(long,{required:true}),/至少需要 3 个/);
});
test('新生成协议必须有镜头安排，旧样镜重做入口生效并提供原因与解决步骤',()=>{
  const {p,raw}=coverage(),s=p.shots[0];s.motionPlan=structuredClone(raw.motion);
  assert.equal(needsCameraPlanUpdate(p,s.id),true);
  s.motionPlan=validateMotionResult(raw,p,{shotId:s.id})[0].motionPlan;
  assert.equal(needsCameraPlanUpdate(p,s.id),false);
  assert.match(motionPrompt(p,{shotId:s.id}),/不拆分、重播或改速配音/);
  const schema=JSON.parse(fs.readFileSync(new URL('../server/motion.schema.json',import.meta.url)));
  assert.ok(schema.properties.motion.required.includes('cameraShots'));
  const help=issueHelp('镜头安排：没有有效切镜');
  assert.match(help.title,/镜头切换/);assert.ok(help.steps.some(s=>/保留已生成配音/.test(s)));
});

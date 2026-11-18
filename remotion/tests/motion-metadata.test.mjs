import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMotionMetadata} from '../server/motion-metadata.mjs';
import {cameraAt} from '../shared/camera-plan.mjs';
import {motionFixture} from './fixtures/motion.mjs';
import {checkedMotionDraft} from '../server/motion.mjs';
test('只按现有契约唯一映射恢复动作引用，并通过完整动画校验',()=>{
 const {p,raw}=motionFixture({presentation:true}),r=p.scienceFlow.referenceScript.performanceRequirements[0];
 raw.motion.actionEvidence[0].requirementId=r.id;const before=structuredClone(raw);
 const checked=checkedMotionDraft(raw,p,{shotId:p.shots[0].id,performanceVersion:1,presentationVersion:1});
 assert.match(checked.adjustments.join(),/原契约唯一映射/);assert.deepEqual(raw,before);
 assert.equal(checked.result[0].motionPlan.actionEvidence[0].requirementId,r.actionId);
 const duplicate=structuredClone(raw);duplicate.motion.actionEvidence.push(structuredClone(duplicate.motion.actionEvidence[0]));
 assert.throws(()=>checkedMotionDraft(duplicate,p,{shotId:p.shots[0].id}),/重复/);
});
test('只补静止相机的等值入点，逐时刻取景不变且重复处理无副作用',()=>{
 const raw={motion:{camera:[{time:0,x:320,y:180,zoom:1},{time:4,x:320,y:180,zoom:1}],cameraShots:[{from:0,until:2,transition:'move'},{from:2,until:4,transition:'move'}]}};
 const n=normalizeMotionMetadata(raw,[]);assert.equal(n.adjustments.length,1);assert.equal(n.raw.motion.camera.length,3);
 for(let t=0;t<=4;t+=.125)assert.deepEqual(cameraAt(n.raw.motion,t),cameraAt(raw.motion,t));
 assert.deepEqual(normalizeMotionMetadata(n.raw,[]).adjustments,[]);
 raw.motion.camera[1].x=500;assert.equal(normalizeMotionMetadata(raw,[]).raw.motion.camera.length,2,'不擅自补插移动镜头');
});
test('不猜测未知或有歧义的引用，也不覆盖合法动作编号',()=>{
 const raw={motion:{actionEvidence:[{requirementId:'known'},{requirementId:'unknown'},{requirementId:'ambiguous'}]}};
 const requirements=[{id:'known',actionId:'other'},{id:'actual',actionId:'known'},{id:'ambiguous',actionId:'a'},{id:'ambiguous',actionId:'b'}];
 const n=normalizeMotionMetadata(raw,requirements);assert.deepEqual(n.raw,raw);assert.deepEqual(n.adjustments,[]);
});
test('只还原可证明来自原脚本的帧舍入边界，保留图形、作用和接触时间',()=>{
 const requirements=[{id:'p',from:7.95,until:8.95}],raw={motion:{nodes:[{frames:[{time:7.958333,value:1}]}],performance:{events:[{
  requirementId:'p',from:7.958333333333333,at:8.75,until:8.958333333333334,contacts:[],supports:[],coverage:[{from:7.958333333333333,until:8.958333333333334}]}]}}};
 const n=normalizeMotionMetadata(raw,requirements,{fps:24}),e=n.raw.motion.performance.events[0];
 assert.equal(e.from,7.95);assert.equal(e.until,8.95);assert.equal(e.at,8.75);assert.deepEqual(e.coverage,[{from:7.95,until:8.95}]);
 assert.deepEqual(n.raw.motion.nodes,raw.motion.nodes);assert.equal(n.adjustments.length,2);
 const off=structuredClone(raw);off.motion.performance.events[0].from=7.94;
 assert.equal(normalizeMotionMetadata(off,requirements).raw.motion.performance.events[0].from,7.94,'不修正非帧舍入的真实时间偏移');
 off.motion.performance.events[0].contacts=[{at:8.75,until:8.958333333333334}];
 assert.equal(normalizeMotionMetadata(off,requirements).raw.motion.performance.events[0].until,8.958333333333334,'不能缩短接触');
});

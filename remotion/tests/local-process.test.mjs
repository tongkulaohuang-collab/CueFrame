import test from 'node:test';import assert from 'node:assert/strict';import {localSpec,plotterAt,protectProcess} from '../shared/local-process.mjs';
import {draft,emptyShot,timeline} from '../shared/model.mjs';import {filmIssues} from '../shared/film.mjs';import {scienceGate} from '../shared/science-flow.mjs';import {voiceMusicPlan} from '../shared/voice-music.mjs';
test('local renderer accepts only reviewed templates and bounded numeric parameters',()=>{
 assert.equal(localSpec({engine:'anatomy'}).duration,8);
 assert.equal(localSpec({engine:'anatomy',index:2}).index,2);
 for(const index of [-2,7,1.5,Infinity])assert.throws(()=>localSpec({engine:'anatomy',index}));
 for(const p of [{engine:'shell'},{engine:'blender',template:'../escape'},{engine:'blender',duration:Infinity},{engine:'blender',duration:0},{engine:'anatomy',start:-1},{engine:'blender',width:4096},{engine:'blender',fps:120},{engine:'anatomy',view:'code'}])assert.throws(()=>localSpec(p));
 assert.equal(localSpec({engine:'blender',code:'malicious'}).code,undefined);
});
test('motion cycle closes while preserving phase at a shot boundary',()=>{for(const t of [0,.2,12.833333333333,24.875,54.25,97.75]){const a=plotterAt(t),b=plotterAt(t+8);assert.ok(Math.abs(a.y-b.y)<1e-9);assert.ok(Math.abs(Math.hypot(a.x+96,a.y)-38)<1e-9)}assert.equal(plotterAt(24.875).y,plotterAt(12.833333333333334+12.041666666666666).y)});
test('existing refined clips cannot be silently cleared by an SVG result',()=>{assert.throws(()=>protectProcess({processVideoId:'original'}));assert.throws(()=>protectProcess({processEngine:'blender'}));assert.throws(()=>protectProcess({processEngine:'anatomy'}));assert.doesNotThrow(()=>protectProcess({motionPlan:{}}))});
test('local route makes BGM optional but retains footage, evidence and director checks',()=>{const p={...draft('science'),productionMode:'local-process',scienceFlow:{},shots:[{...emptyShot(),zh:'测试'}]};assert.deepEqual(scienceGate(p),[]);assert.equal(voiceMusicPlan(p,p.shots[0].id,'zh'),null);const issues=filmIssues(p,'zh');assert.ok(issues.some(s=>s.includes('科学结论')));assert.ok(issues.some(s=>s.includes('连续动画')));assert.ok(issues.some(s=>s.includes('时间码')))});
test('microsecond-rounded audio metadata does not add a spurious frame',()=>{const s={...emptyShot(),seconds:12.0416666667,assetIds:['a']};const p={...draft('science'),fps:24,shots:[s],assets:[{id:'a',kind:'audio',role:'zh',duration:12.041667}]};assert.equal(timeline(p).frames,289)});

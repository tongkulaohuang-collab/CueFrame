import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {autoMotionContext,selectableEffects} from '../shared/auto-motion.mjs';
import {compileAutoMotion} from '../server/auto-motion.mjs';
import {templatePlan} from '../shared/library-compiler.mjs';
import {defaultParams} from '../shared/motion-library.mjs';
import {particlePoints} from '../shared/particle-motion.mjs';
import {validateMotionResult,motionPrompt} from '../server/motion.mjs';
import {motionFixture} from './fixtures/motion.mjs';
const pick=(effectId,targets,params={})=>({effectId,targets,params:{...defaultParams(effectId),...params},reason:'强调当前可见对象的变化'});
test('AI 所见目录与结构化回执使用同一真实组件集合',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL('../server/motion.schema.json',import.meta.url)));
 assert.deepEqual(schema.properties.effectSelections.items.anyOf.map(s=>s.properties.effectId.enum[0]),selectableEffects.map(e=>e.id));
 const {p}=motionFixture();const prompt=motionPrompt(p,{shotId:p.shots[0].id});
 for(const id of ['typewriter','text-rise','text-gradient','gradient','particles'])assert.ok(prompt.includes(id));
 assert.equal(autoMotionContext().templates.length,4);
});
test('AI 回执真正编译文字、粒子和渐变，拒绝假目标与主体消失',()=>{
 const base=templatePlan('mechanism',defaultParams('mechanism'));
 const result=compileAutoMotion(base,[pick('typewriter',['label']),pick('particles',['subject']),pick('gradient',[])]);
 assert.equal(result.plan.nodes.find(n=>n.id==='label').libraryEffects[0].kind,'typewriter');
 assert.equal(result.plan.nodes.find(n=>n.id==='subject').libraryEffects[0].kind,'particles');
 assert.equal(result.transition.kind,'gradient');assert.equal(base.nodes[2].libraryEffects,undefined);
 const textSubject=structuredClone(base);textSubject.nodes.find(n=>n.id==='subject').text={...base.nodes.find(n=>n.id==='label').text};
 assert.throws(()=>compileAutoMotion(textSubject,[pick('typewriter',['subject'])]),/主体/);
 assert.throws(()=>compileAutoMotion(base,[pick('particles',['missing'])]),/目标/);
 assert.throws(()=>compileAutoMotion(base,[pick('gradient',[]),pick('fade',[])]),/一个转场/);
 assert.throws(()=>compileAutoMotion(base,[pick('particles',['subject'],{count:10000})]),/范围/);
});
test('粒子在预览、跳帧和渲染时使用同一确定性时间函数',()=>{
 for(const mode of ['burst','flow','orbit']){
  const q={...defaultParams('particles'),mode};
  assert.deepEqual(particlePoints(q,1,540),particlePoints(q,1,540));
  assert.notDeepEqual(particlePoints(q,.5,540),particlePoints(q,1.5,540));
  assert.deepEqual(particlePoints(q,-1,540),[]);assert.deepEqual(particlePoints(q,2,540),[]);
  assert.ok(particlePoints(q,1,540).every(p=>Object.values(p).every(Number.isFinite)));
 }
});
test('原动画校验链采用 AI 选中的转场与粒子并保留原脚本',()=>{
 const {p,raw}=motionFixture();const source=structuredClone(raw),before=JSON.stringify(p);
 source.effectSelections=[pick('gradient',[],{duration:.5}),pick('particles',[source.motion.subjectId],{until:1.5})];
 const result=validateMotionResult(source,p,{shotId:p.shots[0].id})[0];
 assert.equal(result.libraryTransition.kind,'gradient');
 assert.equal(result.motionPlan.effectSelections.length,2);assert.equal(JSON.stringify(p),before);
});

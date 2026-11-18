import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,emptyShot,update} from '../shared/model.mjs';
import {filmStyleContext} from '../shared/film-style.mjs';
import {visualStyleInputKey,referenceStyleStatus,validateReferenceAppearance} from '../shared/visual-style.mjs';
import {motionReferences,referenceMotionKey} from '../shared/reference-motion.mjs';
import {scienceGate,scriptNeeds} from '../shared/science-flow.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {filmProps} from '../shared/film.mjs';
import {repairPlan} from '../shared/content-contract.mjs';
import {designInputKey} from '../shared/director-quality.mjs';
import {alignRecognizedText} from '../shared/voice-alignment.mjs';
import {sciencePrompt} from '../server/science-ai.mjs';
import {materialPrompt} from '../server/materials.mjs';
import {validateReferenceAnalysis} from '../server/reference-motion.mjs';
import {referenceAppearanceFixture} from './fixtures/reference-style.mjs';

function fixture() {
 const p={...draft('science'),id:'style-priority',topic:'测试参考优先级',productionMode:'model-process',width:960,height:540,scienceFlow:{}};
 p.shots=[0,1].map(i=>({...emptyShot(),id:'s'+i,zh:'先看，结果。',silentOK:true,seconds:6,reviewed:true,handoff:{mode:i?'continue':'compare',reason:'同一对象持续比较'},
  semanticScene:{version:1,family:'comparison',style:'editorial',title:'',unit:'',items:[{id:'a',label:'甲',value:i?30:10,to:i?45:30},{id:'b',label:'乙',value:i?40:20,to:i?55:40}]}}));
 return p;
}
function resolve(p,style='自编参考配色') {
 p.scienceFlow.style=style;
 p.scienceFlow.referenceScript={visualStyle:referenceAppearanceFixture(),visualStyleInputs:visualStyleInputKey(p)};
 return p;
}
test('default applies only without references; selected reference overrides every legacy preset',()=>{
 const p=fixture();assert.equal(sceneProps(p,'s0').shot.motionPlan.bg,'#f4eee2');
 for(const preset of ['editorial','technical','minimal']) {
  p.filmStyle.preset=preset;resolve(p);const context=filmStyleContext(p),plan=sceneProps(p,'s0').shot.motionPlan;
  assert.equal(context.source,'reference');assert.equal(context.preset,'reference');assert.equal(plan.bg,'#101827');
  assert.equal(plan.nodes.find(n=>n.id==='sem-a').paths[0].fill,'#55e0c1');
  assert.equal(plan.nodes.find(n=>n.id==='sem-label-a').text.color,'#eef6ff');
 }
 p.scienceFlow={};assert.equal(filmStyleContext(p).source,'default');assert.equal(sceneProps(p,'s0').shot.motionPlan.bg,'#ffffff');
});
test('pending and changed references never silently render with old paper colors',()=>{
 const p=fixture();p.scienceFlow.style='黑底霓虹';
 assert.equal(filmStyleContext(p).theme,undefined);assert.equal(referenceStyleStatus(p).ready,false);
 assert.throws(()=>sceneProps(p,'s0'),/参考风格待解析/);assert.ok(scienceGate(p).some(s=>s.includes('参考风格待解析')));
 resolve(p);p.scienceFlow.style='另一份参考';assert.throws(()=>sceneProps(p,'s0'),/参考风格待解析/);
 assert.doesNotThrow(()=>update(p,structuredClone(p)));
});
test('a current single observed reference feeds the model directly; excluded or stale reports cannot',()=>{
 const p=fixture();p.scienceFlow.lemoStyleId='kino-montage';const ref=motionReferences(p)[0];
 const report={referenceId:ref.id,inputKey:referenceMotionKey(ref),mediaHash:'test',summary:'测试',segments:[{from:0,until:2}],appearance:referenceAppearanceFixture()};
 p.scienceFlow.referenceMotion=[report];assert.equal(sceneProps(p,'s0').shot.motionPlan.bg,'#101827');
 p.scienceFlow.referenceMotion=[{...report,inputKey:'stale'}];assert.equal(referenceStyleStatus(p).ready,false);
 p.scienceFlow.referenceMotion=[{...report,segments:[]}];assert.equal(referenceStyleStatus(p).ready,false);
});
test('style changes preserve sync settings, object colors, handoff and exact speech landmarks',()=>{
 const p=resolve(fixture()),s=p.shots[0];
 const alignment={...alignRecognizedText(s.zh,{text:'先看结果',tokens:['先','看','结','果'],timestamps:[.5,.8,3,3.4]},4),assetId:'voice',receiptId:'test'};
 p.assets=[{id:'voice',role:'zh',kind:'audio',duration:4,src:'/media/test.wav'}];s.assetIds=['voice'];s.voiceAlignment={zh:alignment};s.subtitleTracks={zh:{assetId:'voice',text:s.zh,segments:alignment.segments,alignmentReceipt:'test'}};s.semanticSync={startQuote:'先看',endQuote:'结果'};
 const original=structuredClone(p),plan=sceneProps(p,'s0').shot.motionPlan,film=filmProps(p);
 assert.equal(plan.semanticModel.speechTiming.start,.5);assert.equal(plan.semanticModel.speechTiming.settle,3);
 assert.deepEqual(plan,film.rows[0].scene.shot.motionPlan);
 assert.ok(sceneProps(p,'s1').shot.motionPlan.semanticModel.matchedHandoff.nodes.length);
 assert.deepEqual(p,original);
});
test('changing reference invalidates model approval and visual cache, while retaining recording and source',()=>{
 const p=resolve(fixture()),key=designInputKey(p,'s0'),next=structuredClone(p);next.scienceFlow.style='新参考';
 const q=update(p,next);assert.ok(q.shots.every(s=>!s.reviewed));assert.notEqual(designInputKey(q,'s0'),key);
 assert.ok(repairPlan(p,q).every(r=>r.preserveAudio&&r.stages.includes('动画')));assert.deepEqual(q.assets,p.assets);
 // Editable/imported form data may not forge the validated receipt.
 const forged=structuredClone(p);forged.scienceFlow.referenceScript.visualStyle.background='#ff0000';
 assert.equal(update(p,forged).scienceFlow.referenceScript.visualStyle.background,'#101827');
});
test('AI script and materials receive the same authority without leaking the legacy palette',()=>{
 const p=resolve(fixture());
 for(const prompt of [sciencePrompt(p,'rhythm'),materialPrompt(p)]) {
  assert.match(prompt,/全片视觉方向以 visualStyle 为准/);assert.match(prompt,/#101827/);assert.doesNotMatch(prompt,/#b83b2d/);
 }
 p.scienceFlow={};assert.ok(!scriptNeeds(p).includes('选定风格和参考模板'));assert.match(sciencePrompt(p,'rhythm'),/"source":"default"/);
});
test('visual parameter validation rejects broken paints and unsafe scales; legacy reports remain readable',()=>{
 for(const patch of [{background:'url(http://bad)'},{colors:[]},{font:'html'},{labelScale:9},{settle:.99}])assert.throws(()=>validateReferenceAppearance({...referenceAppearanceFixture(),...patch}));
 const ref={id:'r',name:'测试'},evidence={duration:2,mediaHash:'hash',sampleFps:4,method:'测试'};
 const raw={complete:true,summary:'测试片段',limitations:'测试',segments:[{from:0,until:2,motion:'变换',rhythm:'停留',camera:'固定',transition:'连续',typography:'标签',effectIds:[],customMotion:'',confidence:'observed'}],appearance:referenceAppearanceFixture()};
 assert.deepEqual(validateReferenceAnalysis(raw,ref,evidence).appearance,raw.appearance);
 delete raw.appearance;assert.equal(validateReferenceAnalysis(raw,ref,evidence).appearance,undefined);
});

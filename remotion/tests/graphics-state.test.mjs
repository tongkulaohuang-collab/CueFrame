import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {parseHTML} from 'linkedom';
import {motionFixture} from './fixtures/motion.mjs';
import {graphicsState,nodeVisualState,morphPath,textRuns,validateGraphics} from '../shared/graphics-state.mjs';
import {worldState} from '../shared/actor-rig.mjs';
import {textPresentation} from '../shared/presentation-plan.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {validateExplanationEvidence} from '../shared/explanation-plan.mjs';
import {compileEffects} from '../shared/library-compiler.mjs';
import {coverageIssues} from '../shared/performance-plan.mjs';
import {shotImagePlan} from '../shared/shot-images.mjs';
import {validateLibraryEffects} from '../shared/motion-library.mjs';

const compiled={exports:{}},require=createRequire(import.meta.url);
const built=buildSync({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MotionArtwork} from './video/MotionScene.jsx';export const render=(plan,time)=>renderToStaticMarkup(<MotionArtwork plan={plan} time={time}/>);`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,logLevel:'silent'});
new Function('require','module','exports',built.outputFiles[0].text)(require,compiled,compiled.exports);
const render=compiled.exports.render;
const frame=(time,more={})=>({time,x:320,y:150,rotation:0,scaleX:1,scaleY:1,opacity:1,...more});
const graphic=()=>({version:1,pivot:null,tracks:[],reveal:null,morphs:[],textStates:[]});
const track=(channel,start,end,d=2)=>({channel,frames:[{time:0,value:start},{time:d,value:end,easing:'linear'}]});
function textFixture(value='甲乙丙丁',lines=['甲乙','丙丁']) {
  const {raw}=motionFixture(),plan=raw.motion;
  const node={id:'title',role:'material',paths:[],text:{value,font:'sans',size:40,weight:600,color:'#ffffff'},frames:[frame(0),frame(1),frame(2)]};
  plan.nodes.push(node);plan.layout={version:1,connectors:[]};
  plan.presentation={version:1,texts:[{nodeId:node.id,role:'title',from:0,until:2,align:'middle',width:250,lines}],beats:[{from:0,until:2,primaryIds:['particle','title'],supportIds:['channel'],reason:'读完两行'}]};
  return {node,plan};
}
function visibleGlyphs(html) {
  const {document}=parseHTML(html);
  return [...document.querySelectorAll('text tspan')].filter(n=>!n.querySelector('tspan')).filter(n=>{
    for(let el=n;el;el=el.parentElement)if(el.hasAttribute('opacity')&&Number(el.getAttribute('opacity'))<=.001)return false;
    return true;
  }).map(n=>n.textContent).join('');
}
test('最终SVG分支保留多行布局，逐字/逐段不提前泄露，渐变真实应用',()=>{
  const {node,plan}=textFixture();node.libraryEffects=[{kind:'typewriter',params:{from:.5,until:1.5}},{kind:'text-gradient',params:{from:0,until:2,colorA:'#ff0000',colorB:'#0000ff'}}];
  assert.doesNotThrow(()=>validateMotion(plan));
  assert.equal(visibleGlyphs(render(plan,.2)),'');assert.equal(visibleGlyphs(render(plan,1)),'甲乙');assert.equal(visibleGlyphs(render(plan,1.8)),'甲乙丙丁');
  const {document}=parseHTML(render(plan,1));assert.match(document.querySelector('[data-text-role]').getAttribute('fill'),/^url\(#lib-/);
  const a=render(plan,.2).match(/<tspan x="0" y="[^"]+"/g),b=render(plan,1.8).match(/<tspan x="0" y="[^"]+"/g);assert.deepEqual(a,b);
  node.text.value='先建立，后比较';plan.presentation.texts[0].lines=['先建立，','后比较'];node.libraryEffects=[{kind:'text',params:{from:.5,until:1.5}}];
  assert.equal(visibleGlyphs(render(plan,.2)),'');assert.equal(visibleGlyphs(render(plan,1.6)),'先建立，后比较');
});
test('主动文字强调不被字号保护抵消，相机放大仍保持可读层级',()=>{
  const {node,plan}=textFixture();node.graphics={...graphic(),tracks:[track('scale',1,1.4)]};
  for(const cameraZoom of [1,2]){plan.camera.forEach(c=>c.zoom=cameraZoom);const state=worldState(plan,1).get(node.id),text=textPresentation(plan,node.id,1);assert.ok(Math.abs(state.matrix[0]*cameraZoom*text.scaleX-1.2)<1e-9);}
});
test('字素保持完整，数字与单位在固定多行布局中正确更新',()=>{
  const {node}=textFixture('100%',['100','%']);node.libraryEffects=[{kind:'counter',params:{from:0,until:2,start:0,end:100,decimals:0,suffix:'%'}}];
  assert.deepEqual(textRuns(node,['100','%'],1).map(line=>line.map(r=>r.char).join('')),['50','%']);
  node.text.value='👩‍💻好';node.libraryEffects=[{kind:'typewriter',params:{from:0,until:2}}];
  assert.equal(textRuns(node,['👩‍💻好'],1)[0].filter(r=>r.opacity===1).map(r=>r.char).join(''),'👩‍💻');
});
test('形变真实改变几何；乱序和保存重开得到同一状态，错误拓扑被拒绝',()=>{
  const {raw}=motionFixture(),plan=raw.motion,n=plan.nodes[1];
  const a='M -10 -10 L 10 -10 L 10 10 L -10 10 Z',b='M 0 -20 L 20 0 L 0 20 L -20 0 Z';n.paths[0].d=a;n.graphics={...graphic(),morphs:[{pathIndex:0,from:a,to:b,frames:track('scale',0,1).frames}]};
  assert.notEqual(graphicsState(n,1,plan).paths[0].d,a);assert.notEqual(graphicsState(n,1,plan).paths[0].d,b);
  const saved=JSON.parse(JSON.stringify(plan));for(const t of [2,.25,1,0,1.5])assert.deepEqual(worldState(plan,t).get(n.id),worldState(saved,t).get(n.id));
  for(const fps of [12,24,30,60])assert.equal(graphicsState(n,fps/fps,plan).paths[0].d,graphicsState(n,1,plan).paths[0].d);
  assert.throws(()=>morphPath(a,'M 0 0 Q 10 10 20 20',.5),/相同命令/);
  assert.throws(()=>morphPath('M 0 0 L 10e 20','M 0 0 L 20 30',.5),/不完整数字/);
  assert.throws(()=>shotImagePlan(plan,[{nodeId:n.id,assetId:'image',box:{x:-10,y:-10,width:20,height:20}}]),/路径形变/);
});
test('文字排版的实际显隐参与证据和观察区检查，不把隐藏内容当已完成',()=>{
  const {node,plan}=textFixture();plan.presentation.texts[0].from=1;
  assert.equal(nodeVisualState(node,.5,plan).visibleOpacity,0);
  const beat={id:'show',from:.5,until:2,intent:'establish',entities:['标题']};
  plan.explanationEvidence=[{beatId:'show',resultAt:1.5,changes:[{entity:'标题',nodeId:node.id,property:'opacity',from:0,to:1}]}];
  assert.doesNotThrow(()=>validateExplanationEvidence(plan,[beat]));
  const event={from:0,until:2,coverage:[{nodeId:node.id,x:-50,y:-20,width:100,height:40,minPixels:8}]};
  assert.ok(coverageIssues(plan,event,.5).length);assert.deepEqual(coverageIssues(plan,event,1.5),[]);
  node.libraryEffects=[{kind:'typewriter',params:{from:0,until:.5}},{kind:'text',params:{from:1,until:2}}];
  assert.throws(()=>validateLibraryEffects(node,2),/通道冲突/);
});
test('主体可入退场，但阅读窗口与关键事件必须真正可见',()=>{
  const {raw}=motionFixture(),plan=raw.motion,n=plan.nodes[1];
  n.graphics={...graphic(),tracks:[{channel:'reveal',frames:[{time:0,value:0},{time:.5,value:1},{time:1.5,value:1},{time:2,value:0}]}],reveal:{direction:'right',bounds:{x:-15,y:-15,width:30,height:30}}};
  assert.throws(()=>validateMotion(plan),/可见窗口/);plan.subjectWindows=[{from:.5,until:1.5,reason:'读取完整结果'}];assert.doesNotThrow(()=>validateMotion(plan));
  const e={from:0,until:2,coverage:[{nodeId:n.id,x:-10,y:-10,width:20,height:20,minPixels:8}]};
  assert.ok(coverageIssues(plan,e,.1).some(s=>s.includes('不可见')));assert.deepEqual(coverageIssues(plan,e,1),[]);
  plan.subjectWindows[0].from=.1;assert.throws(()=>validateMotion(plan),/尚未完整显现/);
});
test('信息替换可核对真实内容；仍拒绝文字替代机制与假形变',()=>{
  const {node,plan}=textFixture('初态',['初态']);node.graphics={...graphic(),textStates:[{from:1,lines:['结果']}]};
  const beat={id:'replace',from:0,until:2,intent:'replace',entities:['文字']};
  plan.explanationEvidence=[{beatId:'replace',resultAt:1.5,changes:[{entity:'文字',nodeId:node.id,property:'textValue',from:'初态',to:'结果'}]}];
  assert.doesNotThrow(()=>validateExplanationEvidence(plan,[beat]));beat.intent='change';assert.throws(()=>validateExplanationEvidence(plan,[beat]),/替代机制/);
});
test('生产接收链保留图形轨道并用实际几何验证上游变化',()=>{
  const {p,raw}=motionFixture({presentation:true}),n=raw.motion.nodes[1];
  const a='M -10 -10 L 10 -10 L 10 10 L -10 10 Z',b='M 0 -20 L 20 0 L 0 20 L -20 0 Z';
  n.paths[0].d=a;n.graphics={...graphic(),morphs:[{pathIndex:0,from:a,to:b,frames:track('scale',0,1).frames}]};
  raw.motion.explanationEvidence[0].changes[0]={entity:'粒子',nodeId:n.id,property:'morph',from:0,to:1};
  const out=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;assert.equal(out.nodes[1].graphics.morphs[0].to,b);
});
test('同通道冲突拒绝；路径效果不覆盖无关的透明度与缩放',()=>{
  const {raw}=motionFixture(),plan=raw.motion,n=plan.nodes[0];n.frames.at(-1).opacity=.4;n.frames.at(-1).scaleX=1.5;
  const line={instanceId:'a',effectId:'line',targets:[n.id],params:{from:0,until:1,x0:20,y0:30,x1:50,y1:30,easing:'smooth'}};
  const out=compileEffects(plan,[line]).plan.nodes[0];assert.equal(out.frames.at(-1).opacity,.4);assert.equal(out.frames.at(-1).scaleX,1.5);
  assert.throws(()=>compileEffects(plan,[line,{...line,instanceId:'b'}]),/通道冲突/);
  n.graphics={...graphic(),tracks:[track('scale',1,2),track('scale',1,3)]};assert.throws(()=>validateGraphics(n,2),/重复/);
});

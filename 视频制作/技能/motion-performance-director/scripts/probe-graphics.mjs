// Read-only, in-memory probes. No project, renderer, asset, or approval is changed.
// node probe-graphics.mjs C:/absolute/path/to/gzl
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

if (!process.argv[2]) throw Error('Supply the workspace absolute path.');
const root=resolve(process.argv[2], 'remotion');
const require=createRequire(pathToFileURL(resolve(root,'package.json')));
const {build}=require('esbuild');
const {parseHTML}=require('linkedom');
const built=await build({stdin:{contents:`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {LibraryNode,libraryNodeState} from './video/LibraryEffects.jsx';
  export {libraryNodeState};
  export const markup=(node,plan,time)=>renderToStaticMarkup(
    <svg><LibraryNode node={node} plan={plan} time={time} fps={24}/></svg>);
`,resolveDir:root,sourcefile:'graphics-probe.jsx',loader:'jsx'},bundle:true,
  platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent'});
const compiled={exports:{}};
// Only the local renderer above is compiled; no remote or model-supplied code.
new Function('require','module','exports',built.outputFiles[0].text)(require,compiled,compiled.exports);
const {markup,libraryNodeState}=compiled.exports;
const load=relative=>import(pathToFileURL(resolve(root,relative)).href);
const [{textPresentation},{compileEffects},{motionFixture},{validateExplanationEvidence},{nodeVisualState}]=await Promise.all([
  load('shared/presentation-plan.mjs'),load('shared/library-compiler.mjs'),
  load('tests/fixtures/motion.mjs'),load('shared/explanation-plan.mjs'),load('shared/graphics-state.mjs')]);
const frame=time=>({time,x:640,y:300,rotation:0,scaleX:1,scaleY:1,opacity:1});
function fixture(value='甲乙',lines=[value]) {
  const node={id:'text',role:'mechanism',paths:[],text:{value,font:'sans',size:36,weight:700,color:'#ffffff'},frames:[frame(0),frame(2),frame(4)]};
  const plan={width:1280,height:720,duration:4,bg:'#101e2a',subjectId:'text',nodes:[node],annotations:[],
    camera:[{time:0,x:640,y:360,zoom:1},{time:4,x:640,y:360,zoom:1}],
    presentation:{version:1,texts:[{nodeId:'text',role:'title',from:0,until:4,align:'middle',width:600,lines}],
      beats:[{from:0,until:4,primaryIds:['text'],supportIds:[],reason:'Read the title'}]}};
  return {node,plan};
}
const results=[];
// Fixed-position invisible glyphs are required for stable layout. Count only
// text nodes whose complete ancestor chain is visible, rather than raw markup.
const visibleText=html=>{
  const {document}=parseHTML(html);let text='';
  const walk=el=>{if(el.nodeType===3){let opacity=1;for(let p=el.parentElement;p;p=p.parentElement)opacity*=Number(p.getAttribute('opacity')??1);if(opacity>.001)text+=el.textContent;}else for(const c of el.childNodes||[])walk(c);};
  walk(document);return text;
};
{
  const {node,plan}=fixture('甲乙',['甲','乙']);
  node.libraryEffects=[{kind:'typewriter',params:{from:1,until:3}}];
  const time=.5,html=markup(node,plan,time);
  results.push({name:'multiline_typewriter_before_start',time,
    expectedLetters:libraryNodeState(node,time,24).letters,renderedText:visibleText(html),
    mismatch:visibleText(html).length>0});
}
{
  const {node,plan}=fixture('先建立，后比较');
  node.libraryEffects=[{kind:'text',params:{from:1,until:3}}];
  const time=.5,html=markup(node,plan,time);
  results.push({name:'phrase_reveal_before_start',time,expected:'not yet revealed',
    renderedText:visibleText(html),mismatch:visibleText(html).length>0});
}
{
  const {node,plan}=fixture();
  node.libraryEffects=[{kind:'text-gradient',params:{from:0,until:3,colorA:'#ff0000',colorB:'#0000ff'}}];
  const html=markup(node,plan,1),fill=html.match(/<text\b[^>]*\bfill="([^"]+)"/)?.[1];
  results.push({name:'presentation_gradient',gradientDefined:html.includes('<linearGradient'),
    textFill:fill,mismatch:!fill?.startsWith('url(')});
}
{
  const {node,plan}=fixture();
  node.graphics={version:1,tracks:[{channel:'scale',frames:[{time:0,value:1.25,easing:'linear'},{time:4,value:1.25,easing:'linear'}]}],morphs:[],textStates:[]};
  const text=textPresentation(plan,node.id,1);
  const screenScale=nodeVisualState(node,1,plan).scaleX*text.scaleX;
  results.push({name:'explicit_text_scale_preserved',requestedScale:1.25,
    screenScale,mismatch:Math.abs(screenScale-1.25)>1e-8,classification:'native graphics.scale is separate from legacy layout scale'});
}
{
  const {raw}=motionFixture();
  try {
    compileEffects(raw.motion,[{instanceId:'reveal',effectId:'mask',targets:['particle'],params:{from:0,until:1,width:20}}]);
    results.push({name:'subject_reveal',accepted:true});
  } catch(error) {results.push({name:'subject_reveal',accepted:false,error:error.message,
    classification:'expected: continuous subject cannot disappear without scoped visibility windows'});}
}
{
  const {raw}=motionFixture();raw.motion.subjectWindows=[{from:1,until:raw.motion.duration,reason:'Read the fully revealed subject'}];
  try {compileEffects(raw.motion,[{instanceId:'reveal',effectId:'mask',targets:['particle'],params:{from:0,until:1,width:20}}]);results.push({name:'subject_reveal_scoped',accepted:true,mismatch:false});}
  catch(error){results.push({name:'subject_reveal_scoped',accepted:false,mismatch:true,error:error.message});}
}
{
  const {node,plan}=fixture('42');
  node.frames[0].x=500;node.frames[1].x=640;
  const beat={id:'text-change',from:0,until:2,intent:'change',entities:['value']};
  plan.explanationEvidence=[{beatId:'text-change',resultAt:2,changes:[{entity:'value',nodeId:'text',property:'x',from:500,to:640}]}];
  try {validateExplanationEvidence(plan,[beat]);results.push({name:'text_mechanism_guard',accepted:true});}
  catch(error) {results.push({name:'text_mechanism_guard',accepted:false,error:error.message,
    classification:'valid protection against fake mechanism; add explicit typography/value semantics instead of bypassing it'});}
}
const files=['shared/graphics-state.mjs','shared/content-visibility.mjs','shared/actor-rig.mjs','video/LibraryEffects.jsx','video/PresentationText.jsx','shared/presentation-plan.mjs',
  'shared/library-compiler.mjs','shared/explanation-plan.mjs','server/motion.schema.json'];
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,
  createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')])));
console.log(JSON.stringify({scope:'Synthetic data and React static markup only. No browser playback, video render, audio review, or full-pipeline approval.',
  hashes,results},null,2));

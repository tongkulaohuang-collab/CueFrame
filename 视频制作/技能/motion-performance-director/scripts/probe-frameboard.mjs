// Read-only diagnostic of the Frameboard modules named in the 2026-11-16 plan.
// Usage: node probe-frameboard.mjs C:/absolute/path/to/gzl
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const workspace=process.argv[2];
if(!workspace)throw new Error('Supply the workspace absolute path.');
const root=resolve(workspace,'remotion');
const mod=relative=>import(pathToFileURL(resolve(root,relative)).href);
const [{motionFixture},{actionRequirements,validateDesignEvidence},{validateExplanationEvidence},{validateCameraPlan},{shotImagePlan}]=await Promise.all([
  mod('tests/fixtures/motion.mjs'),mod('shared/director-quality.mjs'),mod('shared/explanation-plan.mjs'),
  mod('shared/camera-plan.mjs'),mod('shared/shot-images.mjs')
]);
const files=['video/MotionScene.jsx','shared/motion-dynamics.mjs','shared/director-quality.mjs',
  'shared/explanation-plan.mjs','shared/camera-plan.mjs','shared/shot-images.mjs','server/motion.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const {p,raw}=motionFixture(),id=p.shots[0].id,m=raw.motion;
p.scienceFlow.rhythm='• 0.8｜cueId=design｜对象=购物者｜动作=行走，双腿交替迈步｜形式=motion';
// Synthetic static strokes, deliberately without a local pose track.
m.nodes[1].paths=Array.from({length:10},(_,i)=>({d:`M ${i} 0 L ${i+1} 10`,fill:'none',stroke:'#ffffff',strokeWidth:2}));
m.actionEvidence=[{requirementId:actionRequirements(p,id)[0].id,nodeIds:['particle'],from:0,until:2,technique:'motion',note:'购物者双腿交替迈步'}];
const beat={id:'walking',shotId:id,from:0,until:2,intent:'change',entities:['购物者'],before:'左侧站立',after:'交替迈步走到右侧',dependsOn:[]};
p.scienceFlow.referenceScript={explanationBeats:[beat]};
m.explanationEvidence=[{beatId:'walking',resultAt:2,changes:[{entity:'购物者',nodeId:'particle',property:'x',from:80,to:550}]}];
const results=[];
for(const [name,check] of [['rigid_actor_action',()=>validateDesignEvidence(m,p,id)],['rigid_actor_explanation',()=>validateExplanationEvidence(m,[beat])]]) {
  try {check();results.push({name,accepted:true,internalPoseChanges:0,rootTranslation:470});}
  catch(error){results.push({name,accepted:false,error:error.message});}
}
const cameraPlan=structuredClone(m);
cameraPlan.camera.forEach(frame=>{frame.x=100000;frame.y=100000;});
try {
  validateCameraPlan(cameraPlan,{required:true,fps:12,purposeDriven:true});
  results.push({name:'offscreen_focus_camera_module',accepted:true,focusId:cameraPlan.cameraShots[0].focusId});
} catch(error){results.push({name:'offscreen_focus_camera_module',accepted:false,error:error.message});}
const bound=shotImagePlan(m,[{nodeId:'particle',assetId:'single-pose',box:{x:-20,y:-30,width:40,height:60}}]);
results.push({name:'whole_actor_image_binding',pathsBefore:m.nodes[1].paths.length,pathsAfter:bound.nodes[1].paths.length,mediaAsset:bound.nodes[1].media.assetId});
console.log(JSON.stringify({
  scope:'Isolated module probes with synthetic in-memory data; no render, project mutation, visual approval, or full-pipeline claim.',
  sourceHashes,results
},null,2));

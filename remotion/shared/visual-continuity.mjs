import {validateMotion,motionAt} from './motion-plan.mjs';
import {cameraAt} from './camera-plan.mjs';
import {compileMotionBindings} from './motion-bindings.mjs';

export const VISUAL_SCOPE_VERSION=3;
export function needsVisualScopeUpdate(p,shotId) {
  const lock=p.shots?.find(s=>s.id===shotId)?.motionPlan?.visualLock;
  return p.kind==='science'&&Boolean(lock&&(lock.version||1)<VISUAL_SCOPE_VERSION);
}

export function proofPlan(frame) {
  const s=frame.scene;
  if(!s)return null;
  return {width:s.width,height:s.height,duration:1,bg:s.bg,subjectId:s.subjectId,...(s.printTexture?{printTexture:true}:{}),
    ...(s.actors?{actors:s.actors}:{}),
    nodes:s.nodes.map(n=>{const {id,...pose}=s.poses.find(p=>p.id===n.id)||{};return {...n,frames:[0,.5,1].map(time=>({...pose,time}))};}),
    camera:[{...s.camera,time:0},{...s.camera,time:1}],annotations:[]};
}

export function validateSharedProofs(raw,p,end,{mode='legacy-anchors',onAdjustment}={}) {
  const scenes=(raw.scenes||[raw.scene]).map((s,i)=>compileMotionBindings(s,[],{onAdjustment,path:raw.scenes?`scenes[${i}]`:'scene'}));
  if(!scenes.length||scenes.length>3||scenes.some(s=>!s||!Array.isArray(s.nodes))||raw.frames?.length!==3)throw Error('效果图缺少场景主体设计');
  if(raw.scenes&&new Set(scenes.map(s=>s.id)).size!==scenes.length)throw Error('效果图场景编号重复');
  return raw.frames.map((f,i)=>{
    const scene=raw.scenes?scenes.find(s=>s.id===f.sceneId):scenes[0];
    if(!scene)throw Error('效果图引用了不存在的场景');
    if(!Number.isFinite(f.time)||f.time<0||f.time>=end||(i&&f.time<=raw.frames[i-1].time)||
      typeof f.caption!=='string'||!f.caption.trim()||!Array.isArray(f.poses)||f.poses.length!==scene.nodes.length||
      new Set(f.poses.map(n=>n.id)).size!==scene.nodes.length||scene.nodes.some(n=>!f.poses.some(v=>v.id===n.id)))
      throw Error('效果图的时间或对象姿态不完整');
    const frame={time:Math.round(f.time*p.fps)/p.fps,caption:f.caption,bg:scene.bg,paths:[],constraintMode:mode,
      scene:{...structuredClone(scene),width:p.width,height:p.height,poses:structuredClone(f.poses),camera:structuredClone(f.camera)}};
    validateMotion(proofPlan(frame));
    if(frame.time>=end||(i&&frame.time<=Math.round(raw.frames[i-1].time*p.fps)/p.fps))throw Error('效果图时间量化后重叠或超出片长');
    return frame;
  });
}

const identity=s=>JSON.stringify([s.width,s.height,s.bg,s.subjectId,s.nodes,...(s.actors?[s.actors]:[])]);
const epsilon=.00001;

// A reusable design library, not a compulsory inventory for every shot.
export function visualReference(proofs=[],at=null) {
  if(!proofs?.length||proofs.some(f=>!f.scene))return null;
  const distinct=[...new Map(proofs.map(f=>[identity(f.scene),f.scene])).values()];
  // Legacy boards with no scene IDs still require one consistent design.
  if(distinct.length>1&&distinct.some(s=>!s.id))throw Error('效果图之间的主体设计不一致，请为不同环境指定场景编号');
  const selected=at==null?proofs[0]:proofs.find(f=>f.time>=at)||proofs.at(-1);
  const scene=selected.scene,key=identity(scene);
  return {version:VISUAL_SCOPE_VERSION,key,mode:proofs.every(f=>f.constraintMode==='design-guide')?'design-guide':'legacy-anchors',scene:{width:scene.width,height:scene.height,bg:scene.bg,subjectId:scene.subjectId,nodes:scene.nodes,...(scene.actors?{actors:scene.actors}:{})},
    ...(distinct.length>1?{scenes:distinct}: {})};
}

export function visualContract(proofs=[],start=0,duration=0) {
  // The frame at a cut belongs to the following shot, not both shots.
  const frames=proofs.filter(f=>f.time>=start-epsilon&&f.time<start+duration-epsilon);
  if(!frames.length)return null;
  const reference=visualReference(frames);
  if(!reference)return null;
  if(reference.mode==='design-guide')return null;
  if(reference.scenes?.length>1)throw Error('同一口播段的效果图使用了不同场景；请把跨环境切镜拆为相邻段，或让本段图版使用同一场景');
  const required=new Set([reference.scene.subjectId]);
  for(const f of frames)for(const pose of f.scene.poses)if(pose.opacity>0)required.add(pose.id);
  // Keep the whole articulated design when any of its parts is observed.
  for(const a of reference.scene.actors||[])if(a.parts.some(p=>required.has(p.nodeId)))a.parts.forEach(p=>required.add(p.nodeId));
  return {...reference,scope:'shot',start,end:start+duration,
    scene:{...reference.scene,nodes:reference.scene.nodes.filter(n=>required.has(n.id))},
    anchors:frames.map(f=>({time:Math.max(0,f.time-start),poses:f.scene.poses,camera:f.scene.camera}))};
}

// Reused objects keep their design. Each shot may omit unrelated objects and
// add its own. Only proof frames in this shot constrain its composition.
export function inheritVisuals(motion,contract,previous=null,next=null,reference=contract) {
  if(!reference&&!contract)return motion;
  if(!contract&&reference?.mode==='design-guide'){
    motion.visualLock={version:VISUAL_SCOPE_VERSION,key:reference.key,scope:'design-guide',requiredNodeIds:[],proofTimes:[],anchorTimes:[]};
    return validateMotion(motion);
  }
  const scene=(contract||reference).scene;
  if(scene.width!==motion.width||scene.height!==motion.height)throw Error('效果图画幅已变化，请重新生成图版');
  const designs=new Map(scene.nodes.map(n=>[n.id,n]));
  const ids=new Set(motion.nodes.map(n=>n.id));
  if(contract) {
    const missing=contract.scene.nodes.filter(n=>!ids.has(n.id)).map(n=>n.id);
    if(missing.length)throw Error('本镜动画对象与效果图不一致，缺少图中可见对象：'+missing.join('、')+'；可以另外添加本镜所需对象');
    if(motion.subjectId!==contract.scene.subjectId)throw Error('本镜动画主体与对应效果图不一致，请保留图中主体；可另外添加本镜所需对象');
    motion.bg=contract.scene.bg;
  }
  motion.nodes=motion.nodes.map(n=>{
    const design=designs.get(n.id);if(!design)return n;
    if(n.rig&&JSON.stringify(n.rig)!==JSON.stringify(design.rig))throw Error('图版的 '+n.id+' 尚未采用当前部件结构，请用同一主体设计重新制作图版');
    return {...structuredClone(design),...(n.role?{role:n.role}:{}),...(n.attachments?{attachments:n.attachments}:{}),frames:n.frames};
  });
  if(contract) {
    const locked=new Set(contract.scene.nodes.map(n=>n.id));
    const ordered=contract.scene.nodes.map(n=>motion.nodes.find(v=>v.id===n.id));
    let index=0;
    motion.nodes=motion.nodes.map(n=>locked.has(n.id)?ordered[index++]:n);
  }
  const anchors=(contract?.anchors||[]).map(a=>({...a,proof:true}));
  for(const [neighbor,time] of [[previous,0],[next,motion.duration]]) {
    const incoming=time===0?motion:neighbor;
    // A setting cut preserves identity through the bridge, not world poses.
    // Carrying poses across this cut resurrected objects from the old scene.
    if(incoming?.sceneDesign?.transition==='cut')continue;
    if(neighbor?.visualLock?.key===(contract||reference).key&&neighbor.subjectId===motion.subjectId&&
      !anchors.some(a=>Math.abs(a.time-time)<epsilon)){
      const t=time===0?neighbor.duration:0;
      const common=neighbor.nodes.filter(n=>motion.nodes.some(v=>v.id===n.id&&JSON.stringify(v.paths)===JSON.stringify(n.paths)));
      const cut=time===0?motion.cameraShots?.[0]?.transition==='cut':neighbor.cameraShots?.[0]?.transition==='cut';
      if(common.some(n=>n.id===motion.subjectId))anchors.push({time,
        poses:common.map(n=>({id:n.id,...motionAt(n.frames,t)})),camera:cut?null:cameraAt(neighbor,t)});
    }
  }
  const insert=(frames,points)=>{
    const out=frames.filter(f=>!points.some(p=>Math.abs(p.time-f.time)<epsilon));
    return [...out,...points].sort((a,b)=>a.time-b.time);
  };
  for(const n of motion.nodes)n.frames=insert(n.frames,anchors.flatMap(a=>{
    const found=a.poses.find(v=>v.id===n.id);
    if(found){const {id,time:ignored,...pose}=found;const existing=n.frames.find(f=>Math.abs(f.time-a.time)<epsilon);
      return [{...pose,time:a.time,...(existing?.easing?{easing:existing.easing}:{}),...(existing?.curve?{curve:existing.curve}:{}),...(existing?.draw!=null?{draw:existing.draw}:{})}];}
    // A design proof is not an exhaustive scene inventory. Preserve new causal
    // objects at the proof time; hiding them here caused one-frame dropouts.
    return [];
  }));
  motion.camera=insert(motion.camera,anchors.filter(a=>a.camera).map(a=>{
    const existing=motion.camera.find(f=>Math.abs(f.time-a.time)<epsilon);
    return {...a.camera,time:a.time,...(existing?.easing?{easing:existing.easing}:{})};
  }));
  motion.visualLock={version:VISUAL_SCOPE_VERSION,key:(contract||reference).key,scope:'shot',
    requiredNodeIds:contract?.scene.nodes.map(n=>n.id)||[],
    proofTimes:contract?.anchors.map(a=>a.time)||[],anchorTimes:anchors.map(a=>a.time)};
  return validateMotion(motion);
}

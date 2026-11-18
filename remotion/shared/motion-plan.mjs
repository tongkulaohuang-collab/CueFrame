import {timeline} from './model.mjs';
import {validateCameraPlan} from './camera-plan.mjs';
import {sampleMotion,validateDynamics,validateNodeContent,motionImageAsset} from './motion-dynamics.mjs';
import {validateLibraryEffects} from './motion-library.mjs';
import {validateSceneDesign} from './scene-design.mjs';
import {bindingIssues,shotImagePlan} from './shot-images.mjs';
import {validateRig} from './actor-rig.mjs';
import {actorDesigns,mergeActorCatalog,actorCatalogInput} from './actor-catalog.mjs';
import {performanceRequirements,validatePerformance} from './performance-plan.mjs';
import {actionTiming} from './action-timing.mjs';
import {validateLayout} from './layout-geometry.mjs';
import {validatePresentation} from './presentation-plan.mjs';
import {explanationBeats,validateExplanationEvidence} from './explanation-plan.mjs';
import {validateGraphics,nodeVisualState} from './graphics-state.mjs';
import {validateSemanticBinding} from './semantic-scenes.mjs';
import {semanticOptions} from './semantic-context.mjs';
import {handoffInputs,filmStyleContext} from './film-style.mjs';
import {validateImageTextLayers,shotVisualAssetIds} from './image-text-layers.mjs';
import {assertMotionStructure} from './motion-structure.mjs';
// Declarative artwork only: no scripts, HTML, arbitrary URLs or executable output.
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const paint=v=>v==='none'||/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(v||'');
const pathOK=v=>typeof v==='string'&&v.length<=12000&&/^\s*[Mm][MmZzLlHhVvCcSsQqTtAaEe\d.,+\s-]+$/.test(v);
export function validateMotion(plan) {
  if(!plan||!finite(plan.width,160,4096)||!finite(plan.height,160,4096)||
    !finite(plan.duration,.25,3600)||!paint(plan.bg)||!Array.isArray(plan.nodes)||!plan.nodes.length||plan.nodes.length>160)
    throw Error('动画场景不完整，尚未生成样镜');
  if(plan.printTexture!=null&&typeof plan.printTexture!=='boolean')throw Error('纸张质感设置无效');
  assertMotionStructure(plan);
  const ids=new Set(),range=Math.max(plan.width,plan.height)*4;
  let pathCount=0;
  const track=(frames,keys,label)=>{
    if(!Array.isArray(frames)||frames.length<2||frames.length>64||frames[0].time!==0||Math.abs(frames.at(-1).time-plan.duration)>.001||
      frames.some((f,i)=>!finite(f.time,0,plan.duration)||(i&&f.time<=frames[i-1].time)||keys.some(([k,min,max])=>!finite(f[k],min,max))))
    {
      const bad=Array.isArray(frames)?frames.findIndex((f,i)=>!finite(f.time,0,plan.duration)||(i&&f.time<=frames[i-1].time)||keys.some(([k,min,max])=>!finite(f[k],min,max))):-1;
      const detail=bad>=0?`第 ${bad+1} 帧（${frames[bad]?.time??'缺失'} 秒）时间未递增或数值越界`:`轨迹必须从 0 秒覆盖到 ${plan.duration} 秒，包含 2–64 个关键帧`;
      throw Error(`动画运动轨迹不完整：${label} · ${detail}`);
    }
  };
  for(const n of plan.nodes) {
    ids.add(n.id);pathCount+=n.paths.length;
    if(pathCount>1200||n.paths.some(p=>!pathOK(p.d)||!paint(p.fill)||!paint(p.stroke)||!finite(p.strokeWidth,0,80)))
      throw Error('动画形状无效');
    track(n.frames,[['x',-range,range],['y',-range,range],['rotation',-1440,1440],['scaleX',.05,10],['scaleY',.05,10],['opacity',0,1]],'对象 '+n.id);
    validateDynamics(n.frames,range);validateNodeContent(n,paint,finite);
    validateLibraryEffects(n,plan.duration);
    validateGraphics(n,plan.duration);
  }
  track(plan.camera,[['x',-range,range],['y',-range,range],['zoom',.2,5]],'相机');
  const subject=plan.nodes.find(n=>n.id===plan.subjectId);
  if(!subject||subject.frames.length<3||!plan.subjectWindows&&subject.frames.some(f=>f.opacity<.95))
    throw Error('主体须有至少三个关键帧并保持可见');
  if(plan.subjectWindows!=null){
    if(!Array.isArray(plan.subjectWindows)||!plan.subjectWindows.length||plan.subjectWindows.length>24)throw Error('主体可见窗口无效');
    let end=0;
    for(const w of plan.subjectWindows){
      if(!finite(w.from,end,plan.duration)||!finite(w.until,w.from+.2,plan.duration)||typeof w.reason!=='string'||!w.reason.trim())throw Error('主体可见窗口须递增并说明阅读或机制用途');
      for(let t=w.from;t<w.until;t+=1/60){const v=nodeVisualState(subject,t,plan);if(v.opacity<.95||v.reveal<.95||v.textProgress<.95)throw Error('主体在声明的阅读或机制窗口尚未完整显现');}
      end=w.until;
    }
  }else if(subject.graphics||subject.libraryEffects?.length){
    for(let t=0;t<plan.duration;t+=1/60){const v=nodeVisualState(subject,t,plan);if(v.opacity<.95||v.reveal<.95||v.textProgress<.95)throw Error('主体进出须声明实际可见窗口');}
  }
  if(!Array.isArray(plan.annotations)||plan.annotations.length>12)throw Error('动画注释须为列表，且最多 12 条');
  for(const [i,a] of plan.annotations.entries()) {
    const label=`第 ${i+1} 条画面注释`;
    if(!a||!ids.has(a.nodeId))throw Error(label+'没有对应的动画对象');
    if(typeof a.text!=='string'||!a.text.trim())throw Error(label+'缺少文字');
    const length=[...a.text].length;
    if(length>24)throw Error(`${label}太长（${length} 个字符，最多 24 个），生成结果已保留`);
    if(!finite(a.from,0,plan.duration)||!finite(a.until,a.from+.1,plan.duration))throw Error(label+'的显示时间超出镜头范围或不足 0.1 秒');
    if(!finite(a.x,-range,range)||!finite(a.y,-range,range))throw Error(label+'的位置无效');
  }
  validateSceneDesign(plan);
  validateRig(plan);
  actorDesigns(plan);
  validateLayout(plan);
  validatePresentation(plan);
  return validateCameraPlan(plan);
}

// A render-time check, not a claim that visual or scientific review has passed.
export function motionInputs(p,s) {
  const f=p.scienceFlow||{};
  const row=timeline(p).rows.find(r=>r.shot.id===s.id);
  return JSON.stringify([p.width,p.height,p.fps,p.voice,p.language,p.target,p.captionMode,
    // Translated display lines are derived from s.zh/s.en below. Adding them to
    // precise cues must not invalidate an unchanged animation or paid audio.
    row&&[row.from,row.frames,row.captionCues.map(c=>c.timing==='精确起止'?{
      from:c.from,until:c.until,lang:c.lang,[c.lang]:c[c.lang],timing:c.timing,
    }:c)],
    f.rhythm,f.style,f.template,f.lemoStyleId||'',f.proofs,f.feedback,f.bgmId,f.analysis,
    ...(filmStyleContext(p)?.source==='reference'?[filmStyleContext(p)]:[]),
    s.id,s.zh,s.en,s.title,s.purpose,s.visual,s.continuity,s.claimIds,s.seconds,s.subtitleTracks,s.annotations,...(s.semanticScene?[s.semanticScene]:[]),...(p.contentBrief?[p.contentBrief]:[]),...(p.filmStyle?[p.filmStyle]:[]),...(s.voiceAlignment?[s.voiceAlignment,s.semanticSync,s.handoff]:[]),
    ...(s.phraseEdits?.length?[s.phraseEdits]:[]),...(handoffInputs(p,s)?[handoffInputs(p,s)]:[]),
    p.claims.filter(c=>s.claimIds.includes(c.id)).map(c=>[c.id,c.text,c.url,c.locator,c.verified]),
    p.assets.filter(a=>shotVisualAssetIds(s).includes(a.id)||a.id===f.bgmId).map(a=>[a.id,a.src,a.role,a.duration,a.segments,a.scriptText,a.confirmed,a.source,a.license,...(a.poster?[a.poster]:[])]),
    ...(explanationBeats(p,s.id).length?[explanationBeats(p,s.id)]:[]),
    ...(s.motionPlan?.performance||performanceRequirements(p,s.id).length?[
      performanceRequirements(p,s.id),actorCatalogInput(p,s.motionPlan),s.imageBindings||[],s.motionPlan?.skillFingerprint||'']:[])]);
}
export function motionIssues(plan,p,frames,s) {
  try {
    validateMotion(plan);
    if(s?.semanticScene)validateSemanticBinding(plan,s.semanticScene,{...semanticOptions(p,s,timeline(p).rows.find(r=>r.shot.id===s.id)),duration:plan.duration});
    const beats=s?explanationBeats(p,s.id):[];
    if(beats.length){
      validatePresentation(plan,{required:true});
      validateExplanationEvidence(plan,beats);
    }
    if(s?.imageBindings?.length){const issues=bindingIssues(p,s,plan);if(issues.length)return issues;}
    if(s) {
      const bound=shotImagePlan(plan,s.imageBindings);
      validateRig(bound);
      mergeActorCatalog(p.actorCatalog,plan);
      validatePerformance(bound,performanceRequirements(p,s.id),{fps:p.fps,speech:actionTiming(p,s.id).speech,beats});
    }
    if(plan.nodes.some(n=>n.media&&!motionImageAsset(p,n.media.assetId)))return ['风格素材：所引用的图片或视频缺失，或来源、使用条件、视频海报尚未确认，请补齐后重新制作'];
    for(const n of plan.nodes)if(n.media?.imageText){if(n.media.fit!=='contain')throw Error('文字分层需完整保留原图比例');validateImageTextLayers(n.media.imageText,n.media.assetId,p.assets,plan.duration);}
    if(plan.actors?.some(a=>a.contentType?.startsWith('person-')&&a.parts.some(part=>p.assets.find(asset=>asset.id===plan.nodes.find(n=>n.id===part.nodeId)?.media?.assetId)?.kind==='video')))return ['人物只能使用静态图片或简单符号，不能绑定人物视频'];
    if(plan.width!==p.width||plan.height!==p.height||plan.duration+1/p.fps<frames/p.fps)
      return ['画幅或时长已变化，请重新生成这一镜动画'];
    if(s&&plan.inputs&&!sameMotionInputs(plan.inputs,motionInputs(p,s)))return ['内容已修改，请重新生成这一镜动画'];
    return [];
  } catch(e) {return [e.message];}
}

// Caption language is an overlay choice; it cannot require a new animation.
export function sameMotionInputs(before,after) {
  if(before===after)return true;
  try {const a=JSON.parse(before),b=JSON.parse(after);a[6]=null;b[6]=null;a[11]||='';b[11]||='';a[13]||='';b[13]||='';return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}
}

export function motionAt(frames,time) {
  return sampleMotion(frames,time);
}

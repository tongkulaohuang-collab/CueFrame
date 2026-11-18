import {lemoStyle} from './lemo.mjs';
import {referenceStyleStatus} from './visual-style.mjs';
import {referenceDocuments} from './references.mjs';
import {referenceScriptNeeds,referenceAnalysisNeeds,currentReferenceReports,motionReferences} from './reference-motion.mjs';
import {validateSemanticScene} from './semantic-scenes.mjs';
import {explanationScriptNeeds} from './explanation-plan.mjs';

export const scienceSteps = [
  [0, '选题与资料'], [4, '口播与音乐'], [5, '风格与参考'], [1, '节奏脚本'],
  [6, '效果图预览'], [2, '有声样片'], [3, '视频预览'],
];

// Stage readiness is computed from actual inputs; it is not a human review receipt.
export function scienceInputs(p) {
  const f = p.scienceFlow || {};
  return JSON.stringify([p.topic, p.script, p.references, p.width, p.height, p.fps, p.target,p.contentBrief,
    p.voice, p.language, p.look, f.style, f.template, f.lemoStyleId || '', f.rhythm, f.bgmId, f.analysis,
    p.researchSources?.filter(source=>source.kind!=='图片'),...(motionReferences(p).length?[[motionReferences(p),currentReferenceReports(p)]]:[]),referenceDocuments(p).map(d=>[d.url,d.finalUrl,d.status,d.title,d.text,d.truncated]),p.claims.map(c => [c.id, c.revision, c.verified]),
    p.assets.filter(a => a.kind !== 'video' && !(a.kind==='image' && (a.generation?.planId || a.imageSource))).map(a => [a.id, a.role, a.source, a.confirmed,a.src,a.duration,a.segments]),
    p.shots.map(s => [s.id, s.title, s.zh, s.en, s.purpose, s.visual, s.seconds, s.beats,
      s.continuity, s.manualTiming, s.subtitleTracks, s.annotations, s.transition,s.semanticScene,
      s.assetIds.filter(id => p.assets.some(a => a.id === id && a.kind !== 'video')), s.claimIds])]);
}
export const sampleInputs=p=>JSON.stringify([p.burnCaptions,p.captionMode,p.overflow,
  p.shots.map(s=>[s.id,s.processVideoId,s.processOffset,s.assetIds,s.layout,s.reviewed,...(s.imageBindings?.length?[s.imageBindings]:[])]),
  p.assets.filter(a=>a.kind==='video').map(a=>[a.id,a.confirmed,a.source,a.license])]);
export function retainScienceFlow(previous, p) {
  if (p.kind !== 'science' || !p.scienceFlow && !previous?.scienceFlow) return;
  const old = previous?.scienceFlow || {};
  const f = p.scienceFlow || {};
  p.scienceFlow = Object.fromEntries(['style','template','rhythm','bgmId','feedback','referenceVideoUrls'].map(k => [k, f[k] || '']));
  const next = p.scienceFlow;
  next.artifactHistory=old.artifactHistory||[];
  if(old.referenceMotion)next.referenceMotion=old.referenceMotion;
  if(old.referenceReviews)next.referenceReviews=old.referenceReviews;
  if(old.referenceScript)next.referenceScript=old.referenceScript;
  // Analyses originate from validated jobs, not from editable/imported form data.
  if(old.materialPlan)next.materialPlan=old.materialPlan;
  if(old.imagePlans)next.imagePlans=Object.fromEntries(Object.entries(old.imagePlans).filter(([id])=>p.shots.some(s=>s.id===id)));
  if (f.lemoStyleId) {
    if (!lemoStyle(f.lemoStyleId)) throw Error('找不到选定的 Lemo 风格');
    next.lemoStyleId = f.lemoStyleId;
  }
  next.analysis = old.analysis?.clipId === next.bgmId ? old.analysis : null;
  if(previous&&scienceInputs(previous)!==scienceInputs(p)&&old.proofs?.length)
    next.artifactHistory=[...next.artifactHistory,{version:previous.version,proofs:old.proofs,sampleJob:old.sampleJob,
      reason:'上游内容、声音或参考改变',created:previous.updated}].slice(-30);
  if (previous && scienceInputs(previous) === scienceInputs(p)) {
    next.scriptVersion = old.scriptVersion;
    next.proofs = old.proofs;
    next.proofsForFeedback = old.proofsForFeedback ?? (old.proofVersion ? old.feedback||'' : undefined);
    if ((old.feedback||'') === next.feedback) {
      next.proofVersion = old.proofVersion;
      if(sampleInputs(previous)===sampleInputs(p)) next.sampleJob = old.sampleJob;
    }
  }
  advanceScience(p);
}
export function advanceScience(p) {
  if (p.kind !== 'science' || !p.scienceFlow) return;
  const f=p.scienceFlow;
  if (!scriptNeeds(p).length) {
    f.scriptVersion ||= (p.version || 0)+1;
    f.stageMode='automatic';
    if (f.proofs?.length===3 && f.proofsForFeedback===(f.feedback||''))
      f.proofVersion ||= (p.version || 0)+1;
  }
}
export const scriptReady = p => !scriptNeeds(p).length;
export const proofsReady = p => scriptReady(p) && p.scienceFlow?.proofs?.length===3 &&
  (!!p.scienceFlow.proofVersion || p.scienceFlow.proofsForFeedback===(p.scienceFlow.feedback||''));
export function scriptNeeds(p) {
  const f = p.scienceFlow || {};
  const needs = [];
  if (!p.topic.trim()) needs.push('定下选题');
  if (!p.claims.some(c => c.verified)) needs.push('核实科学依据');
  if (!p.shots.length || p.shots.some(s => !s[p.voice]?.trim() || !s.assetIds.some(id => p.assets.some(a => a.id === id && a.role === p.voice && a.kind === 'audio' && (!a.scriptText || a.scriptText === s[p.voice]))))) needs.push('为每段口播采用实际配音');
  if (!f.analysis || !p.assets.some(a=>a.id===f.bgmId && a.confirmed && a.source && a.license)) needs.push('分析选定的 BGM，并核对音频来源');
  if (!f.rhythm?.trim()) needs.push('完成带时间码的节奏脚本');
  needs.push(...explanationScriptNeeds(p));
  needs.push(...referenceScriptNeeds(p));
  return needs;
}
export function scienceGate(p, whole=false, {preserveVisuals=false}={}) {
  if (p.kind !== 'science') return [];
  if(p.productionMode==='model-process') {
    const needs=referenceAnalysisNeeds(p);
    const style=referenceStyleStatus(p);if(!style.ready)needs.push(style.message);
    if(!p.shots.length)needs.push('请先建立分段内容');
    for(const s of p.shots)try{validateSemanticScene(s.semanticScene,p.assets);}catch(e){needs.push((s.title||'本段')+'：'+e.message);}
    return needs;
  }
  // Local authored scenes follow source, continuity and film checks in model/film.
  // AI storyboard images and a soundtrack are optional for this production route.
  if (p.productionMode === 'local-process') return [];
  // Reusing footage or replacing its caption overlay does not generate a new
  // script or visual. renderIssues still checks the actual scene, inputs,
  // recordings and sources; the result receives no new quality approval.
  if(preserveVisuals&&!whole)return [];
  const referenceNeeds=referenceScriptNeeds(p);if(referenceNeeds.length)return referenceNeeds;
  const needs=scriptNeeds(p);
  if(needs.length)return needs;
  if (!proofsReady(p)) return ['请先生成当前脚本的三张效果图'];
  return [];
}

import {filmStyleContext,handoffInputs} from './film-style.mjs';
export const CONTENT_VERSION=1;
const briefFields=['audience','question','takeaway','prerequisites','boundaries'];
export function validateContentBrief(brief) {
  if(brief==null)return;
  if(typeof brief!=='object'||Array.isArray(brief)||Object.keys(brief).some(k=>!briefFields.includes(k))||
    Object.values(brief).some(v=>typeof v!=='string'||v.length>2000))throw Error('内容目标必须使用受众、问题、结论、前提和边界字段。');
}
const stableId=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};

// This is a projection of the existing source plans, not a second editable script.
export function contentGraph(p) {
  const beats=p.scienceFlow?.referenceScript?.explanationBeats||[],entities=new Map();
  for(const b of beats)for(const name of b.entities||[])if(!entities.has(name))entities.set(name,{id:'entity-'+stableId(name),name});
  return {version:CONTENT_VERSION,brief:p.contentBrief||{},filmStyle:filmStyleContext(p),entities:[...entities.values()],
    events:beats.map(b=>({id:b.id,shotId:b.shotId,from:b.from,until:b.until,intent:b.intent,before:b.before,after:b.after,
      entityIds:(b.entities||[]).map(name=>entities.get(name).id),cueIds:b.cueIds,dependsOn:b.dependsOn,
      claimIds:p.shots.find(s=>s.id===b.shotId)?.claimIds||[]})),
    models:p.shots.filter(s=>s.semanticScene).map(s=>({shotId:s.id,...s.semanticScene})),
    references:p.scienceFlow?.referenceScript?.decisions||[],
    policyVersion:4};
}

export function repairPlan(before,after) {
  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const globalVisual=!eq([before.width,before.height,before.contentBrief,before.filmStyle,filmStyleContext(before),before.scienceFlow?.style,before.scienceFlow?.template,before.scienceFlow?.lemoStyleId,before.scienceFlow?.referenceVideoUrls],
    [after.width,after.height,after.contentBrief,after.filmStyle,filmStyleContext(after),after.scienceFlow?.style,after.scienceFlow?.template,after.scienceFlow?.lemoStyleId,after.scienceFlow?.referenceVideoUrls]);
  return after.shots.map(s=>{
    const old=before.shots.find(v=>v.id===s.id);
    const textChanged=!old||!eq([old.zh,old.en],[s.zh,s.en]);
    const claims=(p,shot)=>(p.claims||[]).filter(c=>shot?.claimIds?.includes(c.id)).map(c=>[c.id,c.text,c.revision,c.verified]);
    const assets=(p,shot)=>(p.assets||[]).filter(a=>shot?.assetIds?.includes(a.id)||a.id===p.scienceFlow?.bgmId).map(a=>[a.id,a.src,a.duration,a.segments,a.scriptText]);
    const visualChanged=globalVisual||!old||!eq([old.visual,old.semanticScene,old.claimIds,old.motionPlan,old.phraseEdits,handoffInputs(before,old),claims(before,old)],[s.visual,s.semanticScene,s.claimIds,s.motionPlan,s.phraseEdits,handoffInputs(after,s),claims(after,s)]);
    const timingChanged=!old||!eq([old.seconds,old.subtitleTracks,old.manualTiming,old.voiceAlignment,old.semanticSync,old.handoff,old.assetIds,assets(before,old),before.scienceFlow?.analysis],[s.seconds,s.subtitleTracks,s.manualTiming,s.voiceAlignment,s.semanticSync,s.handoff,s.assetIds,assets(after,s),after.scienceFlow?.analysis]);
    const captionChanged=!eq([before.burnCaptions,before.captionMode,old?.annotations],[after.burnCaptions,after.captionMode,s.annotations]);
    const stages=textChanged?['配音待更新','脚本','动画','样片']:visualChanged||timingChanged?['脚本校验','动画','样片']:captionChanged?['字幕与标注合成','样片']:[];
    return {shotId:s.id,stages,preserveAudio:!textChanged,reason:textChanged?'口播文字改变':visualChanged?'内容或画面改变':timingChanged?'时序或素材改变':captionChanged?'字幕或标注改变':'输入未变'};
  });
}
export const contentInstructions='先明确 contentGraph.brief 的受众、核心问题、看完能理解的结论、必要前提和不作何种推断；缺失时按题材合理推导，不能捏造来源。复用 contentGraph 中稳定对象和事件 ID，以 explanationBeats 为唯一事件时间线。数据、标签、几何必须来自同一模型，不可手填互相矛盾的答案。参考技法按解释任务匹配，并说明不适用的参考。';

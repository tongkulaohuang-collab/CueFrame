import {safeIssueText} from './issue-help.mjs';
import {motionReferences,referenceAttempt,currentReferenceReports,referenceScriptNeeds} from './reference-motion.mjs';
import {proofJobStatus} from './codex-status.mjs';
import {explanationScriptNeeds} from './explanation-plan.mjs';
import {isAuthoredProcess} from './production-mode.mjs';

const stages={
  narration:[4,'口播起草'],phrasing:[4,'按音乐调整口播断句'],translation:[4,'英文口播与字幕'],
  materials:[5,'素材需求分析'],'shot-images':[5,'全片图像素材分析'],'material-image':[5,'图片素材生成'],'material-supplement':[5,'补充素材'],
  'reference-motion':[5,'参考视频分析'],rhythm:[1,'节奏脚本'],shots:[1,'分镜生成'],storyboard:[1,'分镜与连续镜头设计'],
  proofs:[6,'效果图生成'],motion:[2,'样片动画'],diagnosis:[2,'问题分析'],
};

export function scienceTaskLocation(j) {
  if(j.type==='voice')return [4,'段落配音'];
  if(j.type==='local-render')return [1,'本地画面制作'];
  if(j.type==='codex'){
    if(j.task==='research-recommendation')return [j.researchScope==='visuals'?5:0,'AI 素材推荐'];
    if(j.task==='research')return j.researchScope==='visuals'?[5,'联网找画面素材']:[0,'按选题找素材'];
    return stages[j.task||'shots'];
  }
  if(j.type==='segments')return [3,j.mode==='captions'?'分段字幕更新':'分段制作'];
  if(j.type==='joined')return [3,j.mode==='final'?'已审成片合成':'待审视频合成'];
  if(j.type==='render')return j.scope==='rough'?[3,'有声粗剪']:j.scope==='film'?[3,'整片导出']:[2,'样片渲染'];
}

export const isRhythmFallback=j=>j?.task==='rhythm'&&j.rhythmSource==='timeline'&&['ready','applied','failed'].includes(j.status);
export function taskProblem(j,p) {
  if(!j)return null;
  if(isRhythmFallback(j)) {
    const historical=j.status==='applied'||j.version!=null&&j.version<p?.version;
    if(p&&(isAuthoredProcess(p)||historical&&p.scienceFlow?.rhythm?.trim()&&!explanationScriptNeeds(p).length&&!referenceScriptNeeds(p).length))return null;
    const validation=j.rhythmFailure==='validation'||j.execution?.exitCode===0&&j.rhythmGenerationIssue;
    return {label:validation?'脚本校验未通过':'节奏脚本未完成',
      message:j.rhythmRecoverable?'完整返回稿与时间轴已保留。可先在本地检查并恢复原脚本；通过校验后继续制作。已有配音和视频保留。':'时间轴草稿已保留，尚不能作为完整脚本制作新画面。请查看任务详情后处理；已有配音和视频保留。',
      detail:j.rhythmGenerationIssue?safeIssueText(j.rhythmGenerationIssue):'旧任务未记录具体原因，请查看原任务。'};
  }
  if(j.status==='unknown')return {label:'结果待核对',message:safeIssueText(j.task==='proofs'?proofJobStatus(j,j.version).message:j.error||'请先查看原请求的结果，再决定是否重试。')};
  if(j.status==='interrupted')return {label:'已中断',message:safeIssueText(j.error||'本地制作已中断，原参数已保留。')};
  if(j.status==='failed')return {label:'失败',message:safeIssueText(j.referenceIssue?.reason||j.itemError||j.error||'任务已停止，未返回具体原因。')};
  if(j.status==='cancelled')return {label:'已停止',message:safeIssueText(j.error||'后续分段已停止。已完成的视频可以继续查看。')};
  if(j.itemError&&['ready','applied'].includes(j.status))return {label:'部分完成',message:safeIssueText(j.itemError)};
  return null;
}

// Results from a newer attempt supersede only the same operation, subject and language.
export function scienceStepIssues(p,tasks) {
  if(p?.kind!=='science')return [];
  const refs=motionReferences(p),plans=[p.scienceFlow?.materialPlan,...Object.values(p.scienceFlow?.imagePlans||{})].filter(Boolean);
  const seen=new Set(),issues=[];
  const history=tasks.filter(j=>j.project===p.id).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
  const refHistory=history.filter(j=>j.task==='reference-motion');
  const reports=currentReferenceReports(p);
  const refProblems=new Set(refs.map(ref=>referenceAttempt(ref,reports.find(r=>r.referenceId===ref.id),refHistory,p.version)).filter(a=>a.issue).map(a=>a.job.id));
  const parents=new Map(),byId=new Map(history.map(j=>[j.id,j]));
  const operationKey=(j,location,id)=>JSON.stringify([location[0],location[1],id,j.variant,j.materialId,j.referenceIssue?.inputKey||j.referenceProgress?.referenceId]);
  for(const b of history.filter(j=>j.type==='segments')){
    for(const i of b.items||[])for(const id of [i.motionId,i.renderId])if(id&&!parents.has(id))parents.set(id,b);
  }
  for(const j of history){
    const parent=parents.get(j.id)||byId.get(j.batchId);
    if(parent&&j.status!=='unknown'){
      // A reused successful child still supersedes older standalone failures.
      // Grouping it under a batch must not make those failures reappear.
      const ownLocation=scienceTaskLocation(j);
      if(ownLocation&&['done','applied'].includes(j.status))seen.add(operationKey(j,ownLocation,j.shotId));
      continue;
    }
    const location=parent?scienceTaskLocation(parent):scienceTaskLocation(j);
    if(!location)continue;
    const [step,title]=location;
    const shot=j.shotId?p.shots.findIndex(s=>s.id===j.shotId):-1;
    if(j.shotId&&shot<0)continue;
    if(j.planId&&j.task!=='research'&&!plans.some(plan=>plan.id===j.planId))continue;
    if(j.materialId&&!plans.some(plan=>plan.items.some(i=>i.id===j.materialId)))continue;
    const itemSaved=id=>(p.assets||[]).some(a=>a.generation?.itemId===id&&plans.some(plan=>plan.id===a.generation.planId));
    if(j.materialId&&j.status!=='unknown'&&itemSaved(j.materialId))continue;
    if(j.task==='reference-motion'&&(j.referenceIssue||j.referenceProgress||j.result?.length)&&!refProblems.has(j.id))continue;
    const items=j.type==='segments'?(j.items||[]).filter(i=>p.shots.some(s=>s.id===i.shotId)):null;
    const key=id=>operationKey(j,location,id);
    const remaining=items?.filter(i=>!seen.has(key(i.shotId)));
    if(items){
      items.forEach(i=>seen.add(key(i.shotId)));
      if(!remaining.length||remaining.every(i=>i.status==='done'))continue;
      if(remaining.some(i=>[i.motionId,i.renderId].some(id=>byId.get(id)?.status==='unknown')))continue;
      // A failed item repaired by a newer per-shot batch must not transfer its
      // old error to the never-started items left in this batch.
      if(j.status==='failed'&&items.some(i=>i.status==='failed')&&!remaining.some(i=>i.status==='failed'))continue;
    }else if(j.status!=='unknown'){
      if(seen.has(key(j.shotId)))continue;
      seen.add(key(j.shotId));
    }
    const problem=taskProblem(j,p);
    if(!problem)continue;
    if(j.task==='material-supplement'&&j.itemError&&j.currentItem&&itemSaved(j.currentItem))continue;
    const item=plans.flatMap(plan=>plan.items).find(i=>i.id===j.materialId||i.id===j.currentItem);
    const stopped=remaining?.find(i=>i.status==='failed')||remaining?.find(i=>i.status!=='done');
    const index=stopped?p.shots.findIndex(s=>s.id===stopped.shotId):shot;
    const subject=j.referenceIssue?.name||item?.title||(index>=0?'第 '+(index+1)+' 段':'');
    issues.push({step,title,subject,job:j,...problem});
  }
  return issues;
}

export function jobTime(value) {
  const millis=Date.parse(value);
  return Number.isFinite(millis)?new Date(millis).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
}

import fs from 'node:fs';
import path from 'node:path';
import {data,db,get,job,jobs,persistJob,conflict,write} from './store.mjs';
import {prepare,approve,applyJob,jobHelp,recoverSavedMotion} from './codex.mjs';
import {render} from './render.mjs';
import {uid,renderIssues,update} from '../shared/model.mjs';
import {RENDER_PIPELINE_VERSION} from '../shared/scene-props.mjs';
import {sampleCreationNeeds} from '../shared/sample-creation.mjs';
import {joinedVideoStatus} from './joined-video.mjs';
import {designReport,directorReviewIssues,needsMotionDesignUpdate,usesDirectorDesign} from '../shared/director-quality.mjs';
import {segmentFingerprint} from './segment-fingerprint.mjs';
import {isModelProcess} from '../shared/production-mode.mjs';
import {generationRuntime} from './generation-runtime.mjs';
import {assertActionContract} from '../shared/action-contract.mjs';
export {segmentFingerprint} from './segment-fingerprint.mjs';

export function reusableSegment(p,id,variant,history=jobs(p.id)) {
  if(renderIssues(p,id,variant,undefined,{preserveVisuals:true}).length)return null;
  const signature=segmentFingerprint(p,id,variant);
  return history.find(j=>{
    const shot=p.shots.find(s=>s.id===id);
    const legacyUnchanged=j.pipelineVersion==='bilingual-captions-2026-11-09'&&!shot?.motionLibrary&&!shot?.libraryTransition;
    const legacyGraphicsUnchanged=j.pipelineVersion==='kino-media-fullbleed-v4-2026-11-10'&&
      !shot?.motionLibrary&&!shot?.libraryTransition&&!shot?.motionPlan?.presentation&&!shot?.motionPlan?.performance&&!shot?.motionPlan?.subjectWindows&&
      !shot?.motionPlan?.nodes?.some(n=>n.graphics||n.libraryEffects?.length);
    if(j.pipelineVersion!==RENDER_PIPELINE_VERSION&&!legacyUnchanged&&!legacyGraphicsUnchanged)return false;
    if(j.type!=='render'||j.scope!=='shot'||j.shotId!==id||j.variant!==variant||j.status!=='done'||!j.output)return false;
    if(!['sample.mp4','subtitles.srt'].every(f=>fs.existsSync(path.join(data,'exports',j.id,f))))return false;
    try{return segmentFingerprint(get(p.id,j.version),id,variant)===signature;}catch{return false;}
  })||null;
}
export function segmentStatus(p,variant=p.voice) {
  const history=jobs(p.id),batch=history.find(j=>j.type==='segments'&&j.variant===variant)||null;
  const rows=p.shots.map((s,index)=>{
    const owner=p.kind==='science'?history.find(j=>j.type==='segments'&&j.variant===variant&&j.items?.some(i=>i.shotId===s.id)):batch;
    const video=reusableSegment(p,s.id,variant,history),item=owner?.items.find(i=>i.shotId===s.id);
    const child=history.find(j=>[item?.motionId,item?.renderId].includes(j.id)&&['failed','unknown'].includes(j.status)&&(!video||j.created>video.created));
    const failed=child||(p.kind==='science'&&item?.status==='failed'&&owner.status==='failed'&&(!video||owner.created>video.created)?owner:null);
    const design=usesDirectorDesign(p)?designReport(p,s.id):{issues:[]};
    const previousVideo=video?null:history.find(j=>j.type==='render'&&j.scope==='shot'&&j.shotId===s.id&&j.variant===variant&&j.status==='done'&&j.output&&fs.existsSync(path.join(data,'exports',j.id,'sample.mp4')));
    const quality={designIssues:s.motionPlan?design.issues:[],issues:directorReviewIssues(p,s.id,video?.review,video?.evidence?.frames/p.fps)};
    const active=owner?.status==='running'&&['designing','rendering'].includes(item?.status);
    const stopped=p.kind==='science'&&item?.status==='waiting'&&['cancelled','failed'].includes(owner?.status);
    const status=active?item.status:failed?(p.kind==='science'?failed.status:'failed'):stopped&&!video?'stopped':!video?(previousVideo?'stale':'waiting'):video.review?.decision==='changes'?'changes':quality.issues.length?'review':'approved';
    return {shotId:s.id,index:index+1,text:s[variant],seconds:s.seconds,video,previousVideo,quality,errorJob:failed?jobHelp(failed):null,status};
  });
  // A local comparison is review material, never a reusable or approved segment.
  const comparison=history.find(j=>j.type==='motion-comparison'&&j.status==='done'&&j.version===p.version&&j.variant===variant&&j.output&&
    ['film.mp4','sample.mp4','subtitles.srt'].every(f=>fs.existsSync(path.join(data,'exports',j.id,f))))||null;
  return {project:p.id,version:p.version,batch,rows,comparison,joined:joinedVideoStatus(p,rows,variant),final:joinedVideoStatus(p,rows,variant,true)};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settled(id,interval) {
  let j=job(id);
  while(['queued','running'].includes(j.status)){await pause(interval);j=job(id);}
  return j;
}
export function startSegments(p,options,base,deps={}) {
  if(options.resumeOf)return resumeSegments(p,options.resumeOf,base,deps);
  generationRuntime.assertCurrent('segments');
  if(p.kind!=='science')throw Error('请打开科普项目');
  const variant=options.variant||p.voice;
  if(!['zh','en'].includes(variant))throw Error('未知语言版本');
  const ids=options.shotIds||p.shots.map(s=>s.id);
  const mode=options.mode||(options.force?'visual':'missing');
  if(!['missing','visual','captions'].includes(mode))throw Error('未知修改范围');
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!p.shots.some(s=>s.id===id)))throw Error('没有可生成的段落');
  const needs=[...new Set(ids.flatMap(id=>sampleCreationNeeds(p,id,variant,{preserveVisuals:mode==='captions'})))];
  if(needs.length)throw Error(needs.join('；'));
  preflightActions(p,ids,mode);
  let batch;
  db.exec('BEGIN IMMEDIATE');
  try {
    const active=jobs(p.id).find(j=>j.type==='segments'&&j.status==='running');
    if(active){db.exec('COMMIT');return active;}
    if(get(p.id).version!==p.version)throw conflict('内容已更新，请刷新后再生成');
    if(jobs(p.id).some(j=>['running','queued','unknown'].includes(j.status)))throw conflict('已有任务正在生成或待核对，请先完成该任务');
    batch=persistJob({id:uid(),type:'segments',owner:process.pid,project:p.id,version:p.version,
      expectedVersion:p.version,variant,status:'running',created:new Date().toISOString(),
      mode,revisionOf:options.revisionOf||null,
      items:ids.map(shotId=>({shotId,status:'waiting',force:mode==='visual'}))});
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  // One explicit request authorizes this finite list. Navigation does not stop
  // it; an uncertain AI submission stops it, and never gets retried here.
  dispatch(batch,base,deps);
  return batch;
}
function dispatch(batch,base,deps) {
  Promise.resolve().then(()=>perform(batch,base,deps)).catch(e=>{
    const current=job(batch.id);
    const item=current.items.find(i=>['designing','rendering'].includes(i.status));
    if(item)item.status='failed';
    persistJob({...current,status:'failed',error:e.message,errorCode:e.code||null,failedStage:item?.phase||null,finished:new Date().toISOString()});
  });
}
function preflightActions(p,ids,mode) {
  if(mode==='captions')return;
  // Check the whole requested list before the first model call. A later shot
  // must not discover a known script contradiction after earlier shots cost quota.
  const issues=[];
  for(const id of ids)try {assertActionContract(p,id);}catch(e){
    if(e.code!=='ACTION_CONTRACT_CONFLICT')throw e;
    issues.push(...e.issues);
  }
  if(issues.length)throw Object.assign(Error('节奏动作契约冲突：'+issues.map(i=>i.message).join('；')),{code:'ACTION_CONTRACT_CONFLICT',issues});
}
export function resumeSegments(p,id,base,deps={}) {
  generationRuntime.assertCurrent('segments');
  let batch;
  db.exec('BEGIN IMMEDIATE');
  try {
    const source=job(id);
    if(source.type!=='segments'||source.project!==p.id||p.kind!=='science')throw Error('请选择当前项目的分段任务');
    if(source.resumedBy) {
      const previous=job(source.resumedBy);
      if(['running','done'].includes(previous.status)){db.exec('COMMIT');return previous;}
      throw conflict('该批次已有续制记录，请继续最近一次未完成的分段任务');
    }
    if(!['failed','cancelled'].includes(source.status))throw Error('只有已停止的分段任务可以继续');
    if(p.version!==(source.expectedVersion??source.version)||get(p.id).version!==p.version)
      throw conflict('内容在中断后发生修改，原结果已保留；请先核对最新草稿');
    if(jobs(p.id).some(j=>['running','queued','unknown'].includes(j.status)))throw conflict('已有任务正在生成或待核对，请先完成该任务');
    if(!['missing','visual','captions'].includes(source.mode)||!Array.isArray(source.items)||!source.items.length||
      new Set(source.items.map(i=>i.shotId)).size!==source.items.length||source.items.some(i=>!p.shots.some(s=>s.id===i.shotId)))throw Error('原分段列表无效');
    const needs=[...new Set(source.items.flatMap(i=>sampleCreationNeeds(p,i.shotId,source.variant,{preserveVisuals:source.mode==='captions'})))];
    if(needs.length)throw Error(needs.join('；'));
    preflightActions(p,source.items.filter(i=>i.status!=='done').map(i=>i.shotId),source.mode);
    batch=persistJob({id:uid(),type:'segments',owner:process.pid,project:p.id,version:p.version,expectedVersion:p.version,
      variant:source.variant,mode:source.mode,status:'running',created:new Date().toISOString(),resumeOf:source.id,
      items:source.items.map(item=>({...item,status:item.status==='done'&&reusableSegment(p,item.shotId,source.variant)?.id===item.renderId?'done':'waiting'}))});
    persistJob({...source,resumedBy:batch.id});
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  dispatch(batch,base,deps);
  return batch;
}
async function perform(batch,base,deps) {
  const interval=deps.interval??400;
  const saveBatch=()=>{batch.cancelRequested=job(batch.id).cancelRequested||batch.cancelRequested;persistJob(batch);};
  const current=()=>{
    const p=get(batch.project);
    if(p.version!==batch.expectedVersion)throw conflict('内容在生成期间发生修改，已保留完成的视频。请刷新后继续。');
    return p;
  };
  for(const item of batch.items) {
    if(job(batch.id).cancelRequested){persistJob({...batch,status:'cancelled',cancelRequested:true,finished:new Date().toISOString()});return;}
    if(item.status==='done')continue;
    generationRuntime.assertCurrent('segments');
    let p=current();
    if(p.kind==='science'&&batch.mode==='captions'){item.status='rendering';saveBatch();}
    const ready=reusableSegment(p,item.shotId,batch.variant);
    const priorMotion=item.motionId?job(item.motionId):null;
    const adopted=priorMotion?.status==='applied'&&priorMotion.project===p.id&&priorMotion.shotId===item.shotId&&
      priorMotion.appliedVersion<=p.version&&segmentFingerprint(get(p.id,priorMotion.appliedVersion),item.shotId,batch.variant)===segmentFingerprint(p,item.shotId,batch.variant);
    const needsDesign=!adopted&&(needsMotionDesignUpdate(p,item.shotId)||usesDirectorDesign(p)&&designReport(p,item.shotId).issues.length>0||item.force);
    if(ready&&!needsDesign&&batch.mode!=='captions'){Object.assign(item,{status:'done',renderId:ready.id});saveBatch();continue;}
    if(batch.mode==='captions') {
      const issues=renderIssues(p,item.shotId,batch.variant,undefined,{preserveVisuals:true});
      if(issues.length)throw Error('仅更新字幕未执行：现有画面需要先处理：'+issues.join('；'));
    } else if(!adopted&&(renderIssues(p,item.shotId,batch.variant).length||needsDesign)) {
      item.status='designing';item.phase='generation';saveBatch();
      // A validated, unconsumed response is reusable after a process restart.
      let existing=jobs(p.id).find(j=>j.task==='motion'&&j.shotId===item.shotId&&j.version===p.version&&j.status==='ready');
      if(!existing&&priorMotion?.status==='failed'&&priorMotion.project===p.id&&priorMotion.shotId===item.shotId&&priorMotion.version===p.version) {
        try {existing=recoverSavedMotion(priorMotion.id,p.version);}
        catch(error){if(error.code!=='MOTION_LOCAL_RECOVERY_INVALID')throw error;}
      }
      const motion=existing||prepare(p,item.shotId,'motion',{variant:batch.variant});
      persistJob({...motion,batchId:batch.id,renderAfter:false});
      item.motionId=motion.id;saveBatch();
      if(!existing)(deps.approve||approve)(motion.id);
      const result=await settled(motion.id,interval);
      if(result.status!=='ready')throw Error(result.error||'该段动画未生成完成');
      current();
      item.phase='apply';saveBatch();
      p=(deps.applyJob||applyJob)(motion.id,undefined,batch.id);
      batch.expectedVersion=p.version;saveBatch();
    }
    current();item.status='rendering';item.phase='render';saveBatch();
    const rendered=(deps.render||render)(p,item.shotId,batch.variant,base,'shot',{preserveVisuals:batch.mode==='captions'});
    item.renderId=rendered.id;saveBatch();
    const result=await settled(rendered.id,interval);
    if(result.status!=='done')throw Error(result.error||'该段视频未生成完成');
    item.status='done';saveBatch();
  }
  persistJob({...batch,status:'done',finished:new Date().toISOString()});
}

export function cancelSegments(id) {
  const batch=job(id);
  if(batch.type!=='segments'||batch.status!=='running')throw Error('只有正在制作的分段任务可停止后续段落');
  return persistJob({...batch,cancelRequested:true});
}

export function reviseSegment(p,source,scope,base,deps={}) {
  if(!['captions','visual'].includes(scope))throw Error('请选择字幕或画面修改范围');
  if(isModelProcess(p)&&scope==='visual')throw Error('请在内容组件中调整数据、关系或风格，保存后重新生成本段；内容模型不提交 AI 画面修改。');
  if(source.project!==p.id||source.scope!=='shot'||source.status!=='done'||!source.output)throw Error('请选择已完成的分段视频');
  if(source.revisionId) {
    const pending=job(source.revisionId);
    if(['running','done'].includes(pending.status))return {project:p,batch:pending};
  }
  if(segmentFingerprint(p,source.shotId,source.variant)!==segmentFingerprint(get(p.id,source.version),source.shotId,source.variant))
    throw conflict('视频对应内容已变化，请先更新当前分段后再执行这条意见');
  if(jobs(p.id).some(j=>['running','queued','unknown'].includes(j.status)))throw conflict('已有任务正在生成或待核对，请先完成该任务');
  let q=p;
  if(scope==='captions') {
    const next=update(p,{...p,shots:p.shots.map(s=>s.id===source.shotId?{...s,captionLayout:'short'}:s)});
    const issues=renderIssues(next,source.shotId,source.variant,undefined,{preserveVisuals:true});
    if(issues.length)throw Error('字幕更新不改动画，请先处理现有画面：'+issues.join('；'));
    q=write(next,p.version);
  }
  const batch=startSegments(q,{shotIds:[source.shotId],variant:source.variant,mode:scope,revisionOf:source.id},base,deps);
  persistJob({...source,revisionId:batch.id,revisionScope:scope});
  return {project:q,batch};
}

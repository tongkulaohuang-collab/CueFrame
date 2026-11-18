import {conflict,db,get,job,jobs,write} from './store.mjs';
import {referenceJobIssue,referenceReceipt,applyReferenceExclusions,previousExclusions} from './reference-motion.mjs';
import {currentReferenceReports,motionReferences,referenceAttempt,referenceMotionKey} from '../shared/reference-motion.mjs';
import {libraryItem} from '../shared/motion-library.mjs';

export function reviewMedia(projectId,jobId) {
 const j=job(jobId);
 if(j.project!==projectId||j.task!=='reference-motion')throw Error('找不到本项目的参考视频');
 const receipt=referenceReceipt(j);
 if(!receipt?.media)throw Error('无法读取与本次分析匹配的原片');
 return {file:receipt.media,mime:receipt.mime};
}

function usableSegment(row) {
 if(!row.reason)return {...row.segment,from:row.from,until:row.until};
 const s=row.segment||{};
 const content=field=>typeof s[field]==='string'&&s[field].trim()?s[field].slice(0,1600):'原分析未记录';
 return {from:row.from,until:row.until,confidence:'manual',
  motion:content('motion'),rhythm:content('rhythm'),camera:content('camera'),
  transition:content('transition'),typography:content('typography'),
  customMotion:typeof s.customMotion==='string'?s.customMotion.slice(0,1600):'',
  effectIds:Array.isArray(s.effectIds)?s.effectIds.filter(id=>libraryItem(id)?.type==='effect'):[]};
}

function reviewedReport(receipt,review) {
 const {ref,evidence,raw,rows}=receipt;
 const segments=rows.filter(row=>review.decisions[row.id]!=='excluded').map(usableSegment);
 const text=(s,fallback)=>typeof s==='string'&&s.trim()?s.slice(0,1600):fallback;
 return applyReferenceExclusions({referenceId:ref.id,inputKey:referenceMotionKey(ref),name:ref.name,duration:evidence.duration,mediaHash:evidence.mediaHash,
  method:[evidence.method,'待审时段由用户逐项选择'].filter(Boolean).join('。'),sampleFps:evidence.sampleFps,
  summary:text(raw?.summary,'参考片经用户复核。'),limitations:text(raw?.limitations,'缺少自动观察依据的细节仍按原报告标示。'),
  segments,excluded:[],reviewJobId:review.jobId,reviewKey:review.key,analyzedAt:review.updated},review.excluded);
}

// A later analysis may subdivide the same footage differently. Carry a cut by
// original time until the user explicitly approves that time on the same media.
function updateExclusions(previous,{from,until},decision) {
 const cuts=[];
 for(const range of previous){
  if(range.until<=from||range.from>=until){cuts.push(range);continue;}
  if(range.from<from)cuts.push({from:range.from,until:from});
  if(range.until>until)cuts.push({from:until,until:range.until});
 }
 if(decision==='excluded')cuts.push({from,until});
 return cuts.sort((a,b)=>a.from-b.from);
}

export function decideReferenceSegment(projectId,body) {
 const {jobId,key,segmentId,decision,version}=body;
 if(!['approved','excluded'].includes(decision)||typeof segmentId!=='string')throw Error('请选择通过或去掉这一段');
 db.exec('BEGIN IMMEDIATE');
 try {
  const p=get(projectId),j=job(jobId);
  if(p?.kind!=='science'||j.project!==projectId||j.status!=='failed'||j.task!=='reference-motion')throw Error('找不到本项目的待审分析');
  const receipt=referenceReceipt(j),issue=receipt?.issue;
  if(!receipt?.media||!issue?.review||key!==issue.review.key)throw conflict('原片或分析记录已变化，请刷新待审列表');
  const ref=motionReferences(p).find(r=>r.id===issue.referenceId&&referenceMotionKey(r)===issue.inputKey);
  const row=issue.review.segments.find(s=>s.id===segmentId);
  if(!ref||!row)throw conflict('这一段已不在当前参考范围内');
  const history=jobs(projectId).filter(old=>old.task==='reference-motion')
   .sort((a,b)=>String(b.created).localeCompare(String(a.created))).map(old=>({...old,referenceIssue:referenceJobIssue(old)}));
  const report=currentReferenceReports(p).find(r=>r.referenceId===ref.id);
  if(referenceAttempt(ref,report,history,p.version).job?.id!==jobId)throw conflict('已有更新的参考分析，请刷新后审核');
  const f=p.scienceFlow,previous=(f.referenceReviews||[]).find(r=>r.jobId===jobId&&r.key===key);
  if(previous?.decisions[segmentId]===decision){db.exec('COMMIT');return p;}
  if(p.version!==version)throw conflict('草稿或审核决定已更新，请刷新后再操作');
  const mediaHash=receipt.evidence.mediaHash;
  const excluded=updateExclusions(previousExclusions(p,{inputKey:issue.inputKey,mediaHash}),row,decision);
  const review={jobId,key,inputKey:issue.inputKey,mediaHash,excluded,referenceId:ref.id,updated:new Date().toISOString(),decisions:{...previous?.decisions,[segmentId]:decision}};
  const complete=issue.review.segments.every(s=>review.decisions[s.id]);
  const next={...p,scienceFlow:{...f,referenceReviews:[...(f.referenceReviews||[]).filter(r=>r.referenceId!==ref.id),review]}};
  // Previously validated references in the same interrupted batch are still usable.
  const reports=new Map((f.referenceMotion||[]).map(r=>[r.referenceId,r]));
  for(const r of j.referenceReports||[]){
   if(!reports.has(r.referenceId)&&motionReferences(p).some(ref=>ref.id===r.referenceId&&referenceMotionKey(ref)===r.inputKey))
    reports.set(r.referenceId,applyReferenceExclusions(r,previousExclusions(p,r)));
  }
  if(complete)reports.set(ref.id,reviewedReport(receipt,review));
  else reports.delete(ref.id);
  Object.assign(next.scienceFlow,{referenceMotion:[...reports.values()],referenceScript:null,scriptVersion:null,proofVersion:null,proofs:null,sampleJob:null});
  const updated=write(next,version);
  db.exec('COMMIT');
  return updated;
 }catch(error){db.exec('ROLLBACK');throw error;}
}

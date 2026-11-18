import React from 'react';
import {motionReferences,currentReferenceReports,referenceAnalysisNeeds,referenceAttempt} from '../shared/reference-motion.mjs';
import {effects,templates,libraryItem} from '../shared/motion-library.mjs';
import {jobTime} from '../shared/science-task-status.mjs';
import {safeIssueText} from '../shared/issue-help.mjs';
import {ReferenceSegmentReview} from './ReferenceSegmentReview';
const time=n=>Number(n).toFixed(2)+' 秒';
export function ReferenceMotion({p,tasks,busy,ai,decide,jobsAvailable=true}){
 const refs=motionReferences(p),reports=currentReferenceReports(p),missing=referenceAnalysisNeeds(p);
 const history=tasks.filter(j=>j.project===p.id&&j.task==='reference-motion').sort((a,b)=>String(b.created).localeCompare(String(a.created)));
 const task=history[0],running=task?.status==='running',unknown=task?.status==='unknown',ready=task?.status==='ready'&&task.version===p?.version,progress=task?.referenceProgress;
 const groups=[];
 let visibleIssues=false;
 for(const ref of refs){
  const attempt=referenceAttempt(ref,reports.find(r=>r.referenceId===ref.id),history,p.version);
  visibleIssues||=!!attempt.issue?.reason;
  const j=attempt.job,issue=attempt.issue||(attempt.reviewed?j.referenceIssue:null);
  if(issue?.review?.segments?.length){
   const saved=p.scienceFlow?.referenceReviews?.find(r=>r.jobId===j.id&&r.key===issue.review.key);
   groups.push({j,issue,decisions:saved?.decisions||{}});
  }
 }
 return <section id="reference-analysis" className="panel" aria-label="参考视频分析"><small>REFERENCE ANALYSIS</small><h2>先分析参考视频，再写脚本</h2>
  <ReferenceSegmentReview groups={groups} busy={busy||!jobsAvailable||running} decide={decide}/>
  <p role="status">{reports.length} / {refs.length} 个参考视频已分析{running&&progress&&` · 本次 ${progress.completed} / ${progress.total} · ${progress.current} · ${progress.phase}`}</p>
  <p>逐一分析参考片的动效、视觉节奏与镜头衔接，完成后用于本期脚本。选中的风格样片、下方视频链接和标为参考的已上传视频都会加入。</p>
  <p className="muted">写脚本前会读取现有 {effects.length} 种动效、{templates.length} 个模板及保存的个人预设；由 AI 选择参数，缺少的效果可另行设计。</p>
  {!refs.length&&<p>选择一个风格样片，或上传参考视频、填写视频直链。</p>}
  {refs.map(ref=>{const report=reports.find(r=>r.referenceId===ref.id),attempt=referenceAttempt(ref,report,history,p.version),issue=attempt.issue;
   return <div key={ref.id} className={issue?'reference-problem':undefined}>
    {issue&&<div role="alert"><strong>{ref.name} · {attempt.label}</strong>
      <p>{safeIssueText(issue.reason||attempt.job.error)}</p>
      <p>{issue.segmentCount>0?`已保留本次返回的 ${issue.segmentCount} 段分析，尚未采用。`:''}{report?'已有通过校验的报告仍可查看。':''}
        {attempt.job.status==='unknown'?'请先在任务记录核对原请求。':issue.segmentCount?'请按提示核对原片的对应时段。':''}</p>
      <small>提交于 {jobTime(attempt.job.approvedAt||attempt.job.created)}</small></div>}
    <details className="reference-analysis"><summary>{ref.name} · {!jobsAvailable&&attempt.label==='待分析'?'任务状态待确认':attempt.label}{report&&' · '+time(report.duration)}</summary>
    {issue?.summary&&<><h3>本次返回的摘要（未采用）</h3><p>{issue.summary}</p></>}
   {report?<>{report.reusedFromJob&&<p className="muted">已核对原视频的文件摘要，复用通过当前校验的分析。</p>}<p>{report.summary}</p><p className="muted">{report.method}。{report.limitations}</p>{report.segments.map((s,i)=><article key={i}><h3>{time(s.from)} — {time(s.until)}</h3>{s.confidence==='manual'&&<small>用户已通过此时段</small>}<p><b>对象动效：</b>{s.motion}</p><p><b>文字动效：</b>{s.typography}</p><p><b>节奏：</b>{s.rhythm}</p><p><b>镜头：</b>{s.camera}{s.cameraReferenceIds?.length>0&&' · '+s.cameraReferenceIds.map(id=>libraryItem(id)?.name||id).join('、')}</p><p><b>衔接：</b>{s.transition}</p>{s.effectIds.length>0&&<p><b>可复用效果：</b>{s.effectIds.map(id=>libraryItem(id)?.name||id).join('、')}</p>}{s.customMotion&&<p><b>新动效设计：</b>{s.customMotion}</p>}{s.confidence==='inferred'&&<p className="muted">运动细节根据连续画面推断，制作时需复看。</p>}</article>)}</>:<p>本片尚无可用于写脚本的完整分析。</p>}</details></div>;})}
  <button type="button" disabled={busy||!jobsAvailable||running||unknown||ready||!refs.length||refs.length>8} onClick={()=>ai('reference-motion',{force:!missing.length})}>{running?'正在分析参考视频…':unknown?'分析结果待核对':ready?'分析已返回，等待采用':missing.length?(visibleIssues?'重试未通过的参考视频分析':'逐一分析参考视频'):'重新分析全部参考视频'}</button>
  {!visibleIssues&&task&&['failed','unknown'].includes(task.status)&&!task.referenceIssue&&<p role="alert">{safeIssueText(task.error||'上次分析状态待核对，请查看任务记录。')}</p>}
  <p className="muted">支持 0.25 秒至 30 分钟的 MP4/WebM 直链或上传文件。工作台每秒采样 4 帧分析画面，超过 3 分钟的参考片分段调用当前 Codex 账户。音乐与音效需另行听辨。</p>
 </section>;
}

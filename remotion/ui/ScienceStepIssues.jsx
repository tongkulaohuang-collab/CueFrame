import React from 'react';
import {jobTime,taskProblem,scienceTaskLocation,isRhythmFallback} from '../shared/science-task-status.mjs';

export function ScienceTaskReceipt({job,version,p}){
  if(!job)return null;
  const problem=taskProblem(job,p);
  if(isRhythmFallback(job)&&!problem)return null;
  const labels={awaiting:'等待确认',queued:'已排队',running:'执行中',ready:job.version===version?'结果已返回，待写入':'结果已返回，属于旧版草稿',applied:'已采用',reconciled:'已记录核对结果',cancelled:'已停止'};
  const label=problem?.label||labels[job.status];
  if(!label)return null;
  return <p className={problem?'task-receipt has-problem':'muted task-receipt'} role={problem?'alert':'status'}>
    <b>{scienceTaskLocation(job)?.[1]} · {label}</b>{problem&&'　'+problem.message}
    {problem?.detail&&'　具体原因：'+problem.detail}
    {job.recoveryOf&&'　已恢复原返回稿并通过完整校验。'}
    <small>{jobTime(job.approvedAt||job.created)} 提交</small>
  </p>;
}

export function ScienceStepIssues({issues,version,onOpen,onRecoverRhythm,onRepairRhythm,busy}){
  if(!issues.length)return null;
  return <section className="science-step-issues" aria-label="本步骤的任务问题">
    <h2>需要处理的任务</h2>
    {issues.map(({job,title,subject,label,message,detail})=><article key={job.id} role="alert">
      <strong>{title} · {label}{subject&&' · '+subject}</strong>
      <p>{message}</p>
      {detail&&<p>具体原因：{detail}</p>}
      <small>{jobTime(job.approvedAt||job.created)&&jobTime(job.approvedAt||job.created)+' 提交'}{job.version!=null&&job.version!==version&&' · 当时的草稿 v'+job.version}
        {job.variant&&' · '+(job.variant==='en'?'英语':'中文')}</small>
      <div className="inline">
        {isRhythmFallback(job)&&job.rhythmRecoverable&&onRecoverRhythm&&<button type="button" disabled={busy} onClick={()=>onRecoverRhythm(job)}>检查并恢复原脚本</button>}
        {isRhythmFallback(job)&&job.repairable&&onRepairRhythm&&<button type="button" disabled={busy} onClick={()=>onRepairRhythm(job)}>让 AI 定向修复</button>}
        <button type="button" onClick={()=>onOpen(job)}>{job.task==='reference-motion'?'查看样片分析':job.task==='research'?'查看素材搜索':job.type==='voice'?'查看本段配音':job.type==='local-render'?'查看本镜制作':'查看原任务'}</button>
      </div>
      {isRhythmFallback(job)&&job.rhythmRecoverable&&<p className="muted">检查原稿不调用生成服务；AI 定向修复会使用当前 Codex 账户额度。</p>}
    </article>)}
  </section>;
}

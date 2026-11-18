import React,{useEffect,useState} from 'react';
import {proofJobStatus,codexTimeout} from '../shared/codex-status.mjs';
import {IssueNotice} from './IssueNotice';
export function ProofTaskStatus({job,version,retained}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    if(job?.status!=='running')return;
    setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[job?.id,job?.status]);
  const info=proofJobStatus(job,version,retained);
  if(!info.message)return null;
  if(['unknown','failed','reconciled'].includes(job.status))return <IssueNotice area="效果图生成" job={job} error={info.message}/>;
  const seconds=Math.max(0,Math.floor((now-Date.parse(job.approvedAt||job.created))/1000));
  return <div className="proof-task-status" role={['unknown','failed'].includes(job.status)?'alert':'status'}>
    <b>{info.label}</b><p>{info.message}</p>
    {job.status==='running'&&<p className="muted">已等待 {Math.floor(seconds/60)} 分 {seconds%60} 秒 · 本次等待上限 {Math.round((job.execution?.limitMs||codexTimeout(job.task))/60000)} 分钟</p>}
    {job.status==='unknown'&&<p className="muted">继续等待不会自动重启。请在下方「任务与版本」核对原请求后再重新生成。</p>}
    <small>请求 {job.id.slice(0,8)} · 提交于 {new Date(job.approvedAt||job.created).toLocaleTimeString('zh-CN',{hour12:false})}</small>
  </div>;
}

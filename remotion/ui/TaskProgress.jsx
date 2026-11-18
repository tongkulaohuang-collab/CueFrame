import React,{useEffect,useState} from 'react';
import {taskTitles} from '../shared/automatic-workflow.mjs';
import {exportStatus} from './export-status.mjs';
export function TaskProgress({tasks,p,busy,request,run,updateJob,openTasks}) {
  const [now,setNow]=useState(Date.now());
  const batches=tasks.filter(j=>j.type==='segments'&&j.status==='running');
  const active=tasks.filter(j=>(p.kind==='science'?['running','queued']:['running','queued','unknown']).includes(j.status)&&!j.batchId&&!batches.some(b=>b.items?.some(i=>i.renderId===j.id||i.motionId===j.id)));
  useEffect(()=>{if(!active.length)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active.length]);
  if(!active.length)return null;
  return <aside className="task-progress" aria-label="当前后台任务">
    {active.map(j=>{
      const item=j.items?.find(i=>['designing','rendering'].includes(i.status));
      const index=p.shots.findIndex(s=>s.id===(item?.shotId||j.shotId));
      const elapsed=Math.max(0,Math.floor(((j.status==='unknown'?Date.parse(j.execution?.finishedAt||j.finished)||now:now)-Date.parse(j.approvedAt||j.created))/1000));
      const done=j.items?.filter(i=>i.status==='done').length;
      return <div key={j.id}><div role="status"><strong>{j.type==='segments'?(j.mode==='captions'?'字幕更新':'分段制作'):j.type==='joined'?'完整视频合成':taskTitles[j.task]||'视频渲染'}</strong>
        <span>{j.type==='render'&&['rough','film'].includes(j.scope)?exportStatus(j):j.status==='unknown'?'结果待核对':j.status==='queued'?'已排队':j.cancelRequested?'本段完成后停止':j.step||({designing:'制作动画',rendering:'本地渲染'})[item?.status]||'执行中'}{index>=0?' · 第 '+(index+1)+' 段':''}{j.items?' · '+done+'/'+j.items.length:''} · {Math.floor(elapsed/60)} 分 {elapsed%60} 秒</span></div>
        {j.type==='segments'&&j.status==='running'&&<button disabled={busy||j.cancelRequested} onClick={()=>run(async()=>updateJob(await request('/api/jobs/'+j.id+'/cancel',{})))}>{j.cancelRequested?'已请求停止':'完成本段后停止'}</button>}
        <button onClick={()=>openTasks(j)}>{j.task==='research-recommendation'?'查看素材推荐':j.task==='research'?'查看素材搜索':'查看任务记录'}</button></div>;
    })}
    <small>切换页面后继续执行；完成的视频与原始结果会保留。</small>
  </aside>;
}
export function TaskResult({job}) {
  const result=job.result;
  if(!result)return null;
  let readable;
  if(['narration','phrasing','rhythm'].includes(job.task))readable=<p className="result-prose">{result[0]}</p>;
  else if(job.task==='shot-images')readable=<p>已分析 {result.length} / {job.shotCount} 镜，共 {result.reduce((count,plan)=>count+plan.items.length,0)} 项图像建议。</p>;
  else if(job.task==='motion') {
    const scene=result[0],plan=scene?.motionPlan;
    readable=<><p>{scene?.visual||scene?.purpose}</p><p>{plan?.nodes?.length||0} 个画面对象 · {plan?.cameraShots?.length||0} 个视觉镜头 · {plan?.actionEvidence?.length||0} 项动作 · {plan?.duration?.toFixed(2)} 秒</p></>;
  } else if(job.task==='translation')readable=<p>已处理 {result.length} 段译文，可在口播与音乐中查看对应中英文。</p>;
  else if(job.task==='material-supplement')readable=<>
    {result.map(asset=><p key={asset.id}><a href={asset.src} download={asset.name}>{asset.name}</a></p>)}
    {job.itemError&&<p>补充中断：{job.itemError}</p>}
  </>;
  else if(job.task==='proofs')readable=<p>已生成 {result.length} 张效果图，可在效果图预览中查看。</p>;
  else readable=<p>已返回 {Array.isArray(result)?result.length:1} 项结果{job.status==='applied'?'，已用于项目':'，尚未写入当前版本'}。</p>;
  return <div className="task-result">{readable}{job.validationAttempts?.length>0&&<p className="muted">经历 {job.validationAttempts.length} 次校验修复；技术详情保留每次原因。</p>}<details><summary>技术数据与校验记录</summary><pre>{JSON.stringify({result,validationAttempts:job.validationAttempts},null,2)}</pre></details></div>;
}

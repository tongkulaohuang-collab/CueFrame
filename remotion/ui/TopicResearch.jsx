import {IssueNotice} from './IssueNotice';
import React,{useEffect,useRef,useState} from 'react';
import {Search,ExternalLink,Sparkles} from 'lucide-react';
import {visualSearchMatches} from '../shared/material-plan.mjs';

export function ResearchSource({m,choice,recommendation}) {
  return <article className="detail research-source">
    {choice&&<label className="research-choice">{choice}<span>采用这条资料</span></label>}
    <div><div className="research-source-meta"><small>{m.kind} · {m.publisher}</small>{recommendation&&<span className="research-recommended-badge"><Sparkles size={13} aria-hidden="true"/>AI 推荐</span>}</div><h3>{m.title}</h3>
      {recommendation&&<p className="research-recommendation-reason"><b>推荐理由　</b>{recommendation}</p>}
      <p>{m.summary}</p><p><b>建议用途　</b>{m.use}</p>
      <a href={m.url} target="_blank" rel="noreferrer">查看原始出处 <ExternalLink size={13}/></a>　{m.locator}
      {m.mediaUrl&&m.mediaUrl!==m.url&&/^https?:\/\//i.test(m.mediaUrl)&&<p><a href={m.mediaUrl} target="_blank" rel="noreferrer">{m.kind==='图片'?'打开原图':m.kind==='视频'?'打开原视频':'打开原始文件'} <ExternalLink size={13}/></a></p>}
      {m.original&&<p><a href={m.original} target="_blank" rel="noreferrer">查看原始研究</a></p>}
      <p className="muted">署名与使用条件　{m.rights}</p></div>
  </article>;
}
export const searchPending=(j,version,dirty)=>j&&(['running','unknown'].includes(j.status)||j.status==='awaiting'&&j.version===version&&!dirty);
export function SearchJob({j,p,tasks=[],dirty,busy,run,request,load,refreshJobs}) {
  const [picks,setPicks]=useState([]);
  const appliedRecommendation=useRef(null);
  const visual=j.researchScope==='visuals';
  const stale=dirty||(j.version!==p.version&&!visualSearchMatches(p,j));
  const staleMessage=dirty?'先保存当前修改，再核对这批素材是否仍适用。':visual?
    '选题、口播、视觉参考或指定素材需求已改变，请按当前内容重新搜索。':
    '这批结果属于旧版草稿，请按当前选题重新搜索。';
  const recommendationJob=tasks.find(t=>t.task==='research-recommendation'&&t.researchJobId===j.id&&
    (t.version===p.version||['running','unknown'].includes(t.status)));
  const recommending=recommendationJob?.status==='running';
  const recommendation=!stale&&recommendationJob?.version===p.version&&recommendationJob.status==='ready'?recommendationJob.result?.[0]:null;
  const mergeRecommended=()=>setPicks(previous=>[...new Set([...previous,...recommendation.picks.map(item=>item.index)])]);
  useEffect(()=>{
    if(!recommendation||j.status!=='ready'||appliedRecommendation.current===recommendationJob.id)return;
    appliedRecommendation.current=recommendationJob.id;
    setPicks(previous=>[...new Set([...previous,...recommendation.picks.map(item=>item.index)])]);
  },[recommendation,recommendationJob?.id,j.status]);
  const adoptLabel=visual?'保存选中出处':'采用选中素材';
  const recommend=()=>recommendation?mergeRecommended():run(async()=>{
    await request('/api/projects/'+p.id+'/codex',{
      version:p.version,task:'research-recommendation',researchJobId:j.id,submit:true,
    });
    await refreshJobs();
  });
  const act=(action,body,apply=false)=>run(async()=>{
    const r=await request('/api/jobs/'+j.id+'/'+action,body);
    if(apply)load(r);
    await refreshJobs();
  });
  if(j.status==='awaiting')return <div className="detail"><p>{j.terms}</p><button className="primary" disabled={stale||busy} onClick={()=>act('approve',{confirm:j.id})}>确认本次联网搜索</button>{stale&&<p>{staleMessage}</p>}</div>;
  if(j.status==='running')return <p role="status">AI 正在查找原始来源、定位素材并整理出处…</p>;
  if(j.status==='unknown')return <IssueNotice area="资料搜索" job={j} error={j.error||'上次搜索提交状态待核对。'}><button onClick={()=>{const note=window.prompt('填写已核对的任务或账户记录');if(note)act('reconcile',{note});}}>记录核对结果</button></IssueNotice>;
  if(j.status==='failed')return <IssueNotice area="资料搜索" job={j} error={j.error}/>;
  if(j.status==='applied'){
    const results=j.result||[];
    const savedCount=results.filter(m=>(p.researchSources||[]).some(s=>s.url===m.url&&s.locator===m.locator)).length;
    return <p role="status">联网搜索已完成 · 找到 {results.length} 条素材，其中 {savedCount} 条出处已保存在本期。</p>;
  }
  if(j.status==='reconciled')return <p role="status">上次搜索已记录核对结果。</p>;
  if(j.status!=='ready')return null;
  if(!j.result?.length)return <p role="status">{visual?'本次没有找到出处完整的图片、视频或数据。可以调整选题或口播后再找。':'本次没有找到出处完整的素材。可以缩小选题或调整措辞后再搜。'}</p>;
  return <div><div className="research-toolbar"><p role="status">找到 {j.result.length} 条素材 · 已选 {picks.length} 条</p>
    <div className="research-toolbar-actions"><button type="button" className="research-recommend-button" disabled={busy||stale||recommending||recommendationJob?.status==='unknown'||!!recommendation&&!recommendation.picks.length} aria-busy={recommending} onClick={recommend}>
      <Sparkles size={16} aria-hidden="true"/>{recommending?'AI 正在推荐…':recommendation?'勾选 AI 推荐':'AI 推荐'}</button>
      <button disabled={busy||stale||recommending||!picks.length} className="primary" onClick={()=>act('apply',{picks},true)}>{adoptLabel}（{picks.length}）</button></div></div>
    <p className="muted research-recommendation-help">从当前结果中挑选更适合本期的素材，并说明理由。推荐使用本机 Codex 账户额度。</p>
    {recommending&&<p className="research-recommendation-summary" role="status">AI 正在比较相关性、来源质量和内容互补性，完成后自动补充勾选。</p>}
    {recommendation&&<div className="research-recommendation-summary" role="status"><b>{recommendation.picks.length?'AI 推荐 '+recommendation.picks.length+' 条':'暂无合适推荐'}</b><p>{recommendation.summary}</p>{!!recommendation.picks.length&&<small>已补充勾选推荐项，保留原有选择；可以继续调整后采用。</small>}</div>}
    {recommendationJob?.status==='failed'&&<IssueNotice area="AI 素材推荐" job={recommendationJob} error={recommendationJob.error} onRetry={busy||stale?undefined:recommend} retryLabel="重新推荐"/>}
    {recommendationJob?.status==='unknown'&&<IssueNotice area="AI 素材推荐" job={recommendationJob} error={recommendationJob.error||'上次推荐状态待核对，手动选材仍可继续。'}><button disabled={busy} onClick={()=>{const note=window.prompt('填写已核对的任务或账户记录');if(note)run(async()=>{await request('/api/jobs/'+recommendationJob.id+'/reconcile',{note});await refreshJobs();});}}>记录核对结果</button></IssueNotice>}
    {j.result.map((m,i)=><ResearchSource key={i} m={m} recommendation={recommendation?.picks.find(item=>item.index===i)?.reason} choice={<input type="checkbox" aria-label={`采用 ${m.title} · ${m.kind} · ${m.locator}`} disabled={busy||stale||recommending} checked={picks.includes(i)} onChange={e=>setPicks(e.target.checked?[...picks,i]:picks.filter(n=>n!==i))}/>}/>)}
    <button disabled={busy||stale||recommending||!picks.length} className="primary" onClick={()=>act('apply',{picks},true)}>{adoptLabel}（{picks.length}）</button>
    {stale&&<p className="hint">{staleMessage}</p>}</div>;
}
export function TopicResearch({p,ai,tasks,busy,dirty,run,request,load,refreshJobs}) {
  const j=tasks.find(x=>x.task==='research'&&x.researchScope!=='visuals');
  const pending=searchPending(j,p.version,dirty);
  return <section className="panel" id="topic-research"><small>TOPIC RESEARCH</small><h2>按选题找素材</h2>
    <p>AI 会根据你的一句话主题，查找科学资料、数据和可参考的图片或视频，并标明发布方、原文链接和具体位置。</p>
    <button className="primary" disabled={busy||!p.topic.trim()||pending} onClick={()=>ai('research')}><Search size={16}/> {j?'重新按选题搜索':'让 AI 按选题找素材'}</button>
    {!p.topic.trim()&&<p className="muted">先在上方填写本期想讲的问题。</p>}
    {j&&<SearchJob key={j.id} {...{j,p,tasks,dirty,busy,run,request,load,refreshJobs}}/>}
    {!!p.researchSources?.length&&<><h3>本期已采用 · {p.researchSources.length}</h3>
      {p.researchSources.map(m=><ResearchSource key={m.url+m.locator} m={m}/>)}</>}
  </section>;
}

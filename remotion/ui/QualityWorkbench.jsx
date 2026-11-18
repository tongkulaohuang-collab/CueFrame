import React,{useEffect,useState} from 'react';
import {Input,Select} from './fields';
import {filmStyleIssues} from '../shared/film-style.mjs';
import {timeline} from '../shared/model.mjs';
import {currentAlignment} from '../shared/voice-alignment.mjs';
import {AlignmentEditor} from './AlignmentEditor';

export function VoiceAlignmentPanel({p,s,lang,chosen,saved,request,load,run,busy}) {
  const [state,S]=useState(null),[error,E]=useState('');
  useEffect(()=>{
    if(!s||!chosen){S(null);return;}let live=true,timer;
    const poll=async()=>{try{const r=await fetch(`/api/projects/${p.id}/voice-alignment?shotId=${s.id}&lang=${lang}`);const v=await r.json();if(!r.ok)throw Error(v.error||'读取定位状态失败');if(live){S(v);E('');if(v.jobs.some(j=>['queued','running'].includes(j.status)))timer=setTimeout(poll,1500);}}
      catch(e){if(live)E(e.message);}};poll();return()=>{live=false;clearTimeout(timer);};
  },[p.id,p.version,s?.id,lang,chosen?.id,state?.trigger]);
  if(!s||!chosen)return null;
  const adopted=currentAlignment(s,chosen,lang),job=state?.jobs?.find(j=>j.assetId===chosen.id&&j.text===s[lang])||(adopted?{id:adopted.receiptId,status:'done',result:adopted}:null),running=job&&['queued','running'].includes(job.status);
  return <details className="alignment-panel"><summary>语音对齐与字幕定位{adopted?' · '+adopted.timing:''}</summary>
    <p>本机处理，免费，不上传录音。中文可按原稿直接定位声音，字词终点仍须结合原声核对；英语沿用识别与校准。中文声学定位每段最多45秒，较长段落保留基础定位。不会重录或修改原配音。</p>
    <button disabled={busy||running||!state?.ready} onClick={()=>run(async()=>{const q=await saved();await request(`/api/projects/${q.id}/voice-alignment`,{version:q.version,shotId:s.id,lang});S(v=>({...v,trigger:Date.now()}));})}>{running?'正在本机定位…':state?.forcedReady&&lang==='zh'?'按原稿定位当前配音':'定位当前配音的字词'}</button>
    {state&&!state.ready&&<p role="status">本地模型尚未安装，请运行 npm run setup:alignment。</p>}
    {error&&<p role="alert">{error}</p>}{job?.error&&<p role="alert">{job.error}</p>}
    {job?.result&&<div><p><b>机器识别匹配 {Math.round(job.result.coverage*100)}%{job.result.transcriptReconciled?' · 已人工核对台词':''}</b> · 识别文字：{job.result.recognized}</p><p>{job.result.warning}</p>
      {job.result.forced&&<p role="status">声学定位已完成 · {job.result.forced.lowConfidenceUnits.length} 个字词需重点复核。{job.result.forced.transcriptGuard?.matches?'稿件读音对应检查通过。':'稿件读音存在差异，暂不采用。'}{job.result.forced.transcriptGuard?.matches&&!job.result.forced.transcriptGuard.exactNormalized?'存在同音字差异，原文和识别结果均保留。':''}</p>}
      {job.result.forced&&!job.result.applicable&&<button disabled={busy||running} onClick={()=>run(async()=>{const q=await saved();await request(`/api/projects/${q.id}/voice-alignment`,{version:q.version,shotId:s.id,lang,engine:'asr'});S(v=>({...v,trigger:Date.now()}));})}>保留原稿，改用基础定位候选</button>}
      <button disabled={busy||!job.result.applicable||adopted?.receiptId===job.id} onClick={()=>run(async()=>{const q=await saved();load(await request(`/api/projects/${q.id}/voice-alignment`,{version:q.version,action:'apply',jobId:job.id}));})}>{adopted?.receiptId===job.id?'已采用，待连续听审':'采用定位字幕'}</button>
      <details><summary>查看字词时间依据</summary><div className="alignment-tokens">{job.result.words.map((w,i)=><span key={i}>{w.c} <small>{w.from.toFixed(2)}s</small></span>)}</div></details>
      <AlignmentEditor key={job.id} {...{job,chosen,busy}} onSave={(boundaries,confirmedText)=>run(async()=>{const q=await saved();load(await request(`/api/projects/${q.id}/voice-alignment`,{version:q.version,action:'calibrate',jobId:job.id,boundaries,confirmed:true,confirmedText}));})}/>
    </div>}
  </details>;
}
export function FilmStylePanel({p,set,busy}) {
  const issues=filmStyleIssues(p,timeline(p).rows),sync=p.filmStyle||{};
  const changeSync=patch=>set({filmStyle:{version:1,preset:p.kind==='product'?'minimal':'editorial',...sync,...patch}});
  return <section className="panel film-style-panel"><h2>语音同步与镜头衔接</h2>
    <p>按台词安排画面变化，并保持前后镜的对象与状态连续。视觉风格统一在“风格与参考”中选择；没有参考时使用默认风格。</p>
    <><label className="alignment-confirm"><input type="checkbox" disabled={busy} checked={Boolean(sync.narrationFocus)} onChange={e=>changeSync({narrationFocus:e.target.checked})}/>按已定位台词短暂突出对应对象</label><p className="muted">只在台词能对应到对象名称时出现轮廓强调，保留原尺度。可在对象中另填对应台词；没有可用定位时保持原画面。</p>
      <label className="alignment-confirm"><input type="checkbox" disabled={busy} checked={Boolean(sync.narrationMotion)} onChange={e=>changeSync({narrationMotion:e.target.checked})}/>让文字重点、图片细节和产品切换跟随台词</label><p className="muted">需先采用语音定位。图片可在内容组件中设置局部焦点；缺少完整语音依据时保留原编排。</p>
      <label className="alignment-confirm"><input type="checkbox" disabled={busy} checked={Boolean(sync.matchCuts)} onChange={e=>changeSync({matchCuts:e.target.checked})}/>连续镜头从前镜终态开始</label><p className="muted">数值比较和图文叙事保留同一对象的位置与已出现文字；同一图片从前镜裁切进入新的观察位置。需要相同对象编号、数值和素材，其他类型仍须设计并审看衔接。</p>
      {p.shots.slice(1).map((s,i)=>{const common=s.semanticScene?.items.filter(v=>p.shots[i].semanticScene?.items.some(a=>a.id===v.id&&a.label===v.label))||[];const change=patch=>set({shots:p.shots.map(v=>v.id===s.id?{...v,handoff:{mode:'compare',reason:'',...v.handoff,...patch}}:v)});return <div className="handoff-editor" key={s.id}><div className="content-brief-grid"><Select title={`第 ${i+2} 段如何接前段`} value={s.handoff?.mode||'compare'} options={[["compare","比较或换一个观察角度"],["continue","承接同一对象的终态"],["bridge","跨类型：同一对象换一种表示"],["reset","新场景或不同时间"]]} onChange={mode=>change({mode,...(mode==='bridge'?{seconds:s.handoff?.seconds||.6,entityIds:s.handoff?.entityIds||common.map(v=>v.id)}:{})})}/>
        <Input title={`第 ${i+2} 段交接理由`} value={s.handoff?.reason||''} onChange={reason=>change({reason})}/></div>
        {s.handoff?.mode==='bridge'&&<><p>图文、数值、因果和产品模型之间，保持对象身份与标签，再对位替换表示。需复用同一编号；产品以切口处可见的界面承接。请在样片中核对实际关系。</p><Input type="number" min=".25" max="1.2" step=".05" title={`第 ${i+2} 段交接秒数`} value={s.handoff.seconds??.6} onChange={seconds=>change({seconds})}/>{common.map(v=><label className="alignment-confirm" key={v.id}><input type="checkbox" checked={s.handoff.entityIds?.includes(v.id)||false} onChange={e=>change({entityIds:e.target.checked?[...(s.handoff.entityIds||[]),v.id]:(s.handoff.entityIds||[]).filter(id=>id!==v.id)})}/>{`第 ${i+2} 段交接对象：${v.label}`}</label>)}{!common.length&&<p role="status">前后段还没有同名、同编号对象，请先在内容组件中复用对象身份。</p>}</>}
      </div>;})}
      <p role="status">{issues.length?issues.join('；'):'已检查对象名称与声明的状态交接；实际视觉连贯性仍需完整看片。'}</p></>
  </section>;
}
export function SemanticSyncFields({p,s,set}) {
  const sync=s.semanticSync||{startQuote:'',endQuote:''};
  const change=patch=>set({shots:p.shots.map(v=>v.id===s.id?{...v,semanticSync:{...sync,...patch}}:v)});
  return <details><summary>让动作跟随台词</summary><p>采用字词定位后，填写变化开始和结果到达时的台词。两个点都取台词的起点；保留至少 0.6 秒阅读结果。匀速物理模型保持原速。</p>
    <div className="content-brief-grid"><Input title="变化开始对应台词" value={sync.startQuote} onChange={startQuote=>change({startQuote})}/><Input title="结果到达对应台词" value={sync.endQuote} onChange={endQuote=>change({endQuote})}/>
      <Input type="number" min="1" title="开始台词第几次出现" value={sync.startOccurrence||1} onChange={startOccurrence=>change({startOccurrence})}/><Input type="number" min="1" title="结果台词第几次出现" value={sync.endOccurrence||1} onChange={endOccurrence=>change({endOccurrence})}/></div>
    <button onClick={()=>set({shots:p.shots.map(v=>v.id===s.id?{...v,semanticSync:undefined}:v)})}>恢复按镜头时长编排</button></details>;
}

import {IssueNotice} from './IssueNotice';
import React,{useEffect,useRef,useState} from 'react';
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {removeNarration} from '../shared/assets.mjs';

export function VoiceOutputs({p,select,busy,saved,request,load,run,issues=[]}) {
  const plan=voiceAssemblyPlan(p), bgm=p.assets.find(a=>a.id===p.scienceFlow?.bgmId);
  const key=JSON.stringify([plan.signature,bgm?.id,bgm?.src,bgm?.duration]);
  const current=useRef(key);current.current=key;
  const [output,setOutput]=useState(null),[retry,setRetry]=useState(0);
  const state=output?.key===key?output:{};
  const hasNarration=!!state.narration;
  useEffect(()=>{
    if(busy||!plan.ready||hasNarration)return;
    let active=true;
    setOutput({key,phase:'narration'});
    (async()=>{
      const q=await saved();
      if(!active||voiceAssemblyPlan(q).signature!==plan.signature)return;
      const result=await request('/api/projects/'+q.id+'/voice-assembly',{
        version:q.version,kind:'narration',signature:plan.signature,
      });
      if(active)setOutput({key,...result});
    })().catch(e=>{if(active)setOutput({key,error:e.message});});
    return()=>{active=false;};
  },[key,plan.ready,busy,retry,hasNarration]);
  async function mixAll() {
    setOutput({...state,key,phase:'mix',error:null});
    try {
      const q=await saved();
      if(current.current!==key)return;
      const result=await request('/api/projects/'+q.id+'/voice-assembly',{
        version:q.version,kind:'mix',signature:plan.signature,
      });
      if(current.current===key)setOutput({key,...result});
    } catch(e) {if(current.current===key)setOutput({...state,key,error:e.message});}
  }
  const count=plan.segments.filter(s=>s.ready).length;
  const hasVoices=plan.segments.some(s=>s.voices.some(v=>v.asset));
  function remove(ids) {
    run(async()=>{
      const q=await saved();
      load(await request('/api/projects',removeNarration(q,ids)));
      setOutput(null);
    });
  }
  return <div className="voice-outputs">
    <section className="voice-output-card" aria-label="全部段落配音">
      <div className="voice-output-heading"><h3>全部段落配音</h3><span>{count} / {plan.segments.length} 段已完成</span></div>
      {hasVoices&&<button type="button" className="voice-remove" disabled={busy} onClick={()=>remove(p.shots.map(s=>s.id))}>删除全部配音</button>}
      <div className="voice-segment-list">{plan.segments.map(s=>{
        const problem=issues.find(i=>i.job.shotId===s.id&&s.voices.some(v=>v.lang===i.job.variant));
        return <div className="voice-segment" key={s.id}>
        <div className="voice-segment-heading"><b>第 {s.index+1} 段</b>
          <span className="muted">{s.ready?'已完成 · '+s.voices.reduce((n,v)=>n+(v.asset?.duration||0),0).toFixed(2)+' 秒':problem?.label||'待生成'}{s.ready&&problem&&' · 上次请求'+problem.label}</span>
          <div className="voice-segment-actions"><button disabled={busy} onClick={()=>select(s.id)}>查看本段</button>
          {s.voices.some(v=>v.asset)&&<button className="voice-remove" disabled={busy} onClick={()=>remove([s.id])}
            aria-label={'删除第 '+(s.index+1)+' 段配音'}>删除配音</button>}</div></div>
        <p>{s.title}</p>
        {s.voices.filter(v=>v.asset).map(v=><audio key={v.lang} controls preload="metadata" src={v.asset.src}
          aria-label={'第 '+(s.index+1)+' 段配音 '+v.lang}/>)}
      </div>;})}</div>
    </section>
    <section className="voice-output-card" aria-label="完整旁白">
      <h3>完整旁白</h3>
      <p className="muted" role="status">{state.error&&!state.narration?'完整旁白合成失败，可在下方查看原因并重试。':state.phase==='narration'?'全部配音已完成，正在自动合成完整旁白…':
        state.narration?'已按段落顺序与时间线自动合成 · '+state.narration.duration.toFixed(2)+' 秒':
          plan.ready?'全部配音已完成，准备合成完整旁白。':!plan.segments.length?'先写入或生成口播稿，再生成各段配音。':'还差 '+(plan.segments.length-count)+' 段，全部完成后会自动合成。'}</p>
      {state.narration&&<><audio controls preload="metadata" src={state.narration.src} aria-label="完整旁白试听"/>
        <a href={state.narration.src} download="完整旁白.wav">下载完整旁白</a></>}
    </section>
    <section className="voice-output-card" aria-label="BGM 与完整旁白">
      <h3>BGM ＋ 完整旁白</h3>
      <p className="muted">{bgm?'已选音乐：'+bgm.name+'。音乐按整段旁白长度循环，并降低音量。':'先在上方选择并采用 BGM。'}</p>
      <button disabled={busy||!!state.phase||!state.narration||!bgm} onClick={mixAll}>
        {state.phase==='mix'?'正在合成 BGM＋旁白…':state.mix?'重新合成 BGM＋旁白':'一键合成 BGM＋旁白'}</button>
      {state.mix&&<><audio controls preload="metadata" src={state.mix.src} aria-label="BGM 与完整旁白试听"/>
        <a href={state.mix.src} download="BGM与完整旁白.mp3">下载 BGM＋旁白</a></>}
    </section>
    {state.error&&<IssueNotice area="旁白与音乐合成" error={state.error} onRetry={busy||state.phase?undefined:()=>state.narration?mixAll():setRetry(n=>n+1)} retryLabel="重试本地合成"/>}
  </div>;
}

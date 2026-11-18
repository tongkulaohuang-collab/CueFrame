import React,{useEffect,useMemo,useRef,useState} from 'react';
import {alignmentUnits,calibrationDraft,calibrateBoundaries} from '../shared/speech-boundaries.mjs';

export function AlignmentEditor({job,chosen,onSave,busy}) {
  const units=useMemo(()=>alignmentUnits(calibrationDraft(job.result)),[job.id]);
  const [bounds,B]=useState(()=>units.map(({from,until})=>({from,until}))),[index,I]=useState(0),[time,T]=useState(0),[rate,R]=useState(1),[confirmed,C]=useState(false);
  const [confirmedText,CT]=useState(false);
  const [clipStatus,CS]=useState(''),[clipError,CE]=useState('');
  const context=useRef(null),decoded=useRef(null),clip=useRef(null),animation=useRef(0),generation=useRef(0);
  const audio=useRef(null),unit=units[index],boundary=bounds[index];
  const stopClip=()=>{generation.current++;cancelAnimationFrame(animation.current);if(clip.current){clip.current.onended=null;clip.current.stop();clip.current.disconnect();clip.current=null;}CS('');};
  useEffect(()=>()=>{generation.current++;cancelAnimationFrame(animation.current);if(clip.current){clip.current.onended=null;clip.current.stop();clip.current.disconnect();clip.current=null;}context.current?.close();context.current=null;decoded.current=null;},[chosen.src]);
  let error='';try{calibrateBoundaries(job.result,bounds,{confirmedText});}catch(e){error=e.message;}
  const change=(key,value)=>{B(v=>v.map((b,i)=>i===index?{...b,[key]:value}:b));C(false);};
  const seek=value=>{stopClip();if(audio.current&&Number.isFinite(value)){audio.current.currentTime=Math.max(0,Math.min(job.result.duration,value));T(audio.current.currentTime);}};
  const select=i=>{I(i);const prior=bounds.slice(0,i).findLast(b=>Number.isFinite(b.until));seek(Number.isFinite(bounds[i].from)?bounds[i].from:Math.max(0,(prior?.until||0)-.25));};
  const play=async()=>{stopClip();audio.current.pause();CE('');const ticket=generation.current;
    try{const ctx=context.current||(context.current=new AudioContext());await ctx.resume();CS('正在准备片段…');
      if(!decoded.current){const r=await fetch(chosen.src);if(!r.ok)throw Error('原声读取失败');decoded.current=await ctx.decodeAudioData(await r.arrayBuffer());}
      if(ticket!==generation.current)return;
      const from=Math.max(0,boundary.from-.15),until=Math.min(decoded.current.duration,boundary.until+.2),source=ctx.createBufferSource();
      source.buffer=decoded.current;source.playbackRate.value=rate;source.connect(ctx.destination);clip.current=source;
      const started=ctx.currentTime;CS(`正在试听 ${from.toFixed(3)}–${until.toFixed(3)} 秒`);
      source.onended=()=>{source.disconnect();if(clip.current===source){cancelAnimationFrame(animation.current);clip.current=null;T(until);CS('片段试听结束');}};
      source.start(0,from,until-from);
      const tick=()=>{if(clip.current!==source)return;T(Math.min(until,from+(ctx.currentTime-started)*rate));animation.current=requestAnimationFrame(tick);};tick();
    }catch(e){CS('');CE(e.message||'片段试听失败，可使用原声播放器。');}
  };
  const shownFrom=Number.isFinite(boundary.from)?boundary.from:Number.isFinite(unit.from)?unit.from:time,shownUntil=Number.isFinite(boundary.until)?boundary.until:Number.isFinite(unit.until)?unit.until:shownFrom;
  const first=Math.max(0,Math.min(shownFrom-1,job.result.duration-6)),span=Math.min(6,job.result.duration-first);
  const waveform=job.waveform;
  const peaks=waveform?.peaks.slice(Math.floor(first/waveform.step),Math.ceil((first+span)/waveform.step))||[];
  const max=Math.max(.01,...peaks),points=peaks.map((v,i)=>`${(i/Math.max(1,peaks.length-1)*1000).toFixed(1)},${(55-v/max*46).toFixed(1)}`).join(' ');
  const page=Math.floor(index/24)*24;
  const missing=bounds.findIndex(b=>!Number.isFinite(b.from)||!Number.isFinite(b.until));
  return <details className="alignment-editor"><summary>逐字试听与起止校准</summary>
    <p>选择字词，试听后修改起止，或使用当前播放位置。波形只是声音强弱，不能证明字词边界；保存校准不会自动通过全片听审。</p>
    {!job.result.applicable&&<><p>{job.result.forced?'声学路径未通过稿件或置信检查，已有时间仅供核对。':'识别存在差异：未对应字词的时间留空。'}若录音确有漏读，应先修改台词或录音；不要给未读出的字填写时间。</p><label className="alignment-confirm"><input type="checkbox" checked={confirmedText} onChange={e=>CT(e.target.checked)}/>已逐项核对原台词确实在录音中读出，没有漏读</label></>}
    <audio ref={audio} src={chosen.src} controls preload="metadata" aria-label="字词校准配音" onPlay={stopClip} onTimeUpdate={()=>{if(!clip.current)T(audio.current.currentTime);}} onSeeked={()=>{if(!clip.current)T(audio.current.currentTime);}}/>
    <div className="alignment-word-list" aria-label="选择校准字词">{units.slice(page,page+24).map((u,i)=><button key={page+i} type="button" aria-pressed={index===page+i} onClick={()=>select(page+i)}>{u.text}<small>{Number.isFinite(bounds[page+i].from)?bounds[page+i].from.toFixed(2)+'s':'待标记'}{job.result.forced?.lowConfidenceUnits.includes(page+i)?' · 重点复核':''}</small></button>)}</div>
    {job.result.forced?.lowConfidenceUnits.length>0&&<button type="button" onClick={()=>select(job.result.forced.lowConfidenceUnits.find(i=>i>index)??job.result.forced.lowConfidenceUnits[0])}>跳到需重点复核的字词</button>}
    {units.length>24&&<div className="alignment-toolbar"><button type="button" disabled={page===0} onClick={()=>select(Math.max(0,page-24))}>上一组字词</button><span>第 {page/24+1} / {Math.ceil(units.length/24)} 组</span><button type="button" disabled={page+24>=units.length} onClick={()=>select(page+24)}>下一组字词</button></div>}
    {missing>=0&&<button type="button" onClick={()=>select(missing)}>跳到待标记字词</button>}
    <div className="alignment-toolbar"><button type="button" disabled={!index} onClick={()=>select(index-1)}>上一字词</button><span>{index+1} / {units.length} · {unit.text}</span><button type="button" disabled={index===units.length-1} onClick={()=>select(index+1)}>下一字词</button></div>
    {peaks.length>0&&<svg className="alignment-waveform" viewBox="0 0 1000 110" role="img" aria-label={`配音波形 ${first.toFixed(2)} 至 ${(first+span).toFixed(2)} 秒`}><rect x={Math.max(0,(shownFrom-first)/span*1000)} y="4" width={Math.max(0,Math.min(1000,(shownUntil-first)/span*1000)-Math.max(0,(shownFrom-first)/span*1000))} height="100" className="word-window"/><polyline points={points} fill="none"/><line x1={(time-first)/span*1000} x2={(time-first)/span*1000} y1="0" y2="110" className="playhead"/></svg>}
    <label>播放位置 {time.toFixed(3)} 秒<input type="range" min="0" max={job.result.duration} step="0.01" value={time} onChange={e=>seek(Number(e.target.value))}/></label>
    <div className="alignment-toolbar"><button type="button" onClick={play} disabled={!Number.isFinite(boundary.from)||!Number.isFinite(boundary.until)||boundary.until<=boundary.from||boundary.from<0||boundary.until>job.result.duration}>试听此字词及前后衔接</button><button type="button" onClick={stopClip} disabled={!clipStatus}>停止片段试听</button><label>试听速度<select value={rate} onChange={e=>{stopClip();R(Number(e.target.value));audio.current.playbackRate=Number(e.target.value);}}><option value="1">正常速度</option><option value="0.75">0.75 倍</option></select></label></div>
    {clipStatus&&<p role="status">{clipStatus}</p>}{clipError&&<p role="alert">{clipError}</p>}
    <div className="content-brief-grid">{[['from','起点'],['until','终点']].map(([key,label])=><label key={key}>{label}（秒）<input type="number" min="0" max={job.result.duration} step="0.01" value={Number.isFinite(boundary[key])?Number(boundary[key].toFixed(6)):''} onChange={e=>change(key,e.target.value===''?NaN:Number(e.target.value))}/><button type="button" onClick={()=>change(key,Math.min(job.result.duration,Math.round(time*1000)/1000))}>把播放位置设为{label}</button></label>)}</div>
    {error&&<p role="alert">{error}</p>}
    <label className="alignment-confirm"><input type="checkbox" checked={confirmed} onChange={e=>C(e.target.checked)}/>已核对本次全部起止时间</label>
    <button type="button" disabled={busy||!confirmed||Boolean(error)} onClick={()=>onSave(bounds,confirmedText)}>保存校准并用于字幕与动作</button>
  </details>;
}

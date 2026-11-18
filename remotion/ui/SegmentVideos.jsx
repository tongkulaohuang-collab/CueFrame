import {IssueNotice} from './IssueNotice';
import React,{useEffect,useRef,useState} from 'react';
import {scienceGate} from '../shared/science-flow.mjs';
import {ExplanationPlan} from './ExplanationPlan';
import {SamplePlayer} from './SampleReview';
import {DesignNotice,useDirectorPlayback} from './DirectorChecks';
import {joinedCoverage,saveWatched} from '../shared/playback-record.mjs';
import {MediaDiagnostics,useMediaDiagnostics} from './MediaDiagnostics';
import {PlaybackSlot} from './PlaybackSlot';

export function SegmentVideos({p,variant,busy,dirty,saved,request,run,syncProject,openScript}) {
  const language=p.language==='separate'?variant:p.voice;
  // Reset only when the user changes project/language, never on a task poll.
  return <SegmentWorkspace key={p.id+':'+language} {...{p,variant,busy,dirty,saved,request,run,syncProject,openScript}}/>;
}
export function SegmentWorkspace({p,variant,busy,dirty,saved,request,run,syncProject,openScript}) {
  const lang=p.language==='separate'?variant:p.voice;
  const [state,setState]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(true),[reviewing,setReviewing]=useState(null);
  const sync=useRef(syncProject);sync.current=syncProject;
  useEffect(()=>{
    let active=true,inFlight=false;
    setError('');
    const poll=async()=>{
      if(inFlight)return;inFlight=true;
      try {
        const next=await request('/api/projects/'+p.id+'/segments?variant='+lang);
        if(!active)return;
        setState(next);setError('');
        if(next.version!==p.version) {
          const latest=await request('/api/projects/'+p.id);
          if(active)sync.current(latest);
        }
      }catch(e){if(active)setError(e.message);}finally{inFlight=false;}
    };
    poll();const timer=setInterval(poll,1800);
    return()=>{active=false;clearInterval(timer);};
  },[p.id,p.version,lang]);
  const batch=state?.batch,running=batch?.status==='running';
  const rows=state?.rows||p.shots.map((s,i)=>({shotId:s.id,index:i+1,text:s[lang],seconds:s.seconds,status:'waiting'}));
  const count=rows.filter(r=>r.video).length;
  const joined=(state?.final?.status!=='failed'&&state?.final)||state?.joined,joining=joined&&['queued','running'].includes(joined.status),whole=joined?.status==='done';
  const lastJoined=useRef(null);
  if(whole)lastJoined.current=joined;
  const playableJoined=whole?joined:lastJoined.current;
  const pending=rows.filter(r=>!r.video);
  const loading=!state;
  const readFailed=p.kind==='science'&&!!error;
  const generationNeeds=scienceGate(p),captionNeeds=scienceGate(p,false,{preserveVisuals:true});
  const generationDisabled=readFailed||loading||busy||running||dirty||generationNeeds.length>0;
  const reviewed=rows.filter(r=>r.video&&r.quality?.issues.length===0).length;
  const generate=(ids,mode='missing')=>run(async()=>{
    const q=await saved(mode==='captions'?{...p,shots:p.shots.map(s=>ids.includes(s.id)?{...s,captionLayout:'short'}:s)}:undefined);
    await request('/api/projects/'+q.id+'/segments',{version:q.version,variant:lang,shotIds:ids,mode});
    setState(await request('/api/projects/'+q.id+'/segments?variant='+lang));
  });
  const revise=async result=>{sync.current(result.project);setState(await request('/api/projects/'+p.id+'/segments?variant='+lang));};
  const resume=()=>run(async()=>{
    await request('/api/projects/'+p.id+'/segments',{version:p.version,resumeOf:batch.id});
    setState(await request('/api/projects/'+p.id+'/segments?variant='+lang));
  });
  const join=(final=false)=>run(async()=>{
    const q=await saved();
    await request('/api/projects/'+q.id+'/join',{version:q.version,variant:lang,final});
    setState(await request('/api/projects/'+q.id+'/segments?variant='+lang));
  });
  const segments=<section className="panel segment-videos">
    <header><div><h2>分段视频</h2><span className="muted" role="status">{readFailed?(loading?'分段状态读取失败':'分段状态未能更新，显示上次记录'):loading?'正在读取分段状态…':`${running?'正在生成 · ':''}${count} / ${rows.length} 段已完成`}</span></div>
      <a href={'?view=images#'+encodeURIComponent(p.id)} target="_blank" rel="noreferrer">查看图片参考</a>
      <div className="segment-generate-actions">
        <button disabled={generationDisabled||!pending.length} onClick={()=>generate(pending.map(r=>r.shotId))}>
          {readFailed?'等待恢复分段状态':loading?'正在读取…':running&&batch.mode==='missing'?'生成中…':!pending.length?'全部已生成':`生成缺失或过期分段（${pending.length} 段）`}
        </button>
        <button className="primary" disabled={generationDisabled||!rows.length} onClick={()=>generate(rows.map(r=>r.shotId),'visual')}
          title="按顺序重新制作全部分段画面，保留已有配音和背景音乐">
          {running&&batch.mode==='visual'?'全部生成中…':`全部生成（${rows.length} 段）`}
        </button>
      </div></header>
    <ExplanationPlan p={p} openScript={openScript}/>
    {!loading&&<p className="muted">{reviewed} / {rows.length} 段已通过检查。{pending.length?`补缺只处理第 ${pending.map(r=>r.index).join('、')} 段，不执行已有修改意见。`:'当前分段均已生成。'}“全部生成”会按顺序重新制作所有分段画面，保留已有配音和背景音乐。重新制作画面使用当前 Codex 账户额度。</p>}
    <button disabled={readFailed||loading||busy||running||captionNeeds.length>0||!rows.length||rows.some(r=>!r.video&&!r.previousVideo&&!p.shots.find(s=>s.id===r.shotId)?.motionPlan)} onClick={()=>generate(rows.map(r=>r.shotId),'captions')}>仅更新全部字幕（{rows.length} 段）</button>
    {generationNeeds.length>0&&<p className="hint">新画面制作需要：{generationNeeds.join('；')}。旧视频可继续预览，已有画面可单独更新字幕。</p>}
    <p className="muted">字幕更新采用短句安全区，保留所有现有动画、配音与背景音乐，仅本地重新渲染并更新 SRT。</p>
    {error&&p.kind!=='science'&&<IssueNotice area="分段视频" error={error}/>}
    {['failed','cancelled'].includes(batch?.status)&&<IssueNotice area="分段制作" job={batch} error={batch.error||'分段生成已停止，已完成的视频已保留。'}
      onRetry={!readFailed&&!busy&&!running&&!dirty&&p.version===(batch.expectedVersion??batch.version)?resume:undefined} retryLabel="继续未完成分段"/>}
    <div className="segment-list">{!loading&&rows.map(row=><article className="segment-card" key={row.shotId}>
      <h3>第 {row.index} 段 <small>{Number(row.seconds).toFixed(1)} 秒 · {({waiting:'尚未生成',designing:'正在制作动画',rendering:'正在渲染',failed:'本次制作失败',unknown:'结果待核对',stopped:'批次已停止，本段未制作',stale:'内容已更新，需更新视频',changes:'意见待执行',review:'待看片检查',approved:'已通过检查',done:'待看片检查'})[row.status]}</small></h3>
      {row.video||row.previousVideo?<PlaybackSlot job={row.video||row.previousVideo}>{display=>reviewing===row.shotId?<SamplePlayer key={display.id} job={display} {...{p,request,run}} dirty={dirty||display.id!==row.video?.id} busy={busy||running} autoPlay={false}
        onRevision={revise} updateJob={async()=>setState(await request('/api/projects/'+p.id+'/segments?variant='+lang))}/>:<SegmentPlayer key={display.id} row={{...row,video:display}} fps={p.fps}/>}</PlaybackSlot>:<div className="segment-placeholder" role="status">
        {row.status==='designing'?'正在制作动画…':row.status==='rendering'?'正在生成视频…':row.status==='failed'?'本段制作失败':row.status==='unknown'?'请先核对原请求':row.status==='stopped'?'本批次已停止':'等待生成'}
      </div>}
      {!!row.quality?.designIssues.length&&reviewing!==row.shotId&&<DesignNotice p={p} shotId={row.shotId} area={'第 '+row.index+' 段画面'} issues={row.quality.designIssues}/>}
      <div className="sample-actions">
        {row.video&&<button aria-expanded={reviewing===row.shotId} onClick={()=>setReviewing(reviewing===row.shotId?null:row.shotId)}>{reviewing===row.shotId?'收起检查':'检查这一段'}</button>}
        <button disabled={generationDisabled||row.status==='unknown'} onClick={()=>generate([row.shotId],row.video||row.previousVideo?'visual':'missing')}>{row.video||row.previousVideo?'重新制作本段画面':'生成这一段'}</button>
      </div>
      {row.errorJob&&<IssueNotice area={'第 '+row.index+' 段视频'} job={row.errorJob} error={row.errorJob.error}
        onRetry={!busy&&!running&&!dirty&&row.errorJob.type==='render'?()=>generate([row.shotId],batch?.mode==='captions'?'captions':'missing'):undefined} retryLabel={batch?.mode==='captions'?'重试本段字幕更新':'重试本段渲染'}/>}
      <p className="segment-narration">{row.text}</p>
    </article>)}</div>
  </section>;
  return <div className="video-workbench">
    {readFailed&&<IssueNotice area="读取分段视频状态" error={error} summary={error}/>}
    {state?.comparison&&<MotionComparison key={state.comparison.id} job={state.comparison}/>}
    {(joined||playableJoined||rows.length>0&&count===rows.length)&&<section className="panel joined-video">
      <header><h2>{joined?.mode==='final'?'已审成片':'待审预览'}</h2>{whole&&<span className="muted">{Math.floor(joined.evidence.duration/60)} 分 {Math.round(joined.evidence.duration%60)} 秒</span>}</header>
      {playableJoined?<PlaybackSlot job={playableJoined}>{display=><JoinedPlayer key={display.id} job={display} fps={p.fps}/>}</PlaybackSlot>:<>
        <div className="joined-empty" role="status">{joining?'正在合成完整视频…':joined?.status==='failed'?'合成未完成，请重试。':`将 ${rows.length} 段按顺序连成一个视频。`}</div>
        {joined?.status==='failed'&&<IssueNotice area="完整视频合成" job={joined} error={joined.error}/>}
      </>}
      <div className="sample-actions">
        <button disabled={readFailed||busy||dirty||joining||running||count!==rows.length} onClick={()=>join(false)}>{joining?'合成中…':'合成待审预览'}</button>
        <button className="primary" disabled={readFailed||busy||dirty||joining||running||!rows.length||reviewed!==rows.length||state?.final?.status==='done'} onClick={()=>join(true)}>{state?.final?.status==='done'?'成片已通过检查':'导出已审成片'}</button>
      </div>
      {state?.final?.status==='failed'&&<IssueNotice area="已审成片合成" job={state.final} error={state.final.error}/>}
      {reviewed<rows.length&&<p className="hint">还有 {rows.length-reviewed} 段未通过检查。展开下方分段，点击“检查这一段”；缺失动作的段落可直接重新制作。待审预览可随时合成。</p>}
      {dirty&&<p className="hint">内容有修改，请先更新分段视频。</p>}
    </section>}
    <details className="segment-collapse" open={expanded} onToggle={e=>{setExpanded(e.currentTarget.open);if(!e.currentTarget.open)e.currentTarget.querySelectorAll('video').forEach(v=>v.pause());}}>
      <summary>查看 {rows.length} 段视频</summary>{segments}
    </details>
  </div>;
}
const playOnly=e=>document.querySelectorAll('.video-workbench video').forEach(v=>{if(v!==e.currentTarget)v.pause();});
function MotionComparison({job}) {
  const ref=useRef(null),diagnostics=useMediaDiagnostics(ref,job.id);
  const remade=job.mode==='remake-pair';
  return <section className="panel joined-video" aria-label={remade?'前两段重做样片':'动效候选对照'}>
    <header><h2>{remade?'前两段重做样片':'动效对照'} <small>候选</small></h2><span className="muted">{remade?'第 1–2 段':'第 '+job.shotNumber+' 段'} · {Number(job.evidence?.duration).toFixed(1)} 秒</span></header>
    <p className="muted">{remade?'保留原配音、音乐和非人物素材；重新编排图片、文字与图形动效，两段连续播放。':'左侧为当前预览原片，右侧为动效修复候选。使用同一音轨，方便比较图片、文字与图形的变化。'}</p>
    <video ref={ref} controls playsInline preload="metadata" aria-label={remade?'前两段无人物样片':'动效修复前后对照'} style={{aspectRatio:'auto'}} src={job.output+'film.mp4'} onPlay={playOnly}/>
    <MediaDiagnostics read={diagnostics}/>
    <div className="segment-downloads">{remade?(job.parts||[]).map(part=><a key={part.number} href={part.output+'sample.mp4'} target="_blank" rel="noreferrer">单独看第 {part.number} 段</a>):<a href={job.output+'sample.mp4'} target="_blank" rel="noreferrer">单独查看修复样片</a>}
      <a href={job.output+'film.mp4'} download={remade?'前两段重做样片.mp4':'动效对照.mp4'}>{remade?'下载两段样片':'下载对照'}</a><a href={job.output+'subtitles.srt'} download="动效样片.srt">字幕 SRT</a>
      {remade&&<a href={job.output+'editable-project.zip'} download="前两段可编辑工程.zip">可编辑工程</a>}</div>
    <p className="hint">{remade?'这两段供看片确认，原项目和完整预览仍保留在下方。':'候选用于看片比较，完整项目仍按下方分段继续检查。'}</p>
  </section>;
}
function JoinedPlayer({job,fps}) {
  const ref=useRef(null);
  const diagnostics=useMediaDiagnostics(ref,job.id);
  const playback=useDirectorPlayback(job.evidence?.duration||0,job.id,[],ranges=>{
    for(const part of joinedCoverage(job.segments||[],fps,ranges))saveWatched(sessionStorage,part.id,part.duration,part.ranges);
  });
  return <>
    <video ref={ref} controls playsInline preload="auto" aria-label={job.mode==='final'?'已审成片':'待审预览'} src={job.output+'film.mp4'} onPlay={e=>{playOnly(e);playback.observe(e);}}
      onTimeUpdate={playback.observe} onPause={playback.observe} onSeeking={playback.observe} onSeeked={playback.observe} onRateChange={playback.observe} onEnded={playback.observe}/>
    <p className="muted">正常速度观看记录同步到对应分段；动作、风格与字幕仍需逐项确认。</p>
    <MediaDiagnostics read={diagnostics}/>
    <div className="segment-downloads"><a href={job.output+'film.mp4'} download={job.mode==='final'?'已审成片.mp4':'待审预览.mp4'}>{job.mode==='final'?'下载已审成片':'下载待审预览'}</a>
      <a href={job.output+'subtitles.srt'} download="完整视频.srt">字幕</a></div>
  </>;
}
function SegmentPlayer({row,fps}) {
  const ref=useRef(null);
  const diagnostics=useMediaDiagnostics(ref,row.video.id);
  const playback=useDirectorPlayback(row.video.evidence?.frames/fps||row.seconds,row.video.id,row.video.review?.watched||[]);
  return <>
    <video ref={ref} controls playsInline preload="metadata" src={row.video.output+'sample.mp4'}
      aria-label={'第 '+row.index+' 段视频'} onPlay={e=>{playOnly(e);playback.observe(e);}}
      onTimeUpdate={playback.observe} onPause={playback.observe} onSeeking={playback.observe} onSeeked={playback.observe} onRateChange={playback.observe} onEnded={playback.observe}/>
    <MediaDiagnostics read={diagnostics}/>
    <div className="segment-downloads"><a href={row.video.output+'sample.mp4'} download={'第'+row.index+'段.mp4'}>下载视频</a>
      <a href={row.video.output+'subtitles.srt'} download={'第'+row.index+'段.srt'}>字幕</a></div>
  </>;
}

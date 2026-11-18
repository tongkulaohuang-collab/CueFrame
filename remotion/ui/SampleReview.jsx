import {isAuthoredProcess,isModelProcess} from '../shared/production-mode.mjs';
import React, {useEffect, useRef, useState} from 'react';
import {Select} from './fields';
import {sampleJob} from '../shared/sample-review.mjs';
import {needsVisualScopeUpdate} from '../shared/visual-continuity.mjs';
import {needsCameraPlanUpdate} from '../shared/camera-plan.mjs';
import {needsMotionDesignUpdate,designReport,directorReviewIssues,needsDirectorReview} from '../shared/director-quality.mjs';
import {DirectorChecks,useDirectorPlayback} from './DirectorChecks';
import {IssueNotice} from './IssueNotice';
import {StyleFrames} from './ShotImages';
import {MediaDiagnostics,useMediaDiagnostics} from './MediaDiagnostics';
import {PlaybackSlot} from './PlaybackSlot';

export function SampleReview({p,sel,select,variant,tasks,busy,dirty,issues,generate,request,updateJob,run,continueFilm,onProductReview,onRevision,onShotImages,children}) {
  const lang=p.language==='separate'?variant:p.voice;
  const [current,setCurrent]=useState(null);
  const [readError,setReadError]=useState(null),[retryRead,setRetryRead]=useState(0);
  const currentKey=[p.id,p.version,sel,lang].join(':');
  const latestDone=tasks.find(j=>j.type==='render'&&j.status==='done'&&j.shotId===sel&&j.variant===lang)?.id;
  useEffect(()=>{
    let active=true;
    if(p.version && (p.kind==='product'||p.kind==='science'&&!isAuthoredProcess(p)))request('/api/projects/'+p.id+'/segments?variant='+lang)
      .then(state=>{if(active&&state.version===p.version){setReadError(null);setCurrent({key:currentKey,video:state.rows.find(r=>r.shotId===sel)?.video});}})
      .catch(e=>{if(active&&p.kind==='science')setReadError({key:currentKey,message:e.message});});
    return()=>{active=false;};
  },[currentKey,latestDone,retryRead]);
  const oldVisualRules=!isAuthoredProcess(p)&&needsVisualScopeUpdate(p,sel);
  const oldCameraRules=!isAuthoredProcess(p)&&needsCameraPlanUpdate(p,sel),oldMotionRules=needsMotionDesignUpdate(p,sel),needsRedesign=oldVisualRules||oldCameraRules||oldMotionRules;
  const job=sampleJob(tasks,p,sel,lang);
  const animation=tasks.find(j=>j.task==='motion'&&j.project===p.id&&j.shotId===sel&&
    (j.version===p.version||j.appliedVersion===p.version));
  const makingAnimation=animation&&(animation.status==='running'||animation.status==='ready'&&!dirty);
  const interrupted=animation?.status==='unknown';
  const pending=makingAnimation||job && ['queued','running'].includes(job.status);
  const failedAnimation=animation?.status==='failed'&&(!job||animation.created>job.created);
  const checkedVideo=current?.key===currentKey?current.video:null;
  const currentVideo=checkedVideo?(tasks.find(j=>j.id===checkedVideo.id)||checkedVideo):isAuthoredProcess(p)?tasks.find(j=>j.type==='render'&&j.scope==='shot'&&j.shotId===sel&&j.variant===lang&&j.version===p.version&&j.status==='done')||null:null;
  const preview=currentVideo||tasks.filter(j=>j.type==='render'&&j.scope==='shot'&&j.project===p.id&&j.shotId===sel&&j.variant===lang&&j.status==='done'&&j.output)
    .sort((a,b)=>String(b.created).localeCompare(String(a.created)))[0];
  const playable=!!preview;
  return <section className="panel sample-review">
    <header><h2>样镜审核</h2>{p.shots.length>1&&<Select title="镜头" value={sel} onChange={select} options={p.shots.map(s=>[s.id,s.title])}/>}</header>
    {readError?.key===currentKey&&<IssueNotice area="读取样镜状态" error={readError.message} summary={readError.message} onRetry={()=>setRetryRead(n=>n+1)} retryLabel="重新读取样镜状态"/>}
    {playable ? <><p className="muted">{pending?'新版本正在制作，仍可播放上一版。':!currentVideo&&preview.version!==p.version?'保留的旧版预览；更新当前分段后再审核。':'当前可播放版本'}</p><PlaybackSlot key={p.id+':'+sel+':'+lang} job={preview}>{display=><SamplePlayer key={display.id} job={display} {...{p,request,updateJob,run,continueFilm,onProductReview,onRevision}} busy={busy||pending} dirty={dirty||display.id!==currentVideo?.id}/>}</PlaybackSlot></> :
      <div className="sample-empty" role="status">
        <p>{makingAnimation?'正在按脚本和效果图制作动画…':pending?'正在生成样镜，完成后自动播放…':interrupted?'上次动画制作已中断，请在任务记录中核对后再试。':animation?.status==='failed'||job?.status==='failed'?'样镜生成失败':'点击生成，完成后直接播放审核。'}</p>
        {job?.status==='failed'&&<IssueNotice area="样镜渲染" job={job} error={job.error||'本地渲染未完成，请查看任务记录。'} onRetry={busy||dirty?undefined:()=>run(async()=>updateJob(await request('/api/jobs/'+job.id+'/retry',{})))} retryLabel="重试本地渲染"/>}
        {(failedAnimation||interrupted)&&<IssueNotice area="样镜动画" job={animation} error={animation.error||'原动画请求状态待核对。'}/>}
      </div>}
    {playable&&(failedAnimation||interrupted)&&<IssueNotice area="样镜动画" job={animation} error={animation.error||'原动画请求状态待核对，上一版视频已保留。'}/>}
    {playable&&job?.status==='failed'&&<IssueNotice area="样镜渲染" job={job} error={job.error}/>}
    {!playable&&onShotImages&&sel&&<StyleFrames p={p} focus={sel} request={request}/>}
    <div className="sample-generate">
      <button className={playable?'':'primary'} disabled={busy||pending||interrupted||!sel||issues.length>0} onClick={generate}>
        {pending?'生成中…':needsRedesign?'重新制作画面':playable?'重新生成样镜':'生成样镜'}
      </button>
      {p.language==='separate'&&<span className="muted">同时生成中英文两版</span>}
      {onShotImages&&<button onClick={onShotImages}>替换本镜图像素材</button>}
    </div>
    {needsRedesign&&!pending&&<p className="muted">重新制作会按口播安排切镜、近景和远景{oldVisualRules?'，并补齐所需对象':''}{oldMotionRules?'，逐项落实脚本动作与所选风格':''}，保留已有配音和音乐。AI 制作使用当前 Codex 账户额度。</p>}
    {p.kind==='science'&&!needsRedesign&&!playable&&!pending&&!issues.length&&<p className="muted">{isAuthoredProcess(p)?'按已采用的本地画面或内容模型渲染，合入现有配音与音乐，不调用生成服务。':'自动完成镜头设计与动画，再合入现有配音和音乐。AI 制作使用当前 Codex 账户额度。'}</p>}
    <details className="sample-options" open={p.kind==='product' && issues.length>0 ? true : undefined}><summary>更多设置{issues.length>0?' · 待完成制作条件':''}</summary>
      {!!issues.length&&(p.kind==='product'?<ul aria-label="生成样镜前待完成">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<IssueNotice area="样镜制作条件" error={issues.join('；')}/>)}
      {children}
    </details>
  </section>;
}

export function SamplePlayer({job,p,busy,dirty,request,updateJob,run,continueFilm,onProductReview,onRevision,autoPlay=true}) {
  const video=useRef(null);
  const diagnostics=useMediaDiagnostics(video,job.id);
  const [blocked,setBlocked]=useState(false),[mediaError,setMediaError]=useState(false);
  const [editing,setEditing]=useState(false),[note,setNote]=useState(job.review?.note||'');
  const [scope,setScope]=useState(job.review?.scope||'visual'),[revising,setRevising]=useState(false);
  const needsDirector=needsDirectorReview(p);
  const [checks,setChecks]=useState({actions:job.review?.actions||[],audioChecked:!!job.review?.audioChecked,styleChecked:!!job.review?.styleChecked,captionsChecked:!!job.review?.captionsChecked});
  const playback=useDirectorPlayback(job.evidence?.frames/p.fps||0,job.id,job.review?.watched||[]);
  const report=needsDirector?designReport(p,job.shotId):null;
  const canApprove=!needsDirector||!report.issues.length&&playback.complete&&report.requirements.every(r=>checks.actions.includes(r.id))&&checks.audioChecked&&checks.styleChecked&&checks.captionsChecked;
  const approved=job.review?.decision==='approved'&&(!needsDirector||!directorReviewIssues(p,job.shotId,job.review,job.evidence?.frames/p.fps).length);
  useEffect(()=>{
    let active=true;
    const player=video.current;
    if(autoPlay&&![...document.querySelectorAll('video,audio')].some(el=>el!==player&&!el.paused&&!el.ended))player.play().catch(()=>{if(active)setBlocked(true);});
    return ()=>{active=false;player.pause();};
  },[]);
  const productReview=p.kind==='product' && !!onProductReview;
  const pendingGate=productReview && p.flow==='review' && p.pauses.includes('样镜') && !p.passed.includes('样镜');
  const decide=decision=>run(async()=>{
    const changed=await request('/api/jobs/'+job.id+'/sample-review',{
      version:p.version,decision,scope,note:decision==='changes'?note:'',time:video.current?.currentTime||0,
      ...checks,watched:playback.watched,advance:productReview,
    });
    await updateJob(productReview?changed.job:changed);
    if(productReview)onProductReview(changed,decision);
    setEditing(false);
  });
  const revise=kind=>run(async()=>{
    setRevising(true);
    try {
      const result=await request('/api/jobs/'+job.id+'/revise',{version:p.version,scope:kind});
      await onRevision?.(result);
      await updateJob(await request('/api/jobs/'+job.id));
    }finally{setRevising(false);}
  });
  return <>
    <div className="sample-player-layout"><div className="sample-player-screen">
    <video ref={video} className="sample-video" controls playsInline preload="auto"
      aria-label="生成的样镜" src={job.output+'sample.mp4'}
      onPlay={e=>{setBlocked(false);document.querySelectorAll('video').forEach(v=>{if(v!==e.currentTarget)v.pause();});playback.observe(e);}}
      onTimeUpdate={playback.observe} onPause={playback.observe} onSeeking={playback.observe} onSeeked={playback.observe} onRateChange={playback.observe} onEnded={playback.observe}
      onError={()=>setMediaError(true)}/>
    {blocked&&!mediaError&&<button className="sample-play primary" onClick={()=>video.current.play().catch(()=>setBlocked(true))}>播放样镜</button>}
    {mediaError&&<IssueNotice area="样镜播放" error="视频未能载入，可能是文件不可用或浏览器播放失败。" onRetry={()=>{setMediaError(false);video.current?.load();}} retryLabel="重新载入视频"/>}
    <MediaDiagnostics read={diagnostics}/>
    </div><div className="sample-player-review">
    {p.kind==='science'&&!isAuthoredProcess(p)&&
      <StyleFrames p={p} focus={job.shotId} request={request}/>}
    {dirty&&<p className="hint">内容已修改，重新生成后再审核。</p>}
    {needsDirector&&<DirectorChecks {...{p,job,checks}} onChange={setChecks} watched={playback.watched} complete={playback.complete} disabled={busy||dirty}/>}
    <div className="sample-actions">
      <button className="primary" disabled={busy||dirty||mediaError||!canApprove||(approved&&!pendingGate)} onClick={()=>decide('approved')}>
        {approved&&!pendingGate?'已通过':productReview?'通过并继续':'通过'}
      </button>
      <button disabled={busy||dirty||mediaError} aria-expanded={editing} onClick={()=>{video.current?.pause();setEditing(!editing);}}>填写修改意见</button>
      {approved&&!dirty&&continueFilm&&<button onClick={continueFilm}>{p.kind==='science'?'查看视频':'继续整片制作'} →</button>}
    </div>
    {editing&&<div className="sample-feedback">
      <Select title="问题类型" value={scope} onChange={setScope} options={[["visual","画面主次、场景或动效"],["captions","字幕分句与排版"],["audio","音轨断裂、重复或混音"],["playback","网页播放中断或缓冲"]]}/>
      <label>修改意见<textarea autoFocus rows={3} maxLength={4000} value={note} onChange={e=>setNote(e.target.value)} placeholder="哪里需要调整？保存时会记录当前播放位置。"/></label>
      <p className="muted">{scope==='audio'?'记下异常句子与时间。在配音步骤试听原声；旧录音若插过停顿，可恢复原始配音，再按新时长制作画面。':scope==='playback'?'下载播放器下方的本次播放记录，记录卡顿位置。可同时试听配音，区分网页中断与文件本身的断裂。':scope==='captions'?'字幕修改保留动画、配音与音乐，使用短句分页；文字纠错请先修改口播或对应译文。':isModelProcess(p)?'保存意见后，在内容组件中调整数据、关系或风格，再保存并重新生成本段；沿用原配音和音乐。':'AI 按意见调整本段画面，沿用原配音和音乐，使用当前 Codex 账户额度。'}</p>
      <button disabled={busy||dirty||!note.trim()} onClick={()=>decide('changes')}>保存意见</button>
    </div>}
    {job.review?.decision==='changes'&&!editing&&<div className="sample-note"><p role="status">{job.revisionId?'修改已提交，完成后检查新版本':'意见已保存，待处理'} · 本段 {job.review.time.toFixed(1)} 秒：{job.review.note}</p>
      {job.review.scope==='audio'?<p>请在配音步骤核对原声与成片的同一句；恢复旧配音后，更新时序并重新制作这一段。</p>:job.review.scope==='playback'?<p>请下载本次播放记录。处理播放器问题后重新连续播放，并再次检查声音。</p>:isModelProcess(p)&&job.review.scope!=='captions'?<p>请在内容组件中调整数据、关系或风格，再保存并重新生成本段。</p>:<button className="primary" disabled={busy||dirty||revising||!!job.revisionId} onClick={()=>revise(job.review.scope||'visual')}>{job.review.scope==='captions'?'执行字幕修改':'让 AI 按意见修改本段画面'}</button>}</div>}
    {onRevision&&<div className="subtitle-revision"><button disabled={busy||dirty||revising||!!job.revisionId} onClick={()=>revise('captions')}>仅更新本段字幕</button><p className="muted">按短句显示并更新 SRT；保留当前动画、配音和音乐。完成后需重新检查字幕。</p></div>}
    </div></div>
  </>;
}

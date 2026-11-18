import React,{useState} from 'react';
import {Assets,Input,Select} from './fields';
import {timeline} from '../shared/model.mjs';
import {scienceSteps,scriptNeeds,scriptReady,proofsReady} from '../shared/science-flow.mjs';
import {KeynataLibrary} from './KeynataLibrary';
import {LemoLibrary} from './LemoLibrary';
import {referenceStyleStatus} from '../shared/visual-style.mjs';
import {VoiceOutputs} from './VoiceOutputs';
import {MaterialPlanner} from './MaterialPlanner';
import {ProofTaskStatus} from './ProofTaskStatus';
import {proofJobStatus} from '../shared/codex-status.mjs';
import {proofPlan} from '../shared/visual-continuity.mjs';
import {MotionArtwork} from '../video/MotionScene';
import {shotImagePlan} from '../shared/shot-images.mjs';
import {ReferenceMotion} from './ReferenceMotion';
import {referenceAnalysisNeeds} from '../shared/reference-motion.mjs';
import {phrasingParagraphs} from '../shared/automatic-workflow.mjs';
import {ScienceTaskReceipt} from './ScienceStepIssues';
import {ExplanationPlan} from './ExplanationPlan';
import {ContentTimeline} from './ContentWorkspace';
const descriptions={
  0:'写下本期问题，让 AI 联网找素材和出处，再挑选想用的结果。',
  4:'先用关键句把问题说清楚，删去重复铺垫，再选择音乐和配音。',
  5:'选定风格后，逐一分析参考视频的动效、节奏和镜头衔接。',
  1:'结合实际声音和参考分析，为每句讲解安排对象的前后变化。',
  6:'生成关键变化前、中、后的三张图，完成后自动用于样片。',
  2:'沿用当前图版制作连续动作，生成后即可预览和继续。',
  3:'沿用样片版本检查整片，完成审片与交付。',
};
export function StepIntro({tab}) {
  const i=scienceSteps.findIndex(([n])=>n===tab);
  return <section className="science-step"><small>科普制作　/　{String(i+1).padStart(2,'0')} OF 07</small>
    <h2>{scienceSteps[i]?.[1]}</h2><p>{descriptions[tab]}</p>
    {tab===5&&<button type="button" onClick={()=>document.getElementById('shot-image-analysis')?.scrollIntoView({block:'start'})}>查看图片参考</button>}</section>;
}
const time=n=>Number(n||0).toFixed(2)+' s';
export function ScienceStage({tab,p,set,sel,select,upload,run,request,saved,load,busy,dirty,refreshJobs,ai,review,tasks,openReferences,openSample,stageIssues=[],jobsAvailable,children}) {
  const f=p.scienceFlow||{};
  const change=patch=>set({scienceFlow:{...f,...patch}});
  const [source,sourceTo]=useState(f.analysis?.sourceId||'');
  const [start,startTo]=useState(f.analysis?.from||0),[end,endTo]=useState(f.analysis?.until||0);
  const [mix,mixTo]=useState(null);
  const audio=p.assets.filter(a=>a.kind==='audio');
  const a=audio.find(x=>x.id===source);
  const tl=timeline(p);
  const voice=p.shots.find(s=>s.id===sel);
  const paragraphs=tab===4?phrasingParagraphs(p):[];
  const recorded=paragraphs.filter(s=>s.recorded).length;
  const allRecorded=paragraphs.length>0&&recorded===paragraphs.length;
  const needs=scriptNeeds(p);
  const narrationTask=tasks.find(j=>j.task==='narration' && ['running','unknown'].includes(j.status));
  const proofTask=tasks.find(j=>j.task==='proofs');
  const rhythmTask=tasks.find(j=>j.task==='rhythm');
  const previewRhythm=['running','failed'].includes(rhythmTask?.status)&&rhythmTask.version===p.version&&rhythmTask.rhythmSource==='timeline'
    ? rhythmTask.result?.[0] : null;
  const taskBusy=task=>busy||tasks.some(j=>j.task===task&&['running','unknown'].includes(j.status));
  const referenceIssue=stageIssues.find(i=>i.job.task==='reference-motion');
  const referenceLink=referenceAnalysisNeeds(p).length>0&&<div className="reference-block"><p>{referenceIssue?referenceIssue.title+' · '+referenceIssue.label+'。'+referenceIssue.message:'参考视频尚缺通过校验的分析。'}</p><button type="button" onClick={openReferences}>查看参考视频分析 →</button></div>;
  const analyzingReferences=tasks.some(j=>j.task==='reference-motion'&&(['running','unknown'].includes(j.status)||j.status==='ready'&&j.version===p.version));
  if(p.productionMode==='model-process'&&![1,4,5].includes(tab))return <section className="panel"><h2>按内容模型本地制作</h2><p>图形、标签和数值由同一模型生成。配音保持原样，时长跟随当前时间线。请在分镜中核对来源与讲解顺序，随后生成样片；正式交付仍需完整看片与听音记录。</p>{tab===5&&<Assets {...{p,set,upload}}/>}</section>;
  if(p.productionMode==='local-process'&&tab!==5)return <>
    <section className="panel"><small>LOCAL SCIENCE</small><h2>Blender + Anatomy 本地制作</h2><p>在「分镜与本地画面」选择制作方式、机位和连续时间，生成后用于当前镜头。保留已有配音与字幕，背景音乐可选。</p><p className="muted">科学依据、素材来源和完整审片仍按原流程核验。现有场景：机械正弦绘图仪、简单立方晶格、肺泡交换示意、圆管层流；每项都有适用范围。</p><p className="muted">当前过程视频沿用所选场景的外观。本期视觉参考和全片风格不会自动改变它的颜色、材质或镜头；自定义外观需要适配后重新生成，再核对与其他段落的衔接。</p>
    {(f.style||f.template||f.lemoStyleId||f.referenceVideoUrls)&&<details><summary>查看保留的本期视觉参考</summary><p>{f.style}</p><p>{f.template}</p><p>{f.lemoStyleId}</p><p>{f.referenceVideoUrls}</p><p className="muted">参考已保留，尚不能据此认定当前过程视频已适配。</p></details>}</section>
    {tab===4&&<><section className="panel"><h2>本期口播稿</h2><Input area title="口播稿" value={p.script} onChange={script=>set({script})}/><Select title="当前配音段" value={sel} options={p.shots.map(s=>[s.id,s.title])} onChange={select}/></section>{children}</>}
    {tab===5&&<Assets {...{p,set,upload}}/>}
  </>;
  const post=async(route,extra)=>{
    const q=await saved();
    return request('/api/projects/'+q.id+'/'+route,{version:q.version,...extra});
  };
  if(tab===4) return <>
    <nav className="narration-steps" aria-label="口播制作顺序">
      {[["narration-workspace","1. 确认口播"],["music-workspace","2. 背景音乐"],["voice-workspace","3. 音色与配音"],["caption-workspace","4. 字幕设置"]].map(([id,title])=>
        <button type="button" key={id} onClick={()=>document.getElementById(id)?.scrollIntoView({block:'start'})}>{title}</button>)}
    </nav>
    <section className="panel voice-preparation" id="narration-workspace" aria-label="确认口播"><h2>1. 确认口播</h2>
      <p className="muted">只保留讲清事情的关键句，同时保留必要因果、前提和限定。确认原稿后，再选择背景音乐、语种和音色。</p>
      <Input area rows={10} title="本期口播稿" aria-label="本期口播稿" value={p.script} disabled={busy} onChange={script=>set({script})}/>
      <p className="muted">当前 {p.script.split(/\n+/).filter(t=>t.trim()).length} 个语意段。每段单独配音；修改某段文字会更新该段录音与依赖它的时间安排，未改段落保留。</p>
      <div className="inline"><button disabled={busy||!!narrationTask||!p.claims.some(c=>c.verified)} onClick={()=>ai('narration')}>{narrationTask?.status==='running'?'口播生成中…':'AI 起草口播'}</button>
        <button className="primary" disabled={busy||!!narrationTask||!p.script.trim()} onClick={()=>run(async()=>{
          await saved();document.getElementById('music-workspace')?.scrollIntoView({block:'start'});
        })}>确认口播，选择背景音乐</button></div>
      <p className="muted">点击即开始生成，完成后自动填入并保存，无需再点采用。使用本机已登录的 Codex，可能占用 ChatGPT 订阅额度。</p>
      <ScienceTaskReceipt job={tasks.find(j=>j.task==='narration')} version={p.version}/>
      {!p.claims.some(c=>c.verified)&&<p className="muted">先到「选题与资料」核实依据，再起草口播。</p>}
    </section>
    <section className="panel voice-preparation" id="music-workspace" aria-label="背景音乐"><h2>2. 背景音乐</h2>
      <p className="muted">{f.analysis?'已采用：'+(p.assets.find(v=>v.id===f.bgmId)?.name||'当前背景音乐'):'选择 BGM 并分析节奏，配音会参考实际音乐的停顿和变化。'}</p>
      <details open={!f.analysis}><summary>{f.analysis?'查看或更换背景音乐':'选择背景音乐'}</summary>
      <KeynataLibrary {...{request,run,busy}} autoScroll={false} current={audio.find(v=>v.id===f.analysis?.sourceId)?.keynataId}
        adopt={async trackId=>{
          const next=await post('keynata',{trackId}), analysis=next.scienceFlow.analysis;
          load(next);sourceTo(analysis.sourceId);startTo(analysis.from);endTo(analysis.until);mixTo(null);
        }}/>
      <label className="upload">上传音乐<input type="file" accept="audio/*" aria-label="上传音乐" onChange={e=>{const fs=[...e.target.files];e.target.value='';upload(fs);}}/></label>
      <Select title="音乐文件" value={source} options={[['','选择项目中的音频'],...audio.map(v=>[v.id,v.name])]} onChange={id=>{sourceTo(id);startTo(0);endTo(audio.find(v=>v.id===id)?.duration||0);}}/>
      {a&&<audio controls src={a.src}/>}
      <div className="grid2"><Input type="number" step=".01" min="0" title="原曲入点（秒）" value={start} onChange={startTo}/>
        <Input type="number" step=".01" min="0" title="原曲出点（秒）" value={end} onChange={endTo}/></div>
      <button disabled={busy||!a||end<=start||end>a.duration+.01} onClick={()=>run(async()=>load(await post('bgm',{id:source,from:start,until:end})))}>采用选段并分析节奏</button>
      {f.analysis&&<div className="detail"><b>已采用 · {p.assets.find(v=>v.id===f.bgmId)?.name}</b>
        <p>原曲 {time(f.analysis.from)} 至 {time(f.analysis.until)}，以下时间从选段起点算起。</p>
        {f.analysis.rhythm&&<p className="muted">已识别 {f.analysis.rhythm.onsets.length} 个音乐起音点。{f.analysis.rhythm.tempoBpm?`估计速度 ${f.analysis.rhythm.tempoBpm} BPM，动作仍优先跟随旁白。`:'节拍不稳定，动作按旁白与实际强弱变化安排。'}</p>}
        <div className="beat-marks">{f.analysis.marks.map(m=><span key={m.time}>{time(m.time)}　{m.change}</span>)}</div>
        </div>}
      </details>
      {f.analysis&&<div className="music-next-action"><button disabled={taskBusy('phrasing')||!p.script.trim()||allRecorded} onClick={()=>ai('phrasing')}>{tasks.some(j=>j.task==='phrasing'&&j.status==='running')?'正在调整口播断句…':allRecorded?'全部段落已配音':recorded?'AI 调整未配音段落的断句':'AI 按音乐调整口播断句'}</button>
        <p className="muted">{recorded?`已配音的 ${recorded} 段保留录音稿和字幕时间。`:''}{allRecorded?'':`可按音乐调整 ${paragraphs.length-recorded} 个未配音段落的停顿，完成后自动保存。`}</p></div>}
      {f.analysis&&<button type="button" onClick={()=>document.getElementById('voice-workspace')?.scrollIntoView({block:'start'})}>继续选择音色与配音</button>}
      <ScienceTaskReceipt job={tasks.find(j=>j.task==='phrasing')} version={p.version}/>
    </section>
    <section className="panel voice-workspace" id="voice-workspace" aria-label="音色与配音"><h2>3. 音色与配音</h2>
      <p className="muted">选择中文使用中文原稿；选择英语会自动翻译口播，再选择音色并生成。</p>
      {children}
      {!voice&&<p>先在上方写入或生成口播稿，配音段落会自动出现。</p>}
    </section>
    <section className="panel"><h2>段落配音与合听结果</h2>
      <p className="muted">配音段落跟随口播稿同步。在这里查看各段录音与完整旁白。</p>
      {p.shots.length>0&&<Select title="当前口播段" value={sel} disabled={busy} options={p.shots.map((s,i)=>[s.id,'第 '+(i+1)+' 段 · '+(s[p.voice]||s.zh).slice(0,24)])} onChange={select}/>}
      {voice&&<Input area title="本段配音台词" aria-label="本段配音台词" readOnly value={voice[p.voice]||''}/>}
      {!voice&&<p>先在上方写入或生成本期口播稿，配音段会自动出现。</p>}
      <div className="voice-single-mix"><button disabled={busy||!voice||!f.analysis} onClick={()=>run(async()=>{
        const result=await post('mix',{shotId:sel});mixTo({key:JSON.stringify([sel,voice,f.bgmId]),src:result.src});
      })}>生成本段合听</button>
      {mix?.key===JSON.stringify([sel,voice,f.bgmId])&&<audio controls aria-label="本段与 BGM 合听" src={mix.src}/>}</div>
      <VoiceOutputs {...{p,select,busy,saved,request,load,run}} issues={stageIssues.filter(i=>i.job.type==='voice')}/>
    </section></>;
  if(tab===5) return <><LemoLibrary selected={f.lemoStyleId} busy={busy} choose={id=>run(()=>saved({...p,scienceFlow:{...f,lemoStyleId:id}}))}/>
    <section className="panel"><small>ART DIRECTION</small><h2>本期视觉参考</h2>
    <p role="status">{referenceStyleStatus(p).source==='reference'?`全片以这里选择的风格参考为准。${referenceStyleStatus(p).message}`:'尚未选择参考，使用默认风格；可以直接继续制作。'}</p>
    {f.lemoStyleId&&<button type="button" disabled={busy} onClick={()=>change({lemoStyleId:''})}>取消当前样片风格</button>}
    <Input title="视觉风格" placeholder="例如：深色背景、青蓝色粒子、近距离跟拍" value={f.style} onChange={style=>change({style})}/>
    <Input area title="参考模板、链接或文件名，以及要参考的部分" value={f.template} onChange={template=>change({template})}/>
    <Input area title="参考视频链接（每行一个 MP4 / WebM 直链）" value={f.referenceVideoUrls||''} onChange={referenceVideoUrls=>change({referenceVideoUrls})}/>
    <p className="muted">这些参考用于 AI 素材分析、分镜、图版与动画。下方可补充图片并核对来源；更改参考后，需要更新受影响的画面并重新审片。</p>
    <p className="muted">本地内容模型在参考解析后采用同一视觉方案；已有图片、Blender 过程视频和生成式视频保留原外观，需另外适配后重新制作。科学结构、数据与单位始终保留依据。</p>
    <MaterialPlanner {...{p,ai,tasks,busy,dirty,run,request,load,saved,refreshJobs,sel,select,openSample}}/>
    </section><ReferenceMotion {...{p,tasks,busy,ai,jobsAvailable}}
     decide={choice=>run(async()=>load(await post('reference-review',choice)))}/><Assets {...{p,set,upload}}/></>;
  if(tab===1) return <section id="rhythm-script" className="panel"><small>RHYTHM SCRIPT</small><h2>节奏脚本</h2>
    <ContentTimeline p={p}/>
    <details><summary>口播时间轴与完整动作脚本</summary>
    {tl.rows.map(r=><div className="timing-row" key={r.shot.id}><b>{time(r.from/p.fps)} — {time((r.from+r.frames)/p.fps)}</b><span>{r.shot[p.voice]}</span><small>{r.shot.visual}</small></div>)}
    {previewRhythm&&!f.rhythm ? <Input area readOnly title={rhythmTask.status==='running'?'本地时间轴稿（AI 脚本生成中）':'保留的时间轴草稿（尚未采用）'} value={previewRhythm}/> :
      <Input area title="带时间码的节奏脚本" value={f.rhythm} onChange={rhythm=>change({rhythm,scriptVersion:null,proofVersion:null})}/>}
    </details>
    {previewRhythm&&f.rhythm&&<details><summary>查看本次生成的本地时间轴稿</summary><p className="result-prose">{previewRhythm}</p></details>}
    <div className="inline"><button disabled={!jobsAvailable||taskBusy('rhythm')||analyzingReferences||(p.productionMode!='model-process'&&!f.analysis)||!p.shots.length||referenceAnalysisNeeds(p).length>0} onClick={()=>ai('rhythm')}>{rhythmTask?.status==='running'?'正在读取参考分析与动效库、编写脚本…':'读取参考分析与动效库，编写脚本'}</button></div>
    {!stageIssues.some(i=>i.job.id===rhythmTask?.id)&&<ScienceTaskReceipt job={rhythmTask} version={p.version} p={p}/>}
    <ExplanationPlan p={p} details/>
    {!!f.referenceScript?.decisions?.length&&<details><summary>参考适用判断</summary>{f.referenceScript.decisions.map(d=><p key={d.referenceId}><b>{f.referenceMotion?.find(r=>r.referenceId===d.referenceId)?.name||d.referenceId} · {d.status==='applied'?'已借鉴':'不适用'}</b>：{d.reason}</p>)}</details>}
    {referenceLink}
    {f.referenceScript?.applications?.length>0&&<details><summary>脚本如何借鉴参考视频</summary>{f.referenceScript.applications.map((a,i)=><p key={i}>参考 {f.referenceMotion?.find(r=>r.referenceId===a.referenceId)?.name||a.referenceId} {time(a.from)}–{time(a.until)} → 本片 {time(a.scriptFrom)}–{time(a.scriptUntil)}：{a.adaptation}{a.customMotion&&' 新动效：'+a.customMotion}</p>)}</details>}
    {scriptReady(p)&&<p role="status">脚本与配音资料已齐备，可直接生成效果图。</p>}
    {!!needs.length&&<p className="hint">{needs.join(' · ')}</p>}</section>;
  if(tab===6)return <section className="panel"><small>VISUAL PROOFS</small><h2>三张效果图</h2>
    {!proofsReady(p)&&f.proofs?.length>0&&<p className="hint">下面是历史效果图；上游输入已变化，不能作为当前版本完成凭据。</p>}
    {!!f.artifactHistory?.length&&<details><summary>保留的历史图版（{f.artifactHistory.length} 组）</summary>{f.artifactHistory.map((h,i)=><p key={i}>版本 {h.version} · {h.proofs.length} 张 · {h.reason}</p>)}</details>}
    <p>{scriptReady(p)?'按当前脚本和成片画幅生成，完成后自动用于样片。':'请先补齐节奏脚本、配音、音乐与视觉参考。'}</p>
    {referenceLink}
    <ProofTaskStatus job={proofTask} version={p.version} retained={!!f.proofs?.length}/>
    <div className="science-proofs">{(f.proofs||[null,null,null]).map((frame,i)=><figure key={i}>
      {frame?.imageAssetId&&p.assets.some(a=>a.id===frame.imageAssetId&&a.kind==='image')?<img alt={'效果图 '+(i+1)+'，'+frame.caption} src={p.assets.find(a=>a.id===frame.imageAssetId).src} style={{width:'100%',aspectRatio:p.width+'/'+p.height,objectFit:'contain'}}/>:frame?.scene?<div style={{position:'relative',aspectRatio:p.width+'/'+p.height,background:'#02070e',overflow:'hidden',borderRadius:8}}><div style={{position:'absolute',inset:0}}><MotionArtwork plan={shotImagePlan(proofPlan(frame),tl.rows.find(r=>frame.time>=r.from/p.fps&&frame.time<(r.from+r.frames)/p.fps)?.shot.imageBindings)} assets={p.assets} label={'效果图 '+(i+1)+'，'+frame.caption}/></div></div>:frame?<svg role="img" aria-label={'效果图 '+(i+1)+'，'+frame.caption} viewBox={'0 0 '+p.width+' '+p.height} style={{background:frame.bg}}>{frame.paths.map((path,i)=><path key={i} {...path}/>)}</svg>:
        <div className="proof-empty" style={{aspectRatio:p.width+'/'+p.height}}>{proofJobStatus(proofTask,p.version).label}</div>}
      <figcaption><b>{['变化前','关键变化','变化后'][i]}</b>{frame&&<><small>{time(frame.time)}</small><p>{frame.caption}</p></>}</figcaption>
      <Input title={'图 '+(i+1)+' 修改意见'} value={(f.feedback||'').split('\n')[i]} onChange={v=>{const notes=[0,1,2].map(j=>(f.feedback||'').split('\n')[j]||'');notes[i]=v;change({feedback:notes.join('\n'),proofVersion:null});}}/>
      </figure>)}</div>
    <div className="inline"><button disabled={taskBusy('proofs')||!scriptReady(p)} onClick={()=>ai('proofs')}>{tasks.some(j=>j.task==='proofs'&&j.status==='running')?'正在生成效果图…':f.proofs?'按意见重新生成':'生成三张效果图'}</button></div>
    {proofsReady(p)&&<p role="status">效果图已自动用于当前流程，可直接制作样片。</p>}</section>;
  return null;
}

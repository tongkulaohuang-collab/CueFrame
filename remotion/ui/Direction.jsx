import {isAuthoredProcess} from '../shared/production-mode.mjs';
import {IssueNotice} from './IssueNotice';
import React, { useEffect, useRef, useState } from "react";
import {flushSync} from 'react-dom';
import { Thumbnail } from "@remotion/player";
import { ShotScene } from "../video/Scene";
import {
  beatLabels,
  views,
  proofFrames,
  approvalKey,
  castingChoice,
  linesFor,
  validStarts,
} from "../shared/direction.mjs";
import { Input, Select, Check, StoryboardButton } from "./fields";
import { DoubaoCasting } from "./DoubaoCasting";
import {VoiceBatchAction} from './VoiceBatchAction';
import {generateVoiceBatch,voiceBatchInput} from './voice-batch.mjs';
import { continuityFields } from '../shared/continuous-direction.mjs';
import {LocalProcess} from './LocalProcess';
import {removeNarration} from '../shared/assets.mjs';
import {translationSegments} from '../shared/narration-language.mjs';
import {voiceStatus,voiceProvider} from '../shared/voice-status.mjs';
import {VoiceAlignmentPanel} from './QualityWorkbench';
import {displayCaptions} from '../shared/overlays.mjs';
const phaseNames = ["开场", "动作", "结果"];
export function DirectionEditor({ p, s, set, scene, storyboard }) {
  const update = (attrs) =>
    set({
      shots: p.shots.map((x) =>
        x.id === s.id ? { ...x, ...attrs, reviewed: false } : x,
      ),
    });
  const titles = beatLabels(s, p.kind),
    sources = s.beatSources || ["", "", ""],
    crops = s.beatViews || ["全图", "全图", "全图"];
  const assign = (arr, i, v) => arr.map((x, j) => (j === i ? v : x)),
    images = p.assets.filter(
      (a) =>
        s.assetIds.includes(a.id) &&
        a.role === "product" &&
        ["image", "video"].includes(a.kind),
    );
  if(p.kind==='science') return <section className="panel">
    <header>
      <div><small>CONTINUOUS ACTION</small><h2>连续镜头设计</h2></div>
      <StoryboardButton storyboard={storyboard} shotId={s.id}/>
    </header>
    {s.storyboardBasis && <details className="storyboard-basis">
      <summary>查看本镜生成依据</summary>
      <p><b>节奏脚本第 {s.storyboardBasis.scriptLine} 行</b>　{s.storyboardBasis.text}</p>
      <p><b>{s.storyboardBasis.name} · {Number(s.storyboardBasis.from).toFixed(2)}–{Number(s.storyboardBasis.until).toFixed(2)} 秒</b>　{s.storyboardBasis.adaptation}</p>
    </details>}
    <p className="muted">主过程占主画面。物理过程写完整路径，数据与概念写状态变化；固定构图、标题或卡片按内容需要使用。工程标题与节拍不自动上画。</p>
    {Object.entries(continuityFields).map(([key,label])=><Input key={key} area title={label} value={s.continuity?.[key]||''} onChange={v=>update({continuity:{...s.continuity,[key]:v}})}/>)}
    {p.productionMode==='model-process'?<p className="muted">本段画面由已采用的内容模型本地生成，可在上方连续预览。</p>:<><Select title="连续过程视频" value={s.processVideoId||''} options={[["","选择本镜的连续动画"],...p.assets.filter(a=>a.kind==='video').map(a=>[a.id,a.name])]} onChange={id=>update({processVideoId:id,processOffset:0,assetIds:[...new Set([...s.assetIds,...(id?[id]:[])])]})}/>
    <Input type="number" min="0" step="0.01" title="视频起点（秒，与前段衔接）" value={s.processOffset||0} onChange={v=>update({processOffset:v})}/>
    <LocalProcess p={p} s={s} set={set}/></>}
    <SubtitleSettings p={p} set={set}/>
    <AnnotationEditor s={s} update={update}/>
  </section>;
  return (
    <section className="panel">
      <small>SHOT DIRECTION</small>
      <h2>镜头节拍</h2>
      <SubtitleSettings p={p} set={set}/>
      <Select
        title="画面方案"
        value={p.look || "classic"}
        options={[
          [
            "directed",
            p.kind === "science"
              ? "逐步揭示 · 科学图解"
              : "操作特写 · 产品宣传",
          ],
          ["classic", "经典样镜"],
        ]}
        onChange={(look) => set({ look })}
      />
      {p.look === "directed" && (
        <>
          <p className="muted">
            每拍写清一个可见变化。标题会上画，真实素材和科学结论仍需逐镜核对。
          </p>
          <div className="beatgrid">
            {phaseNames.map((name, i) => (
              <div key={name}>
                <small>
                  0{i + 1} · {name}
                </small>
                <Input
                  title={name + "画面标题"}
                  value={s.beats?.[i] ?? titles[i]}
                  onChange={(v) => update({ beats: assign(titles, i, v) })}
                />
                {p.kind === "product" && (
                  <>
                    <Select
                      title={name + "素材"}
                      value={sources[i]}
                      options={[
                        ["", "按关联素材顺序"],
                        ...images.map((a) => [a.id, a.name]),
                      ]}
                      onChange={(v) =>
                        update({
                          beatSources: assign(sources, i, v),
                          beatOffsets: assign(s.beatOffsets || [0, 0, 0], i, 0),
                        })
                      }
                    />
                    <Select
                      title={name + "取景"}
                      value={crops[i]}
                      options={views}
                      onChange={(v) =>
                        update({ beatViews: assign(crops, i, v) })
                      }
                    />
                    {(
                      images.find((a) => a.id === sources[i]) ||
                      images[Math.min(i, images.length - 1)]
                    )?.kind === "video" && (
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        title="视频起播秒数"
                        value={s.beatOffsets?.[i] || 0}
                        onChange={(v) =>
                          update({
                            beatOffsets: assign(
                              s.beatOffsets || [0, 0, 0],
                              i,
                              v,
                            ),
                          })
                        }
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <Select
            title="无实测语句时的节奏"
            value={s.pace || "明快"}
            options={["明快", "舒展"]}
            onChange={(pace) => update({ pace })}
          />
          {scene && <details className="detail"><summary>预览三拍画面与旁白时间</summary>
            <BeatPreview scene={scene} phone={true}/>
          </details>}
        </>
      )}
    </section>
  );
}
function SubtitleSettings({p,set,changeCaptionMode,translationTask,busy}) {
  return <>
    <Check text="显示底部小号字幕（另附 SRT）" checked={p.burnCaptions===true} onChange={v=>set({burnCaptions:v})}/>
    {p.burnCaptions && <Select title="字幕语言" disabled={busy} value={p.captionMode||'voice'} options={[["voice","跟随当前旁白"],["bilingual","中英双字幕"]]} onChange={captionMode=>changeCaptionMode?changeCaptionMode(captionMode):set({captionMode})}/>}
    {p.captionMode==='bilingual'&&translationSegments(p).length>0&&<p role="status">{translationTask?.status==='running'?'正在准备英文字幕，中文配音保持不变…':translationTask?.status==='unknown'?'字幕译文结果待核对，请查询原任务。':'中英双字幕还缺少英文译文。'} <button disabled={busy||!!translationTask} onClick={()=>changeCaptionMode?.('bilingual')}>补齐英文字幕</button></p>}
    <Select title="字幕分句" value={p.captionLayout||'original'} options={[["short","短句显示（推荐）"],["original","沿用原字幕段落"]]} onChange={captionLayout=>set({captionLayout,shots:p.shots.map(s=>({...s,captionLayout}))})}/>
    <p className="muted">底部安全区与 SRT 使用同一分句。有实测句界时保留句界；缺少字级时间时，句内短句按阅读长度估算。修改字幕后在视频预览中更新字幕即可。</p>
    <p className="muted">选择中英双字幕会自动补齐缺失的英文译文，使用当前 Codex 账户额度，不切换当前配音语种。</p>
  </>;
}
function AnnotationEditor({s,update}) {
  const notes=s.annotations||[];
  const edit=(i,patch)=>update({annotations:notes.map((a,j)=>j===i?{...a,...patch}:a)});
  return <details><summary>关键节点注释 · {notes.length} 条</summary>
    {notes.map((a,i)=><div className="panel" key={a.id||i}>
      <Input title={`注释 ${i+1}（短语，最多24字）`} value={a.text} onChange={text=>edit(i,{text})}/>
      <div className="row"><Input type="number" min="0" step="0.1" title="出现（秒）" value={a.from} onChange={from=>edit(i,{from})}/>
      <Input type="number" min="0" step="0.1" title="消失（秒）" value={a.until} onChange={until=>edit(i,{until})}/></div>
      {a.points?.length ? <p className="muted">注释随对象运动轨迹定位。</p> : <div className="row">
        <Input type="number" min="0" max="1" step="0.01" title="对象横向位置（0–1）" value={a.x} onChange={x=>edit(i,{x})}/>
        <Input type="number" min="0" max="0.82" step="0.01" title="对象纵向位置（0–0.82）" value={a.y} onChange={y=>edit(i,{y})}/>
      </div>}
      <button onClick={()=>update({annotations:notes.filter((_,j)=>j!==i)})}>移除注释 {i+1}</button>
    </div>)}
    <button onClick={()=>update({annotations:[...notes,{id:crypto.randomUUID(),text:'',from:0,until:Math.min(3,s.seconds),x:.5,y:.4}]})}>添加节点注释</button>
  </details>;
}
export function Casting({ p, s, saved, run, request, load, busy, set, tasks=[], changeVoiceLanguage,changeCaptionMode }) {
  const live=useRef(null), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("view") === "casting")
      document.getElementById("voice-casting")?.scrollIntoView();
  }, []);
  const lang=p.voice;
  const needsTranslation=lang==='en'&&translationSegments(p).length>0;
  const translationTask=tasks.find(j=>j.task==='translation'&&['running','unknown'].includes(j.status));
  const lastTranslation=tasks.find(j=>j.task==='translation'&&(p.kind==='science'||j.status==='failed'));
  const translationFailed=lastTranslation?.status==='failed'?lastTranslation:null;
  const [provider, setProvider] = useState(()=>voiceProvider(p,localStorage.getItem('frameboard:provider:'+p.id))),
    [cast, C] = useState(null),
    [pending, W] = useState(false),
    [marks, M] = useState("");
  const [batchProgress,setBatchProgress]=useState(null);
  const availability=voiceStatus(p,lang);
  const chooseProvider=value=>{localStorage.setItem('frameboard:provider:'+p.id,value);setProvider(value);setBatchProgress(null);};
  const musicMissing=p.kind==='science'&&!isAuthoredProcess(p)&&!p.scienceFlow?.analysis;
  live.current={p,s,lang,load};
  const edit = (attrs) =>
    set({
      shots: p.shots.map((x) => (x.id === s.id ? { ...x, ...attrs } : x)),
    });
  const post = (q, route) =>
    request("/api/projects/" + q.id + "/" + route, {
      version: q.version,
      shotId: s.id,
      lang,
    });
  const matches =
    cast?.id === s.id && cast.lang === lang && cast.text === s[lang];
  const chosen = p.assets.find(
    (a) => s.assetIds.includes(a.id) && a.role === lang,
  );
  const precise = chosen && s.subtitleTracks?.[lang]?.assetId === chosen.id &&
    s.subtitleTracks[lang].text === s[lang];
  async function removeCurrentVoice() {
    const q=await saved();
    load(await request('/api/projects',removeNarration(q,[s.id],[lang])));
    C(null);
  }
  async function restoreOriginalVoice() {
    const q=await saved();
    load(await request('/api/projects/'+q.id+'/doubao',{
      action:'restoreOriginal',version:q.version,shotId:s.id,lang,assetId:chosen.id,
    }));
    C(null);
  }
  async function compare() {
    W(true);
    try {
      const q = await saved();
      const candidates = await post(q, "audition");
      C({
        id: s.id,
        lang,
        text: q.shots.find((x) => x.id === s.id)[lang],
        candidates,
      });
      if (q.kind==='science' && candidates[0] && mounted.current && live.current.p.id===q.id &&
        live.current.s.id===s.id && live.current.lang===lang && voiceBatchInput(live.current.p,lang)===voiceBatchInput(q,lang)) {
        const next=await request('/api/projects',castingChoice(q,s.id,candidates[0]));
        if(mounted.current&&live.current.p.id===q.id)live.current.load(next);
      }
    } finally {
      W(false);
    }
  }
  async function adopt(a) {
    const q = await saved();
    load(await request("/api/projects", castingChoice(q, s.id, a)));
  }
  async function generateAllLocal(regenerate=false) {
    const q=await saved();
    try {
      await generateVoiceBatch({project:q,ids:q.shots.map(s=>s.id),lang,speaker:'local:'+lang+':'+(lang==='zh'?3:0),
        skipExisting:!regenerate,
        isCurrent:expected=>mounted.current&&voiceBatchInput(live.current.p,lang)===voiceBatchInput(expected,lang),
        onSaved:next=>flushSync(()=>live.current.load(next)),onProgress:setBatchProgress,
        synthesize:async(project,shot)=>{
          const candidates=await request('/api/projects/'+project.id+'/audition',{version:project.version,shotId:shot.id,lang});
          if(!candidates[0])throw Error('本段没有返回有效音频');return candidates[0];
        },adopt:(project,shot,a)=>request('/api/projects',castingChoice(project,shot.id,a)),
      });
    }catch(e){setBatchProgress(v=>v?{...v,text:'已暂停：'+e.message}:null);throw e;}
  }
  async function score() {
    const q = await saved(),
      a = await post(q, "score");
    const old = q.assets.filter((x) => x.role === "music").map((x) => x.id);
    load(
      await request("/api/projects", {
        ...q,
        assets: [...q.assets, a],
        shots: q.shots.map((x) =>
          x.id === s.id
            ? {
                ...x,
                assetIds: [
                  ...x.assetIds.filter((id) => !old.includes(id)),
                  a.id,
                ],
              }
            : x,
        ),
      }),
    );
  }
  return (
    <section className="panel" id="voice-casting">
      <VoiceAlignmentPanel {...{p,s,lang,chosen,saved,request,load,run,busy}}/>
      <Select title="配音语种" value={lang} disabled={busy} options={[["zh","中文"],["en","英语"]]}
        onChange={value=>changeVoiceLanguage?changeVoiceLanguage(value):set({voice:value})}/>
      <p className="muted">英语会按中文原稿逐段翻译并保存，切回中文保留原稿。翻译使用本机已登录的 Codex，可能占用订阅额度；选择语种不会提交配音。</p>
      {lang==='en'&&<div className="narration-translation" aria-label="英文口播">
        {needsTranslation?<><p role="status">{translationTask?.status==='running'?'正在逐段翻译英文口播，完成后自动保存…':translationTask?.status==='unknown'?'上次英文翻译状态待核对，请在任务记录中核对；不会自动重发。':'中文口播已有更新或尚无译文，请先准备对应英文。'}</p>
          {translationFailed&&!translationTask&&<IssueNotice area="英文口播翻译" job={translationFailed} error={translationFailed.error}/>}
          {translationTask?.status==='unknown'&&<IssueNotice area="英文口播翻译" job={translationTask} error={translationTask.error||'上次英文翻译状态待核对。'}/>}
          <button disabled={busy||!!translationTask} onClick={()=>changeVoiceLanguage?.('en')}>翻译英文口播</button></>:
          <><p role="status">英文口播已就绪，配音将使用以下英文。</p><Input area title="英文口播（自动翻译）" readOnly value={p.shots.map(s=>s.en).join('\n\n')}/></>}
      </div>}
      {provider==='local'&&p.kind==='science'&&<VoiceBatchAction count={p.shots.length} available={availability.done} progress={batchProgress}
        onRegenerate={()=>run(()=>generateAllLocal(true))}
        onRemove={()=>run(async()=>{const q=await saved();load(await request('/api/projects',removeNarration(q,q.shots.map(s=>s.id))));C(null);setBatchProgress({done:0,total:q.shots.length,text:'已删除全部配音，可重新生成。'});})}
        removeDisabled={busy||!p.shots.some(s=>s.assetIds.some(id=>p.assets.some(a=>a.id===id&&['zh','en'].includes(a.role))))}
        disabled={busy||needsTranslation||musicMissing||p.shots.some(s=>!s[lang]?.trim())} onClick={()=>run(()=>generateAllLocal())}/>}
      {p.kind!=='science'&&<><small>VOICE CASTING</small><h2>同台词试听</h2>
      <p>
        {p.kind==='science'?'生成后自动用于本段，工作台按实际旁白时长安排镜头。仍可试听并切换其他声音。':'豆包配音生成后自动用于本段；本机配音可试听两种读法后选择。工作台按实际旁白时长安排镜头。'}
      </p></>}
      <details className="voice-provider-settings" open={p.kind!=='science'}><summary>配音来源：{provider==='doubao'?'豆包语音':'本机离线配音'} · {lang==='zh'?'中文':'English'}</summary>
      <div className="inline">
        <Select title="配音来源" value={provider} disabled={busy} onChange={chooseProvider}
          options={[["doubao", "豆包语音"], ["local", "本机离线配音"]]}/>
        {provider === "local" && <button
          disabled={busy || needsTranslation || musicMissing || !s[lang]?.trim()}
          onClick={() => run(compare)}
        >
          {pending ? "本机正在配音…" : p.kind==='science'?'生成本机配音':'生成两种读法'}
        </button>}
      </div>
      </details>
      {provider === "doubao" && <DoubaoCasting key={p.id + "/" + s.id + "/" + lang}
        {...{p, s, lang, saved, request, run, load, chosen,changeVoiceLanguage,busy}} translationPending={needsTranslation}/>}
      <div id="caption-workspace" className="caption-settings" aria-label="字幕设置"><h3>4. 字幕设置</h3><SubtitleSettings {...{p,set,changeCaptionMode,translationTask,busy}}/></div>
      {p.kind==='science'&&p.burnCaptions&&p.captionMode==='bilingual'&&translationSegments(p).length>0&&translationFailed&&<IssueNotice area="英文字幕翻译" job={translationFailed} error={translationFailed.error}/>}
      {chosen&&<div className="voice-current">
        <strong>本段正在使用：{chosen.voiceLabel||chosen.name}</strong>
        <audio controls preload="none" src={chosen.src} aria-label="当前段落配音试听"/>
        {chosen.doubaoRequestId&&['sentence-pauses','paragraph-entry'].includes(chosen.voiceMusic?.mode)&&<div>
          <button type="button" disabled={busy} onClick={()=>run(restoreOriginalVoice)}>恢复本段原始配音</button>
          <p className="muted">使用本机保留的原始录音，恢复真实字幕时间，不重新生成或扣费。旧录音与版本保留；恢复后需更新节奏与画面，再听审。</p>
        </div>}
        <button type="button" className="voice-remove" disabled={busy} onClick={()=>run(removeCurrentVoice)}>删除本段配音</button>
        <small className="muted">删除后可重新生成。历史录音保留，可从配音记录恢复。</small>
      </div>}
      {provider === "local" && matches && (
        <div className="castgrid">
          {cast.candidates.map((a) => (
            <div key={a.id}>
              <b>{a.voiceLabel}</b> · {a.duration.toFixed(2)} 秒
              <audio controls preload="none" src={a.src} />
              <button
                disabled={busy || chosen?.id === a.id}
                onClick={() => run(() => adopt(a))}
              >
                {chosen?.id === a.id ? "本段正在使用" : "切换到此读法"}
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        {chosen
          ? "本镜声音 · " +
            (chosen.voiceLabel || chosen.name) +
            (precise ? (s.subtitleTracks?.[lang]?.alignmentReceipt?' · '+s.subtitleTracks[lang].timing:" · 精确字幕起止") : s.manualTiming?.[lang]?.assetId === chosen.id &&
            s.manualTiming[lang].text === s[lang]
              ? " · 人工语句标记"
              : chosen.segments
                ? " · 按句实测"
                : " · 字幕时点估算")
          : "也可以在素材库上传自己的录音并关联到本镜。"}
      </p>
      {chosen?.voiceMusic&&<p className="muted">{chosen.voiceMusic.mode==='preserve-speech'?'保留原始语音与句段时间，画面跟随讲解；更换背景音乐无需重新配音。':chosen.voiceMusic.mode==='sentence-pauses'?'这份历史录音曾按音乐插入停顿，请先试听；可尝试恢复本机保留的原始录音。':'这份历史录音曾调整段落入点；缺少逐句时间时不生成精确逐句标记。'}</p>}
      {chosen && !chosen.segments && !precise && (
        <details className="detail">
          <summary>按自己的录音标记语句起点</summary>
          <p>
            {linesFor(s)[lang].map((t, i) => (
              <span key={i}>
                {i + 1}. {t}　
              </span>
            ))}
          </p>
          <Input
            title="各句起点（秒，用逗号分开）"
            placeholder="0, 2.3, 5.1"
            value={marks}
            onChange={M}
          />
          <button
            onClick={() =>
              run(async () => {
                const starts = marks
                  .split(/[,，]/)
                  .map((x) => (x.trim() === "" ? NaN : Number(x)));
                if (
                  !validStarts(
                    starts,
                    linesFor(s)[lang].length,
                    chosen.duration,
                  )
                )
                  throw Error(
                    "请为每句填一个递增时间，从 0 开始且在录音时长内",
                  );
                edit({
                  manualTiming: {
                    ...s.manualTiming,
                    [lang]: { assetId: chosen.id, text: s[lang], starts },
                  },
                });
              })
            }
          >
            使用这些入点
          </button>
        </details>
      )}
      {p.language === "bilingual" &&
        !p.assets.some(
          (a) => s.assetIds.includes(a.id) && a.role === p.voice,
        ) && (
          <Check
            text="此镜明确使用无旁白版本"
            checked={s.silentOK}
            onChange={(silentOK) => edit({ silentOK })}
          />
        )}
      <button disabled={busy} onClick={() => run(score)}>
        按本镜节拍生成本地配乐
      </button>
    </section>
  );
}
function BeatPreview({scene,phone}) {
  const {width,height,fps,frames}=scene.canvas;
  const captions=displayCaptions(scene.captionCues);
  const times=proofFrames(scene);
  const seconds=f=>(f/fps).toFixed(2);
  return <div className={"proofgrid three-beats "+(phone?"phone":"wide")}>
    {scene.beats.map((beat,index)=>{
      const end=scene.beats[index+1]?.from??frames;
      const frame=index<3?times[index]:Math.min(frames-1,Math.floor((beat.from+end)/2));
      const spoken=captions.filter(c=>c.lang===beat.lang && c.from<end && (c.until??frames)>beat.from);
      return <figure key={index}>
        <Thumbnail component={ShotScene} inputProps={{...scene,silent:true}} compositionWidth={width}
          compositionHeight={height} fps={fps} durationInFrames={frames} frameToDisplay={frame} style={{width:"100%"}}/>
        <figcaption><strong>{phaseNames[beat.phase]}</strong> · {seconds(beat.from)}–{seconds(end)} 秒 · {scene.beatLabels[beat.phase]}
          {spoken.map((c,k)=><div key={k}>{seconds(c.from)} 秒{c.from<beat.from?' 起 · 续上拍':' 起'}　{c[c.lang]}</div>)}
        </figcaption>
      </figure>;
    })}
  </div>;
}
export function LookBoard({ p, s, scene, issues, act }) {
  const [phone, change] = useState(true);
  if (p.look !== "directed" || !s) return null;
  const approved = s.approvedLook === approvalKey(p, s),
    refs = scene.assets.filter(
      (a) => a.role === "product" && a.kind === "image",
    );
  return (
    <section className="panel">
      <header>
        <div>
          <small>ART DIRECTION / PROOF</small>
          <h2>风格帧评审</h2>
        </div>
        <button aria-pressed={phone} onClick={() => change(!phone)}>
          {phone ? "切到大图" : "按手机宽度看"}
        </button>
      </header>
      {issues.length ? (
        <ul aria-label="预览风格帧前待完成">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>
      ) : (
        <>
          <BeatPreview scene={scene} phone={phone}/>
          <p className="muted">
            {phone ? "每张最大宽度 360 像素。" : "大图预览。"}
            核对第一眼看到什么、结果改变了什么，小字能否在手机上读清。
          </p>
          {refs.some((a) => a.width < p.width * 0.6) && (
            <p className="hint">
              有参考图的像素不足以支撑大幅特写，建议从真实界面重新截取目标控件。
            </p>
          )}
          <div className="inline">
            <button disabled={approved} onClick={() => act("look", s.id)}>
              {approved ? "本镜构图已确认" : "确认三拍构图"}
            </button>
            <span>
              {scene.captionCues.some((c) => c.timing === "实测")
                ? "含实测人声切点"
                : scene.captionCues.some((c) => c.timing === "人工标记")
                  ? "使用人工语句入点"
                  : "当前字幕切点按文本估算"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

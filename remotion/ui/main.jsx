import {isAuthoredProcess} from '../shared/production-mode.mjs';
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {Casting,DirectionEditor,LookBoard} from "./Direction";
import {FilmBoard} from "./FilmBoard";
import {
  draft,
  quality,
  qualityFor,
  screening,
  stages,
  uid,
  timeline,
  shotIssues,
  renderIssues,
} from "../shared/model.mjs";
import { sceneProps } from "../shared/scene-props.mjs";
import { Input, Select, Check, Assets, Claims, Shots, toggle } from "./fields";
import { Home } from "./Home";
import { ScienceTools } from "./ScienceTools";
import { WorkflowPolicy } from "./WorkflowPolicy";
import {SampleReview} from './SampleReview';
import {KeynataLibrary} from './KeynataLibrary';
import {SegmentVideos} from './SegmentVideos';
import {TaskProgress,TaskResult} from './TaskProgress';
import {ScienceStepIssues} from './ScienceStepIssues';
import {scienceStepIssues,scienceTaskLocation,isRhythmFallback} from '../shared/science-task-status.mjs';
import {safeIssueText} from '../shared/issue-help.mjs';
import {exportNotice} from './export-status.mjs';
import {sampleCreationNeeds} from '../shared/sample-creation.mjs';
import {needsVisualScopeUpdate} from '../shared/visual-continuity.mjs';
import {needsCameraPlanUpdate} from '../shared/camera-plan.mjs';
import {needsMotionDesignUpdate} from '../shared/director-quality.mjs';
import {ScienceStage,StepIntro} from './ScienceWorkflow';
import {hasVisualReference} from '../shared/lemo.mjs';
import {referenceAnalysisNeeds} from '../shared/reference-motion.mjs';
import {TopicResearch} from './TopicResearch';
import {directTask,taskTitles,mergeGeneratedProject} from '../shared/automatic-workflow.mjs';
import {proofJobStatus} from '../shared/codex-status.mjs';
import {syncNarration} from '../shared/model.mjs';
import {translationInput,translationSegments,invalidateTranslations} from '../shared/narration-language.mjs';
import {voiceStageReady} from '../shared/voice-assembly.mjs';
import {IssueContext,IssueNotice,AppErrorBoundary} from './IssueNotice';
import {analyzeIssue} from '../shared/issue-client.mjs';
import {References,useReferenceReader} from './References';
import {scienceSteps,scienceGate,scienceInputs,scriptReady,proofsReady} from '../shared/science-flow.mjs';
import {workflowStages} from '../shared/workflow-status.mjs';
import {ContentBrief,SemanticWorkbench,CapabilityPanel,ChangeImpact} from './ContentWorkspace';
import {PhraseEditor} from './PhraseEditor';
import {FilmStylePanel} from './QualityWorkbench';
import {storyboardBlocker} from '../shared/storyboard.mjs';
import { ArrowLeft, ChevronRight, Layers3, Monitor, Save, CircleCheck } from "lucide-react";
import "./style.css";
export async function request(url, body) {
  const r = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  let j;
  try {j=await r.json();}catch{throw Error(`工作台请求没有返回完整数据（HTTP ${r.status}），请先检查服务和原任务记录。`);}
  if (!r.ok) throw Object.assign(Error(j.error || "请求失败"),{code:j.code,status:r.status});
  return j;
}
const kinds = { product: "产品宣传", science: "科普讲解" },
  names = ["项目与素材", "分镜与依据", "样镜与审片", "整片与交付"];
function Mark() {
  return (
    <svg viewBox="0 0 32 32" width="31" height="31" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#bca0fa" />
      <path
        d="M8 23V9h16M8 15h11m-4 8v-5h8"
        fill="none"
        stroke="#241737"
        strokeWidth="2.6"
      />
    </svg>
  );
}
function App() {
  const [toolsOpen, setToolsOpen] = useState(new URLSearchParams(location.search).get("view") === "tools");
  function showTools(value) {
    setToolsOpen(value);
    const url = new URL(location.href);
    if (value) url.searchParams.set("view", "tools");
    else url.searchParams.delete("view");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  const [list, L] = useState([]),
    [p, P] = useState(null),
    [tab, T] = useState(0),
    [sel, S] = useState(""),
    [dirty, D] = useState(false),
    [busy, B] = useState(false),
    [msg, M] = useState(""),
    [tasks, J] = useState([]),
    [jobsRead,setJobsRead] = useState(null),
    [stepErrors,setStepErrors] = useState(()=>{
      try{const v=JSON.parse(localStorage.getItem('frameboard:science-operation-errors'));return Array.isArray(v)?v:[];}catch{return [];}
    }),
    [variant, V] = useState("zh"),
    [undo, U] = useState(null);
  useEffect(() => {
    const view=new URLSearchParams(location.search).get("view");
    if(p?.kind==='science'&&tab===5&&view==='images'){
      document.getElementById('shot-image-analysis')?.scrollIntoView({block:'start'});return;
    }
    if(p?.kind==='science'&&tab===5&&view==='references'){
      document.getElementById('reference-analysis')?.scrollIntoView({block:'start'});return;
    }
    if(tab===1&&view==='storyboard'){
      document.getElementById('storyboard-editor')?.scrollIntoView({block:'start'});return;
    }
    if (p?.id && tab === 1 && view === "casting") {
      document.getElementById("voice-casting")?.scrollIntoView({ block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [p?.id, tab]);
  const refresh = () => request("/api/projects").then(L);
  const nav = useRef({});
  useEffect(()=>{
    const rejected=event=>M({error:event.reason?.message||String(event.reason||'页面操作未完成')});
    const failed=event=>{
      const target=event.target;
      if(['VIDEO','AUDIO','IMG'].includes(target?.tagName))M({error:`${target.tagName==='IMG'?'图片':'媒体'}未能载入：${target.getAttribute('aria-label')||target.alt||'当前预览文件'}。请检查文件是否可用，或重新载入预览。`});
      else if(event.message)M({error:event.message});
    };
    window.addEventListener('unhandledrejection',rejected);
    window.addEventListener('error',failed,true);
    return()=>{window.removeEventListener('unhandledrejection',rejected);window.removeEventListener('error',failed,true);};
  },[]);
  const draftRef = useRef(p);
  draftRef.current = p;
  const editSerial = useRef(0);
  const jobsPollSerial = useRef(0);
  const narrationApplied = useRef(new Set());
  nav.current = { id: p?.id || "", dirty };
  useEffect(()=>{try{localStorage.setItem('frameboard:science-operation-errors',JSON.stringify(stepErrors));}catch{}},[stepErrors]);
  function recordOperation(project,step,action,error){
    setStepErrors(old=>{
      const rest=old.filter(i=>i.project!==project||i.step!==step||i.action!==action);
      if(error)return [...rest,{project,step,action,message:safeIssueText(error)}].slice(-50);
      return rest.length===old.length?old:rest;
    });
  }
  async function run(fn,action) {
    if (busy) return;
    const button=document.activeElement?.closest('button');
    const operation=action||button?.getAttribute('aria-label')||button?.textContent.trim()||'页面操作';
    B(true);
    M("");
    try {
      await fn();
      if(p?.kind==='science')recordOperation(p.id,tab,operation,null);
    } catch (e) {
      M({error:e.message});
      if(p?.kind==='science')recordOperation(p.id,tab,operation,e);
    } finally {
      B(false);
    }
  }
  const set = (attrs) => {
    editSerial.current++;
    P((curr) => {
      const patch=typeof attrs==='function'?attrs(curr):attrs;
      if (!curr || !patch) return curr;
      let next={...curr,...patch};
      if(curr.kind==='science' && Object.hasOwn(patch,'script'))next=syncNarration(next,{clearEmpty:true});
      else if(curr.kind==='science' && patch.shots && curr.script.trim() &&
        JSON.stringify(curr.shots.map(s=>s.zh))!==JSON.stringify(patch.shots.map(s=>s.zh)))
        next.script=patch.shots.map(s=>s.zh).join('\n');
      next=invalidateTranslations(curr,next);
      if(curr.kind==='science' && curr.scienceFlow?.scriptVersion && scienceInputs(curr)!==scienceInputs(next))
        next.scienceFlow={...next.scienceFlow,scriptVersion:null,proofVersion:null,proofs:null,sampleJob:null};
      return next;
    });
    D(true);
  };
  const referenceReader = useReferenceReader(p,set,request);
  function load(q) {
    editSerial.current++;
    const base=q.kind==='science' && !q.scienceFlow ? {...q, scienceFlow:{}} : q;
    const next=syncNarration(base);
    P(next);
    D(next!==base);
    S((s) => (next.shots.some((x) => x.id === s) ? s : next.shots[0]?.id || ""));
  }
  async function open(id, initialTab) {
    const q = await request("/api/projects/" + id);
    load(q);
    const remembered=Number(localStorage.getItem('frameboard:step:'+id));
    T(initialTab==='references'?(q.kind==='science'?5:0):initialTab==='music' ? (q.kind==='science'?4:3) : initialTab ?? (q.kind==='science' && scienceSteps.some(([n])=>n===remembered)?remembered:0));
    J([]);
    setJobsRead(null);
    U(null);
    V(q.voice);
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#" + id,
    );
  }
  useEffect(() => {
    refresh().catch((e) => M({error:e.message}));
    const readRoute = () => {
      const id = location.hash.slice(1),
        view = new URLSearchParams(location.search).get("view");
      if (
        nav.current.dirty &&
        id !== nav.current.id &&
        !window.confirm("离开将丢失未保存的修改，继续吗？")
      ) {
        history.replaceState(
          null,
          "",
          location.pathname +
            location.search +
            (nav.current.id ? "#" + nav.current.id : ""),
        );
        return;
      }
      if (id)
        open(
          id,
          view === "images" ? 5 : view === "references" ? "references" : view === "music" ? "music" : view === "film"
            ? 3
            : view === "proof"
              ? 2
              : view === "casting" || view === "storyboard"
                ? 1
                : undefined,
        ).catch((e) => M({error:e.message}));
      else {
        P(null);
        D(false);
      }
    };
    readRoute();
    window.addEventListener("hashchange", readRoute);
    return () => window.removeEventListener("hashchange", readRoute);
  }, []);
  useEffect(()=>{
    if(p?.kind!=='science')return;
    localStorage.setItem('frameboard:step:'+p.id,String(tab));
    const url=new URL(location.href);
    if(tab!==5&&url.searchParams.get('view')==='references'||tab!==1&&url.searchParams.get('view')==='storyboard'){
      url.searchParams.delete('view');
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
  },[p?.id,tab]);
  useEffect(()=>{if(p&&!p.shots.some(s=>s.id===sel))S(p.shots[0]?.id||'');},[p?.shots,sel]);
  useEffect(() => {
    if (!p?.version) {
      J([]);
      return;
    }
    let active = true;
    let polling = false;
    const tick = async () => {
      if (polling) return;
      polling = true;
      const serial = jobsPollSerial.current;
      try {
        const result = await request("/api/projects/" + p.id + (p.kind==='science'?"/jobs?workbench=1":"/jobs"));
        if (active && serial === jobsPollSerial.current) {
          J(Array.isArray(result)?result:result.jobs);
          if(p.kind==='science')setJobsRead({project:p.id,production:result.production||[]});
        }
      } catch (e) {
        if (active && serial === jobsPollSerial.current) {
          if(p.kind==='science')setJobsRead(last=>({project:p.id,production:last?.project===p.id?last.production:[],error:e.message}));
          else M({error:e.message});
        }
      } finally {
        polling = false;
      }
    };
    tick();
    const t = setInterval(tick, 1800);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [p?.id, p?.version]);
  function trackExport(submitted) {
    const batch=Array.isArray(submitted)?submitted:[submitted];
    const {project,scope}=batch[0];
    if (nav.current.id!==project) return;
    ++jobsPollSerial.current;
    const ids=batch.map(job=>job.id);
    J(previous=>[...batch.map(job=>previous.find(item=>item.id===job.id) || job),
      ...previous.filter(job=>!ids.includes(job.id))]);
    M({export:{project,scope,ids}});
  }
  useEffect(() => {
    if (!p || dirty || busy) return;
    const job = tasks.find(j => !j.batchId && j.project === p.id && directTask(p,j.task) &&
      j.status === 'ready' && !isRhythmFallback(j) && (j.version === p.version || j.task==='translation'&&j.translationInput===translationInput(p)) && j.result?.length);
    if (!job || narrationApplied.current.has(job.id)) return;
    narrationApplied.current.add(job.id);
    const serial = editSerial.current, before = p, title = taskTitles[job.task];
    B(true);
    request('/api/jobs/' + job.id + '/apply', {})
      .then(async q => {
        if (draftRef.current?.id !== job.project || draftRef.current.version !== before.version) return;
        if (editSerial.current === serial) {
          load(q);
          if(job.task==='material-supplement') {
            M('已将 '+job.result.length+' 项素材加入素材库。'+(job.itemError?'剩余项可在素材分析区继续补充。':''));
          } else M(job.task==='motion'?'':title+'已自动填入并保存，可继续编辑。');
        } else {
          // Keep edits made while the apply response was in flight, rebasing on
          // the saved version so the user's next save does not conflict.
          P(curr => curr?.id === job.project && curr.version === before.version ? mergeGeneratedProject(before,curr,q,job.task) : curr);
          D(true);
          M(title+'生成结果已保存，已保留你刚才的编辑。');
        }
        J(xs => xs.map(j => j.id === job.id ? {...j,status:'applied',appliedVersion:q.version} : j));
        refresh().catch(e => M({error:e.message}));
        if(job.task==='motion'&&job.renderAfter&&editSerial.current===serial+1) {
          M('');
          const pair=q.language==='separate';
          const rendered=await request('/api/projects/'+q.id+(pair?'/render-pair':'/render'),{
            version:q.version,shotId:job.shotId,variant:job.variant||q.voice,
          });
          if(draftRef.current?.id===job.project)J(xs=>[...(pair?rendered:[rendered]),...xs]);
        }
        const where=scienceTaskLocation(job);
        if(p.kind==='science'&&where)recordOperation(p.id,where[0],title+'自动处理',null);
      })
      .catch(e => {
        if (draftRef.current?.id === job.project) {
          const reason=title+'自动处理未完成：'+e.message;
          M({error:reason});
          const where=scienceTaskLocation(job);
          if(p.kind==='science'&&where)recordOperation(p.id,where[0],title+'自动处理',reason);
        }
      })
      .finally(() => B(false));
  }, [tasks, p?.id, p?.version, dirty, busy]);
  useEffect(() => {
    const fn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  async function saved(draft=p) {
    const documents = await referenceReader.resolve(draft);
    const referencesChanged = JSON.stringify(documents)!==JSON.stringify(draft.referenceDocuments || []);
    if (draft===p && !dirty && p.version && !referencesChanged) return p;
    const q = await request("/api/projects", {...draft, referenceDocuments:documents});
    load(q);
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#" + q.id,
    );
    await refresh();
    return q;
  }
  const act = (kind, id) =>
    run(async () => {
      const q = await saved();
      load(
        await request("/api/projects/" + q.id + "/review", {
          version: q.version,
          kind,
          id,
        }),
      );
      M("已记录本次核对");
    });
  const prepare = (shotId, task='shots', extra={}) =>
    run(async () => {
      const q = await saved();
      await startTask(q,shotId,task,extra);
    },taskTitles[task]||'提交制作任务');
  async function startTask(q,shotId,task,extra={}) {
      const j = await request("/api/projects/" + q.id + "/codex", {
        version: q.version,
        shotId,
        task,
        ...(task === 'rhythm' ? {submit:true} : {}),
        ...extra,
      });
      J((xs) => [j, ...xs.filter(x => x.id !== j.id)]);
      const visualSearch=task==='research'&&extra.researchScope==='visuals';
      if (visualSearch||directTask(q,task)) {
        const started = j.status === 'awaiting'
          ? await request('/api/jobs/' + j.id + '/approve', {confirm:j.id})
          : j;
        J(xs => xs.map(x => x.id === j.id ? started : x));
        M(visualSearch?'已开始联网找素材，结果会显示在素材需求下方。':taskTitles[task]+'生成已提交，完成后会自动填入并保存。');
        return started;
      }
      if(q.kind!=='science') T(2);
      M("已创建请求。单次确认后才会调用 Codex。");
      return j;
  }
  const changeVoiceLanguage = lang => run(async()=>{
    if(!['zh','en'].includes(lang))return;
    const current=draftRef.current;
    const q=await saved(current.voice===lang?current:{...current,voice:lang});
    if(lang==='en'&&translationSegments(q).length) {
      const existing=await request('/api/projects/'+q.id+'/jobs');
      J(existing);
      if(existing.some(j=>j.task==='translation'&&(['running','unknown'].includes(j.status)||j.status==='ready'&&j.translationInput===translationInput(q)))) {
        M('英文口播请求已保留；完成后自动填入，状态不明时请先核对原请求。');return;
      }
      await startTask(q,null,'translation');
    } else M(lang==='en'?'已切换英文口播，现有译文已复用。':'已切换中文口播，使用中文原稿。');
  });
  const changeCaptionMode=mode=>run(async()=>{
    if(!['voice','bilingual'].includes(mode))return;
    const current=draftRef.current;
    const q=await saved(current.captionMode===mode?current:{...current,captionMode:mode});
    if(mode==='bilingual'&&translationSegments(q).length) {
      const existing=await request('/api/projects/'+q.id+'/jobs');J(existing);
      if(existing.some(j=>j.task==='translation'&&(['running','unknown'].includes(j.status)||j.status==='ready'&&j.translationInput===translationInput(q)))) {M('字幕译文请求已保留，请等待完成或核对原任务。');return;}
      await startTask(q,null,'translation',{captionTranslation:true});
      M('正在补齐英文字幕，保留当前旁白语种；完成后可仅更新字幕视频。');
    }
  });
  async function upload(files) {
    await run(async () => {
      const items = [];
      for (const f of files) {
        const r = await fetch(
          "/api/upload?name=" + encodeURIComponent(f.name),
          { method: "POST", body: f },
        );
        const a = await r.json();
        if (!r.ok) throw Error(a.error);
        items.push(a);
      }
      set({ assets: [...p.assets, ...items] });
    });
  }
  async function home() {
    if (dirty && !window.confirm("离开将丢失未保存的修改，继续吗？")) return;
    P(null);
    D(false);
    history.replaceState(null, "", location.pathname);
    await refresh();
    M("");
  }
  const selected = p?.shots.find((s) => s.id === sel),
    props = selected ? sceneProps(p, sel, variant) : null,
    tl = p ? timeline(p, variant) : null;
  const issues = selected ? shotIssues(p, selected) : ["请添加第一条分镜"];
  const hasPendingSources=p?.claims.some(c=>c.title&&!c.verified);
  const musicId=tl?.rows[0]?.music?.keynataId;
  const musicLibraryProps={request,run,busy,available:!!tl?.rows.length,
    current:tl?.rows.every(row=>row.music?.keynataId===musicId)?musicId:'',
    adopt:async trackId=>{
      const q=await saved();
      load(await request('/api/projects/'+q.id+'/keynata',{version:q.version,trackId}));
    }};
  const active = selected ? renderIssues(p, sel, variant) : issues;
  const confirmStoryboard=p?.kind==='product' && p.flow==='review' && p.pauses.includes('分镜') &&
    !p.passed.includes('分镜') && p.shots.length>0 && p.shots.every(s=>!shotIssues(p,s).length);
  function openSample() {
    if (!confirmStoryboard) {
      T(science&&!isAuthoredProcess(p)?6:2);
      return;
    }
    run(async()=>{
      const q=await saved();
      if (q.shots.every(s=>!shotIssues(q,s).length))
        load(await request('/api/projects/'+q.id+'/review',{version:q.version,kind:'stage',id:'分镜'}));
      T(2);
    });
  }
  async function exportSample() {
    const q = await saved();
    if(q.kind==='science'&&!isAuthoredProcess(q)&&(renderIssues(q,sel,q.language==='separate'?variant:q.voice).length||needsVisualScopeUpdate(q,sel)||needsCameraPlanUpdate(q,sel)||needsMotionDesignUpdate(q,sel))) {
      const needs=sampleCreationNeeds(q,sel,variant);
      if(needs.length)throw Error(needs.join('；'));
      const prepared=await request('/api/projects/'+q.id+'/codex',{
        version:q.version,shotId:sel,task:'motion',variant:q.language==='separate'?variant:q.voice,
      });
      J(xs=>[prepared,...xs.filter(j=>j.id!==prepared.id)]);
      const started=await request('/api/jobs/'+prepared.id+'/approve',{confirm:prepared.id});
      J(xs=>xs.map(j=>j.id===started.id?started:j));
      M('');
      return;
    }
    const pair = q.language === "separate";
    const j = await request(
      "/api/projects/" + q.id + (pair ? "/render-pair" : "/render"),
      { version: q.version, shotId: sel, variant: q.language === "separate" ? variant : q.voice },
    );
    J((xs) => [...(pair ? j : [j]), ...xs]);
    M('');
  }
  function goRoom() {
    run(async () => {
      const r = await request("/api/room", {});
      const a = document.createElement("a");
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    });
  }
  const statuses = {
    awaiting: "等待单次确认",
    running: "执行中",
    ready: "结果待采用",
    applied: "已采用",
    unknown: "提交结果待核对",
    reconciled: "已记录核对结果",
    failed: "失败",
    queued: "已排队",
    done: "已导出",
    cancelled: "已停止后续分段",
  };
  const science=p?.kind==='science';
  const storyboard = science && tab === 1 && !isAuthoredProcess(p) ? {
    blocker:storyboardBlocker(p,tasks),
    latestJob:tasks.find(j => j.project === p.id && j.task === 'storyboard'),
    busy:busy || !!p.version && (jobsRead?.project !== p.id || !!jobsRead.error),
    generate:shotId => prepare(shotId,'storyboard'),
  } : null;
  const steps=science?(isAuthoredProcess(p)?[[0,'选题与资料'],[4,'本地配音'],[5,'素材'],[1,'分镜与本地画面'],[2,'样片预览'],[3,'整片与交付']]:scienceSteps):names.map((name,i)=>[i,name]);
  const gate=science?scienceGate(p,tab===3):[];
  const stageIssues=science?scienceStepIssues(p,[...tasks,...(jobsRead?.project===p.id?jobsRead.production||[]:[])]):[];
  const operationIssues=stepErrors.filter(i=>i.project===p?.id);
  const hasIssue=i=>stageIssues.some(issue=>issue.step===i)||operationIssues.some(issue=>issue.step===i);
  const referenceBlock=science&&!isAuthoredProcess(p)&&referenceAnalysisNeeds(p).length>0;
  function openReferences(){
    T(5);
    requestAnimationFrame(()=>document.getElementById('reference-analysis')?.scrollIntoView({block:'start'}));
  }
  function openIssue(job){
    if(job.task==='reference-motion')return openReferences();
    if(job.shotId&&['voice','local-render'].includes(job.type))S(job.shotId);
    requestAnimationFrame(()=>{
      let target;
      if(['research','research-recommendation'].includes(job.task))target=document.getElementById(job.researchScope==='visuals'?'material-planner':'topic-research');
      else if(job.type==='voice')target=document.getElementById('voice-casting');
      else if(job.type==='local-render')target=document.querySelector('details.local-process');
      else{
        const history=document.getElementById('task-history');
        if(history)history.open=true;
        target=document.getElementById('task-'+job.id)||history;
      }
      if(target?.tagName==='DETAILS')target.open=true;
      target?.scrollIntoView({block:'start'});
    });
  }
  function openGate(){
    if(referenceBlock)return openReferences();
    const first=gate[0]||'';
    T(/选题|依据/.test(first)?0:/配音|BGM/.test(first)?4:/选择.*参考|选定风格/.test(first)?5:/效果图/.test(first)?6:1);
  }
  const stageState=science?workflowStages(p,[...tasks,...(jobsRead?.project===p.id?jobsRead.production||[]:[])]):{};
  const ai=(task,extra)=>prepare(null,task,extra);
  const recoverRhythm=original=>run(async()=>{
    const q=await saved();
    const restored=await request('/api/jobs/'+original.id+'/recover-rhythm',{version:q.version});
    if(draftRef.current?.id!==q.id)return;
    J(xs=>[restored,...xs.filter(j=>j.id!==restored.id)]);
    M('原脚本已通过本地校验，正在保存；未调用生成服务。');
  },'恢复节奏脚本');
  const refreshJobs=async()=>{
    const updated=await request('/api/projects/'+p.id+'/jobs');
    if(nav.current.id===p.id)J(updated);
  };
  const scienceReview=(action,id)=>run(async()=>{
    const q=await saved();
    load(await request('/api/projects/'+q.id+'/science-review',{version:q.version,action,id}));
    M('已记录审核结果');
  });
  const issueActions={version:p?.version,busy,
    checkConnection:()=>request('/api/health'),
    checkJob:async id=>{const next=await request('/api/jobs/'+id);J(xs=>xs.map(j=>j.id===next.id?next:j));return next;},
    navigate(action){
      if(action==='tools'){showTools(true);return;}
      if(action==='connection'){window.open('/voice?frameboard=voices'+(p?.id?'&project='+encodeURIComponent(p.id):''),'_blank','noopener');return;}
      showTools(false);
      T(action==='evidence'?0:action==='voice'?(p?.kind==='science'?4:1):action==='direction'?1:action==='style'?5:action==='review'?3:2);
      if(action==='tasks')setTimeout(()=>{const history=document.getElementById('task-history');if(history){history.open=true;history.scrollIntoView({block:'start'});}},0);
    },
    repair:async job=>{
      if(busy||dirty)throw Error('请先保存当前编辑，再修复这条任务。');
      if(job.version!==p?.version)throw Error('草稿版本已变化，不能用旧结果覆盖当前内容。');
      B(true);
      try {
        const created=await startTask(p,job.shotId,job.task,{repairOf:job.id,variant:job.variant});
        if(created.status==='awaiting'){
          const started=await request('/api/jobs/'+created.id+'/approve',{confirm:created.id});
          J(xs=>[started,...xs.filter(x=>x.id!==started.id)]);
          M('修复已提交，完成后可在任务记录查看并采用。');
        }
      }
      finally {B(false);}
    },
    analyze:p?.version?issue=>analyzeIssue(request,p,issue,started=>J(xs=>[started,...xs.filter(x=>x.id!==started.id)])):null
  };
  return (
    <IssueContext.Provider value={issueActions}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      <header className="top">
        <button className="brand" onClick={home}>
          <Mark />
          <strong>CUEFRAME</strong>
          <span>影像创作工作台</span>
        </button>
        <div className="top-meta">
          <button onClick={() => showTools(!toolsOpen)} aria-pressed={toolsOpen}>科普工具</button>
          <span className="local">
            <span className="online-dot" /> 本机工作区
          </span>
          <span className="workspace-avatar" aria-label="个人工作区">
            F
          </span>
        </div>
      </header>
      <WorkflowPolicy />
      {msg?.error ? <div className="workspace-issue"><IssueNotice error={msg.error}/><button aria-label="关闭问题提示" onClick={()=>M('')}>关闭提示</button></div> : msg && (!msg.export || p?.id===msg.export.project) && (
        <div className="toast" role="status">
          {msg.export ? exportNotice(msg.export,tasks) : msg}
          <button aria-label="关闭消息" onClick={() => M("")}>
            ×
          </button>
        </div>
      )}
      {toolsOpen ? <ScienceTools project={p} onClose={() => showTools(false)} onImport={(asset) => set({ assets: [...p.assets, asset] })} /> : !p ? (
        <Home
          list={list}
          open={(id) => run(() => open(id))}
          start={(kind) => {
            load(draft(kind));
            D(true);
            T(0);
            U(null);
            M("");
          }}
        />
      ) : (
        <main className="workspace">
          <aside className="studio-rail" aria-label="制作流程导航">
            <div className="rail-space">
              <span className="space-icon">
                <Monitor size={19} aria-hidden="true" />
              </span>
              <div>
                <strong>我的工作区</strong>
                <span>个人创作空间</span>
              </div>
            </div>
            <button onClick={home}>
              <ArrowLeft size={18} aria-hidden="true" /> 项目列表
            </button>
            <small>制作流程</small>
            {steps.map(([i,n],order) => (
              <button
                key={n}
                className={i === tab ? "on" : ""}
                aria-current={i === tab ? "step" : undefined}
                onClick={() => T(i)}
              >
                <span className="step-number">0{order + 1}</span>
                <span>{n}</span>
                {science&&hasIssue(i)?<span className="science-step-problem">需处理</span>:stageState[i]?.ready?<CircleCheck size={15} className="step-done" aria-label={stageState[i].label}/>:stageState[i]?.state==='outdated'?<span className="science-step-problem">待更新</span>:null}
              </button>
            ))}
            <div className="asidefoot">
              LOCAL STUDIO
              <br />
              Remotion · {p.fps} FPS
            </div>
          </aside>
          <div className="content" id="main-content" tabIndex={-1}>
            <div className="editor-breadcrumb">
              <span>工作区</span>
              <ChevronRight size={14} aria-hidden="true" />
              <span>{kinds[p.kind]}</span>
              <ChevronRight size={14} aria-hidden="true" />
              <strong>{steps.find(([i])=>i===tab)?.[1]}</strong>
            </div>
            <div className="workhead">
              <div>
                <small>
                  {kinds[p.kind]} &nbsp;/&nbsp;{" "}
                  {p.version ? "VERSION " + p.version : "NEW PROJECT"}
                </small>
                <h1>{p.title || p.topic || "新建草稿"}</h1>
              </div>
              <div className="work-actions">
                <span className={"save-status" + (dirty ? " dirty" : "")}>
                  {dirty ? "有未保存修改" : "已保存"}
                </span>{" "}
                {p.version > 0 && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const copy = dirty
                          ? await request("/api/projects", {
                              ...p,
                              id: uid(),
                              version: 0,
                              title: (p.title || p.topic) + " · 副本",
                              origin: { project: p.id, version: p.version },
                            })
                          : await request("/api/projects/" + p.id + "/copy", {
                              version: p.version,
                            });
                        await open(copy.id, tab);
                        await refresh();
                        M("已打开独立项目副本");
                      })
                    }
                  >
                    <Layers3 size={15} aria-hidden="true" /> 复制为新项目
                  </button>
                )}
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await saved();
                      M("草稿已保存到本机");
                    })
                  }
                >
                  <Save size={16} aria-hidden="true" />{" "}
                  {busy ? "处理中…" : "保存草稿"}
                </button>
              </div>
            </div>
            <CapabilityPanel/>
            <ChangeImpact p={p}/>
            {tab===0&&<ContentBrief {...{p,set}}/>}
            {(science&&!isAuthoredProcess(p)?tab===5:tab===3)&&<FilmStylePanel {...{p,set,busy}}/>}
            {tab===1&&<SemanticWorkbench key={p.id+':'+sel} {...{p,set,sel,busy}}/>}
            {tab===1&&<PhraseEditor key={'phrase:'+p.id+':'+sel} {...{p,set,sel,busy}}/>}
            {science&&p.version>0&&jobsRead?.project!==p.id&&<p className="muted" role="status">正在读取本期任务记录…</p>}
            {science&&jobsRead?.project===p.id&&jobsRead.error&&<div className="reference-problem" role="alert"><strong>任务状态读取失败</strong><p>{jobsRead.error}。正在重新连接，页面保留上次读取的记录。</p></div>}
            {science&&operationIssues.filter(i=>i.step===tab).map(i=><div key={i.action} className="reference-problem" role="alert"><strong>{i.action} · 上次操作未完成</strong><p>{i.message}</p><button onClick={()=>recordOperation(p.id,tab,i.action,null)}>知道了</button></div>)}
            {science&&<ScienceStepIssues issues={stageIssues.filter(issue=>issue.step===tab)} version={p.version} onOpen={openIssue} onRecoverRhythm={recoverRhythm} onRepairRhythm={j=>prepare(j.shotId,'rhythm',{repairOf:j.id})} busy={busy||tasks.some(j=>j.task==='rhythm'&&['running','unknown'].includes(j.status))}/>}
            <TaskProgress {...{tasks,p,busy,request,run}} updateJob={changed=>J(xs=>xs.map(j=>j.id===changed.id?changed:j))} openTasks={j=>{
              if(j.task!=='research')return issueActions.navigate('tasks');
              const visuals=j.researchScope==='visuals';
              issueActions.navigate(visuals?'style':'evidence');
              setTimeout(()=>document.getElementById(visuals?'material-planner':'topic-research')?.scrollIntoView({block:'start'}),0);
            }}/>
            {science && <>
              {!isAuthoredProcess(p)&&tab!==2&&tab!==3&&tab!==4&&<StepIntro tab={tab}/>}
              <ScienceStage key={p.id+':'+tab} {...{tab,p,set,sel,upload,run,request,saved,load,busy,dirty,refreshJobs,ai,tasks,openReferences}} stageIssues={stageIssues} jobsAvailable={!p.version||jobsRead?.project===p.id&&!jobsRead.error} review={scienceReview} select={S} openSample={id=>{S(id);T(2);}}>
                {tab===4 && selected && <Casting key={selected.id} {...{p,saved,run,request,load,busy,set,tasks,changeVoiceLanguage,changeCaptionMode}} s={selected}/>}
              </ScienceStage>
              {(tab===2||tab===3&&isAuthoredProcess(p))&&gate.length>0&&<section className="panel"><h2>{gate[0]}</h2>{referenceBlock&&stageIssues.filter(i=>i.job.task==='reference-motion').map(i=><p key={i.job.id}>{i.message}</p>)}<button onClick={openGate}>{referenceBlock?'查看参考视频分析':'前往处理这一步'} →</button></section>}
            </>}
            {tab === 0 && (
              <>
                <section className="panel">
                  <header>
                    <div>
                      <small>PROJECT BRIEF</small>
                      <h2>项目设置</h2>
                    </div>
                    <em>{kinds[p.kind]}</em>
                  </header>
                  <div className="grid2">
                    <Input
                      title="项目名称"
                      value={p.title}
                      onChange={(title) => set({ title })}
                    />
                    <Input
                      title="一句话主题"
                      value={p.topic}
                      onChange={(topic) => set({ topic })}
                    />
                  </div>
                  <details className="detail">
                    <summary>脚本、链接与画布设置</summary>
                    <Input
                      area
                      title="已有脚本或旁白稿"
                      value={p.script}
                      onChange={(script) => set({ script })}
                    />
                    <References p={p} set={set} reader={referenceReader} busy={busy}/>
                    <div className="grid3">
                      {[
                        ["width", "画布宽度"],
                        ["height", "画布高度"],
                        ["fps", "每秒帧数"],
                      ].map(([k, name]) => (
                        <Input
                          key={k}
                          type="number"
                          title={name}
                          value={p[k]}
                          onChange={(n) => set({ [k]: n })}
                        />
                      ))}
                      <div className="field">
                        <span>成片时长</span>
                        <output aria-live="polite">
                          {tl.narrationReady ? `按口播音频与镜头停留计算：${tl.required.toFixed(2)} 秒` : "待口播音频生成后确定"}
                        </output>
                        <small className="muted">先完成口播，取得实际音频后再安排成片时长。</small>
                        {p.target > 0 && <>
                          <small>此旧项目保留了 {p.target} 秒预设。</small>
                          <button onClick={() => set({target:null})}>取消预设，按口播音频确定</button>
                        </>}
                      </div>
                      {p.kind === "product" && (
                        <Select
                          title="产品类型"
                          value={p.productType}
                          options={[
                            ["software", "软件"],
                            ["physical", "实体商品"],
                          ]}
                          onChange={(productType) => set({ productType })}
                        />
                      )}
                    </div>
                  </details>
                </section>
                {science?<><TopicResearch {...{p,ai,tasks,busy,dirty,run,request,load,refreshJobs}}/>
                  <details className="panel" open={hasPendingSources||undefined}>
                    <summary>{hasPendingSources?'核对已采用的科学资料':'补充自己的资料或调整出处（可选）'}</summary>
                    <Assets p={p} set={set} upload={upload}/><Claims p={p} set={set} action={act} request={request}/>
                  </details></>:<Assets p={p} set={set} upload={upload} />}
                <section className="panel">
                  <small>READINESS CHECK</small>
                  <h2>进入制作前</h2>
                  {p.kind === "product" ? (
                    <p>
                      {p.assets.some(
                        (a) =>
                          a.role === "product" &&
                          a.confirmed &&
                          a.source &&
                          a.license,
                      )
                        ? "已登记真实参考。下一步把它关联到分镜并核对一致性。"
                        : "待补真实参考。软件请上传截图或录屏，实体产品请上传实拍图。缺项时仍可保存草稿。"}
                    </p>
                  ) : (
                    <p>
                      {p.claims.some((c) => c.verified)
                        ? "已有核实的结论，可以进入口播与音乐。"
                        : "用 AI 搜索后，采用有依据的科学资料即可起草口播。"}
                    </p>
                  )}
                  <p className="muted">
                    Codex
                    可以起草旁白、图形标签与动效说明。进入样镜前需逐镜关联已核实的素材或出处。
                  </p>
                </section>
                <button className="primary" onClick={() => T(science?4:1)}>
                  {science?'进入口播与音乐':'进入分镜与依据'} →
                </button>
              </>
            )}
            {tab === 1 && (
              <>
                <Shots
                  p={p}
                  set={set}
                  selected={sel}
                  select={S}
                  action={act}
                  prepare={prepare}
                  storyboard={storyboard}
                  openBlocker={blocker => {
                    if (blocker.target === 'job') openIssue(blocker.job);
                    else if (blocker.target === 'references') openReferences();
                    else if (blocker.target === 'narration') T(4);
                    else if (blocker.target === 'claims') T(0);
                    else document.getElementById('rhythm-script')?.scrollIntoView({block:'start'});
                  }}
                  undo={undo}
                  setUndo={U}
                />
                {selected && (
                  <>
                    <DirectionEditor p={p} s={selected} set={set} scene={props} storyboard={storyboard}/>
                    {!science && <details className="panel"><summary>从曲库选择全片背景音乐</summary>
                      <KeynataLibrary {...musicLibraryProps} autoScroll={false}/>
                    </details>}
                    {!science && <Casting
                      key={p.id + selected.id}
                      p={p}
                      s={selected}
                      saved={saved}
                      run={run}
                      request={request}
                      load={load}
                      busy={busy}
                      set={set}
                      tasks={tasks}
                      changeVoiceLanguage={changeVoiceLanguage}
                      changeCaptionMode={changeCaptionMode}
                    />}
                  </>
                )}
                <button className="primary" onClick={openSample}>
                  {confirmStoryboard?'确认分镜并查看样镜':science&&!isAuthoredProcess(p)?'查看效果图':'查看样镜与审片'} →
                </button>
              </>
            )}
            {tab === 3 && science && !isAuthoredProcess(p) && <SegmentVideos
              {...{p,variant,busy,dirty,saved,request,run}}
              openScript={()=>T(1)}
              syncProject={q=>{if(nav.current.id===q.id&&!nav.current.dirty&&draftRef.current.version<q.version)load(q);}}/>}
            {tab === 3 && (!science || isAuthoredProcess(p)) && !gate.length && (
              <React.Suspense fallback={<p>正在打开整片分镜板…</p>}>
                <FilmBoard
                  {...{
                    p,
                    set,
                    sel,
                    variant,
                    busy,
                    dirty,
                    saved,
                    load,
                    run,
                    request,
                    tasks,
                    goRoom,
                  }}
                  select={S}
                  musicLibraryProps={musicLibraryProps}
                  goEdit={() => T(1)}
                  goSettings={() => T(2)}
                  notice={M}
                  trackExport={trackExport}
                />
              </React.Suspense>
            )}
            {tab === 2 && !gate.length && (
              <SampleReview key={p.id} {...{p,sel,variant,tasks,busy,dirty,request,run}}
                onShotImages={science&&!isAuthoredProcess(p)?()=>{T(5);setTimeout(()=>document.getElementById('shot-image-analysis')?.scrollIntoView({block:'start'}),0);}:null}
                onRevision={async result=>{load(result.project);J(await request('/api/projects/'+p.id+'/jobs'));}}
                select={S} issues={sampleCreationNeeds(p,sel,variant)} generate={()=>run(exportSample)}
                updateJob={changed=>J(xs=>xs.map(j=>j.id===changed.id?changed:j))}
                onProductReview={({project,nextSample},decision)=>{
                  load(project);
                  if(decision!=='approved')return;
                  if(nextSample) {
                    S(nextSample.shotId); V(nextSample.variant);
                    M('本镜已通过，请继续审核下一条样镜');
                  } else {
                    T(3); M('样镜已通过，已进入整片与交付');
                  }
                }}
                continueFilm={()=>T(3)}>
                {selected && !science && <LookBoard p={p} s={selected} scene={props} issues={issues} act={act}/>}
                  <div className="grid2">
                    <Select
                      title="语言形式"
                      value={p.language}
                      options={[
                        ["bilingual", "单语旁白（默认同语字幕）"],
                        ["sequential", "中英文旁白依次播报"],
                        ["separate", "分别导出中文版和英文版"],
                      ]}
                      onChange={(language) => set({ language })}
                    />
                    <Select
                      title={
                        p.language === "separate"
                          ? "本次预览 / 导出版本"
                          : "单语旁白语言"
                      }
                      value={p.language === "separate" ? variant : p.voice}
                      options={[
                        ["zh", "中文"],
                        ["en", "英文"],
                      ]}
                      onChange={(v) => {
                        V(v);
                        if (p.language !== "separate") set({ voice: v });
                      }}
                    />
                    {!science&&<Select
                      title="制作方式"
                      value={p.flow}
                      options={[
                        ["review", "分阶段审片"],
                        ["direct", "直接出片"],
                      ]}
                      onChange={(flow) => set({ flow })}
                    />}
                  </div>
                  {!science && p.flow === "review" && (
                    <div className="checks">
                      {stages.map((k) => (
                        <div key={k}>
                          <Check
                            text={"暂停于" + k}
                            checked={p.pauses.includes(k)}
                            onChange={(on) =>
                              set({ pauses: toggle(p.pauses, k, on) })
                            }
                          />
                          {p.pauses.includes(k) && k==="样镜" && <span>{p.passed.includes(k)?"已放行":"全部样镜通过后放行"}</span>}
                          {p.pauses.includes(k) && k!=="样镜" && (
                            <button
                              disabled={p.passed.includes(k)}
                              onClick={() => act("stage", k)}
                            >
                              {p.passed.includes(k) ? "已确认" : "确认继续"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p>
                    {tl.target != null
                      ? `原预设 ${tl.target} 秒 · 镜头及旁白需 ${tl.required.toFixed(2)} 秒 · 延长 ${tl.extra.toFixed(2)} 秒`
                      : tl.narrationReady
                        ? `按口播音频与镜头停留计算：${tl.required.toFixed(2)} 秒`
                        : "成片时长待口播音频生成后确定；当前镜头时长仅用于草稿预览。"}
                  </p>
                  {tl.blocked && (
                    <div className="inline">
                      <button onClick={() => set({ overflow: "extend" })}>
                        保留旁白并延长
                      </button>
                      <button onClick={() => T(1)}>返回缩稿并换配音</button>
                    </div>
                  )}

                <p className="muted">{p.width} × {p.height} · {p.fps} fps</p>
                <details><summary>检查参考</summary><p>{qualityFor(p).join(' / ')}</p></details>
                <button onClick={goRoom}>打开独立审片室 ↗</button>
              </SampleReview>
            )}
            {(tab===2 || science&&tasks.some(j=>!['research','research-recommendation'].includes(j.task))) && (
              <>
                <details id="task-history" className="panel sample-history">
                  <summary>任务与版本</summary>
                  {!tasks.length && (
                    <p className="empty">
                      分镜生成和样镜导出会在这里留下记录。
                    </p>
                  )}
                  {tasks
                    .filter(j=>(!j.batchId||science&&j.status==='unknown')&&(science||!["film","rough"].includes(j.scope))&&!['research','research-recommendation'].includes(j.task))
                    .map((j) => (
                      <div key={j.id} id={'task-'+j.id} className="detail">
                        <b>
                          {j.type === "codex" ? ({'reference-motion':'AI 参考视频分析',diagnosis:'AI 问题分析',translation:'AI 英文口播',narration:'AI 口播',phrasing:'AI 口播断句',rhythm:'AI 节奏脚本',storyboard:'AI 分镜与连续镜头设计',proofs:'AI 效果图',motion:'样镜动画',materials:'AI 素材分析','shot-images':'全片图像素材分析','material-image':'Codex 图片素材','material-supplement':'AI 补充素材'}[j.task]||"Codex 分镜") : j.type==='segments'?(j.mode==='captions'?'仅更新字幕':'分段制作'):j.type==='joined'?'整片合成':j.type==='motion-comparison'?(j.mode==='remake-pair'?'前两段重做样片':'动效候选对照'):j.scope==='rough'?'有声粗剪':j.scope==='film'?'整片导出':"Remotion 样镜"}{" "}
                          · v{j.version}
                        </b>{" "}
                        <em>{tasks.some(next=>next.repairOf===j.id&&next.status==='applied')?'已修复 · 原记录保留':j.task==='diagnosis'&&j.status==='ready'?'分析已完成':statuses[j.status]}</em>
                        {j.status === "awaiting" && (
                          <>
                            <p>{j.terms}</p>
                            <button
                              disabled={
                                busy || dirty || p.version !== j.version
                              }
                              onClick={() =>
                                run(async () => {
                                  await request(
                                    "/api/jobs/" + j.id + "/approve",
                                    { confirm: j.id },
                                  );
                                  J(
                                    await request(
                                      "/api/projects/" + p.id + "/jobs",
                                    ),
                                  );
                                })
                              }
                            >
                              仅确认并提交这一次
                            </button>
                          </>
                        )}
                        {(j.error||j.rhythmGenerationIssue) && <details open={j.version===p.version&&j.status==='failed'||j.status==='unknown'}><summary>{j.version===p.version?'本次任务问题':'历史错误记录（不代表当前结果失败）'}</summary><IssueNotice area="任务记录" job={j} error={j.task==='proofs'&&['unknown','reconciled'].includes(j.status)?proofJobStatus(j,p.version).message:j.rhythmGenerationIssue||j.error}/></details>}
                        {j.recoveryOf&&<p className="muted">已在本地恢复原脚本并通过完整校验；原任务记录保留。</p>}
                        {j.repairOf&&<p className="muted">修复原请求 {j.repairOf.slice(0,8)} · 原结果与记录已保留</p>}
                        {j.task==='diagnosis'&&j.status==='ready'&&j.result?.[0]&&<div className="issue-analysis"><b>AI 分析建议 · 尚未执行</b><p>{j.result[0].cause}</p><ol>{j.result[0].steps.map((s,i)=><li key={i}>{s}</li>)}</ol><p>{j.result[0].needsUser}</p></div>}
                        {j.task==='material-image'&&j.result?.[0]?.src&&<figure className="material-job-image">
                          <img src={j.result[0].src} alt={j.result[0].name}/>
                          <figcaption><a href={j.result[0].src} download={j.result[0].name}>下载这次生成的图片</a></figcaption>
                        </figure>}
                        {directTask(p,j.task) && j.status==='ready' && (dirty || j.version!==p.version) &&
                          <p className="muted">草稿已修改，自动填入已跳过以保留当前内容。本次生成结果仍可在下方查看。</p>}
                        {j.result && j.task!=='diagnosis' && (
                          <details>
                            <summary>
                              查看此版本结果
                            </summary>
                            <TaskResult job={j}/>
                          </details>
                        )}
                        {j.status === "ready" && !isRhythmFallback(j) && j.task!=='diagnosis' && (
                          <button
                            disabled={
                              dirty ||
                              j.version !== p.version ||
                              !j.result.length
                            }
                            onClick={() =>
                              run(async () => {
                                load(
                                  await request(
                                    "/api/jobs/" + j.id + "/apply",
                                    {},
                                  ),
                                );
                                T(j.task==='proofs'?6:['materials','shot-images','material-image','material-supplement','reference-motion'].includes(j.task)?5:['narration','phrasing'].includes(j.task)?4:1);
                              })
                            }
                          >
                            {{'reference-motion':'采用参考视频分析',proofs:'采用这组三张效果图',rhythm:'采用节奏脚本',narration:'采用口播稿',phrasing:'采用新版口播稿',materials:'采用素材分析','shot-images':'采用全片图像分析','material-image':'加入图片素材库','material-supplement':'加入素材库'}[j.task]||'采用分镜'}
                          </button>
                        )}
                        {j.status === "unknown" && (
                          <button
                            onClick={() =>
                              run(async () => {
                                const note = window.prompt(
                                  "请先核对原任务输出或供应方记录，填写核对依据及结果",
                                );
                                if (note)
                                  await request(
                                    "/api/jobs/" + j.id + "/reconcile",
                                    { note },
                                  );
                              })
                            }
                          >
                            记录供应方核对结果
                          </button>
                        )}
                        {j.reconciliation && <p>{j.reconciliation}</p>}
                        {j.items&&<p>范围：{j.items.map(i=>'第 '+(p.shots.findIndex(s=>s.id===i.shotId)+1)+' 段').join('、')} · 已完成 {j.items.filter(i=>i.status==='done').length}/{j.items.length}</p>}
                        {(j.type==='joined'||j.type==='render'&&['rough','film'].includes(j.scope))&&j.output&&<a href={j.output+'film.mp4'} target="_blank" rel="noreferrer">播放完整视频</a>}
                        {j.output && j.type==='render' && !['rough','film'].includes(j.scope) && (
                          <>
                            <div className="inline">
                              {[
                                ["sample.mp4", "播放 MP4"],
                                ["entry.png", "入场"],
                                ["peak.png", "峰值"],
                                ["settled.png", "落定"],
                                ["subtitles.srt", "字幕 SRT"],
                                ["evidence.json", "验收记录"],
                              ].map(([f, t]) => (
                                <a
                                  key={f}
                                  href={j.output + f}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {t} ↗
                                </a>
                              ))}
                            </div>
                            <details>
                              <summary>记录本版本审片结果</summary>
                              <div className="checks">
                                {screening.map((check) => (
                                  <Check
                                    key={check}
                                    text={check}
                                    checked={j.qa?.[check]}
                                    onChange={(pass) =>
                                      run(async () => {
                                        const changed = await request(
                                          "/api/jobs/" + j.id + "/qa",
                                          { check, pass },
                                        );
                                        J((xs) =>
                                          xs.map((x) =>
                                            x.id === j.id ? changed : x,
                                          ),
                                        );
                                      })
                                    }
                                  />
                                ))}
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    ))}
                </details>
              </>
            )}
          </div>
        </main>
      )}
    </IssueContext.Provider>
  );
}
createRoot(document.getElementById("root")).render(
  <React.Suspense
    fallback={
      <p className="loading-state" role="status">
        正在打开工作台…
      </p>
    }
  >
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.Suspense>,
);

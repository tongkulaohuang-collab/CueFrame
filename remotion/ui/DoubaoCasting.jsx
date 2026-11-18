import {IssueNotice} from './IssueNotice';
import React, { useEffect, useRef, useState } from "react";
import {flushSync} from 'react-dom';
import { Input, Select } from "./fields";
import {VoiceBatchAction} from './VoiceBatchAction';
import {VoiceLibrary} from './VoiceLibrary';
import {removeNarration} from '../shared/assets.mjs';
import {voiceStatus} from '../shared/voice-status.mjs';
import {voiceTextIssue} from '../shared/voice-language.mjs';
import {preferredNarrationVoice,voiceNarrationLanguage} from '../shared/narration-language.mjs';
import {generateVoiceBatch,voiceBatchInput,voiceResultError,waitForVoiceResult} from './voice-batch.mjs';

const defaultDirection = "像给身边的人讲解一样，语气自然，随语意停顿。";
const statusLabel = {
  prepared: "已准备", submitted: "已提交，待查询", completed: "已生成",
  needs_review: "结果待核对", failed: "生成失败",
  retry_authorized:"已授权重新生成",
};

export function DoubaoCasting({ p, s, lang, saved, request, run, load, busy, chosen,changeVoiceLanguage,translationPending=false }) {
  const [directory, setDirectory] = useState(null);
  const [directoryError,setDirectoryError]=useState(''),[historyError,setHistoryError]=useState('');
  const [speaker, setSpeaker] = useState(()=>localStorage.getItem('frameboard:voice:'+p.id+':'+lang)||localStorage.getItem('frameboard:voice:'+p.id)||'');
  const [direction, setDirection] = useState(defaultDirection);
  const [records, setRecords] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [error, setError] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [progress,setProgress]=useState(null);
  const [problemRecord,setProblemRecord]=useState(null);
  const current=useRef({p,s,lang,saved,load});current.current={p,s,lang,saved,load};
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const url = "/api/projects/" + encodeURIComponent(p.id) + "/doubao";
  const voice = directory?.voices.find(v => v.speaker_id === speaker);
  const languageIssue=voiceTextIssue(voice,s[lang]);
  const batchLanguageIssue=p.shots.map(shot=>voiceTextIssue(voice,shot[lang])).find(Boolean);
  const visibleRecords=records.filter(r=>r.project===p.id&&r.shot===s.id&&r.lang===lang&&r.text===s[lang]);
  const unresolved=visibleRecords.find(r=>r.speaker===speaker&&['submitted','needs_review'].includes(r.status));
  const musicMissing=p.kind==='science'&&!p.scienceFlow?.analysis;
  const record = visibleRecords.find(r => r.id === activeId)||visibleRecords[0];
  const problem=problemRecord?.speaker===speaker?problemRecord:unresolved||(record?.speaker===speaker&&['submitted','needs_review','failed'].includes(record?.status)?record:null);
  const problemLanguage=problem&&voiceTextIssue(directory?.voices.find(v=>v.speaker_id===problem.speaker),problem.text);
  const availability=voiceStatus(p,lang);
  const shownProgress=progress;
  const scriptMatches = record?.text === s[lang];
  const readyForSubmit = record?.status === "prepared" && scriptMatches && record.version === p.version &&
    record.speaker === speaker && (voice?.kind === "clone" || record.direction === direction);

  useEffect(() => {
    let active = true;
    setDirectoryError('');
    request("/api/doubao/voices").then(value => {
      if (!active) return;
      setDirectory(value);
      setSpeaker(old => preferredNarrationVoice(value.voices,lang,old,value.selectedVoice));
    }).catch(e => { if (active) setDirectoryError("豆包音色未加载。" + e.message); });
    return () => { active = false; };
  }, [request, refresh]);

  useEffect(() => {
    let active = true;
    if (p.version) {
      const query = new URLSearchParams({ shotId: s.id, lang });
      request(url + "?" + query).then(async items => {
        // Refresh known IDs only. A stale local submitted status must not lock the button forever.
        let queryFailure='';
        items=await Promise.all(items.map(async item=>{
          if(!['submitted','needs_review'].includes(item.status))return item;
          try{return await request(url,{action:'check',version:p.version,shotId:item.shot,lang:item.lang,requestId:item.id});}
          catch(e){queryFailure='查询原配音请求失败，显示上次记录。'+e.message;return item;}
        }));
        if (!active) return;
        setHistoryError(queryFailure);
        setRecords(current => [...items, ...current.filter(item => !items.some(r => r.id === item.id))]);
        setActiveId(old => old || items[0]?.id || "");
      }).catch(e => { if (active) setHistoryError('读取配音记录失败。'+e.message); });
    }
    return () => { active = false; };
  }, [url, s.id, lang, s[lang], p.version, request,refresh]);

  function selectRequest(id) {
    setActiveId(id);
  }
  function selectSpeaker(id){
    const nextLang=voiceNarrationLanguage(directory?.voices.find(v=>v.speaker_id===id),lang);
    if(nextLang!==lang&&speaker)localStorage.setItem('frameboard:voice:'+p.id+':'+lang,speaker);
    localStorage.setItem('frameboard:voice:'+p.id+':'+nextLang,id);
    localStorage.setItem('frameboard:voice:'+p.id,id);
    setSpeaker(id);setProblemRecord(null);setProgress(null);setError('');
    if(nextLang!==lang)changeVoiceLanguage?.(nextLang);
  }
  function removeAll(){
    run(async()=>{
      const q=await saved();
      load(await request('/api/projects',removeNarration(q,q.shots.map(shot=>shot.id))));
      setError('');setProgress({done:0,total:q.shots.length,text:'已删除全部配音。选择音色后，点击「重新生成全部配音」。'});
    });
  }
  function receive(item) {
    setRecords(items => [item, ...items.filter(other => other.id !== item.id)]);
    selectRequest(item.id);
  }
  async function useResult(item, expectedVersion) {
    if (!mounted.current || !item.candidate) return;
    const latest=current.current;
    if(latest.p.id!==item.project || latest.s.id!==item.shot || latest.lang!==item.lang ||
      latest.s[item.lang]!==item.text || latest.p.version!==expectedVersion) {
      setError('配音已生成；当前台词或版本已修改，已保留当前内容。');return;
    }
    const q=await latest.saved();
    const next=await request(url,{action:'adopt',version:q.version,shotId:item.shot,lang:item.lang,requestId:item.id});
    if(mounted.current && current.current.p.id===q.id)current.current.load(next);
  }
  function generate(all=false,retry=null,regenerate=false) {
    if(translationPending){setError('请先等待英文口播翻译完成。');return;}
    const issue=all?batchLanguageIssue:languageIssue;
    if(issue){setError(issue);return;}
    run(async()=>{
      setError('');
      const q=await saved();
      try {
        if(retry){const authorized=await request(url,{action:'authorizeRetry',version:q.version,shotId:retry.shot,lang:retry.lang,requestId:retry.id,confirmed:true,acknowledgeUncertain:true});receive(authorized);}
        setProblemRecord(null);
        await generateVoiceBatch({project:q,ids:all?q.shots.map(s=>s.id):[s.id],lang,speaker,skipExisting:all&&!regenerate,
          isCurrent:expected=>mounted.current&&voiceBatchInput(current.current.p,lang)===voiceBatchInput(expected,lang),
          onProgress:setProgress,onSaved:next=>flushSync(()=>current.current.load(next)),
          synthesize:async(project,shot)=>{
            const prepared=await request(url,{action:'prepare',version:project.version,shotId:shot.id,lang,speaker,direction:voice?.kind==='clone'?'':direction});
            if(shot.id===s.id)receive(prepared);
            const body={action:'execute',version:project.version,shotId:shot.id,lang,requestId:prepared.id,confirmed:true,directAuthorization:true};
            let result;
            try {result=await request(url,body);}
            catch(e){
              // Query this ID only; an uncertain submission never starts another take.
              try{result=await request(url,{...body,action:'check'});}catch{
                throw Object.assign(Error(e.message),{voiceResult:{...prepared,status:'submitted',error:e.message}});
              }
              if(!result.candidate&&result.status!=='submitted'){
                if(shot.id===s.id)receive(result);
                throw Object.assign(Error(voiceResultError(result)),{voiceResult:result});
              }
            }
            if(shot.id===s.id)receive(result);
            const finished=await waitForVoiceResult(result,{
              check:()=>request(url,{...body,action:'check'}),
              isCurrent:()=>mounted.current&&voiceBatchInput(current.current.p,lang)===voiceBatchInput(project,lang),
              onStatus:()=>setProgress(v=>v?{...v,text:'本段正在处理，自动查询原请求…'}:v),
            });
            if(shot.id===s.id)receive(finished);
            return finished;
          },
          adopt:(project,shot,result)=>request(url,{action:'adopt',version:project.version,shotId:shot.id,lang,requestId:result.id}),
        });
      } catch(e) {
        if(e.voiceResult){setProblemRecord(e.voiceResult);if(e.voiceResult.shot===s.id)receive(e.voiceResult);}
        setError(e.message);
        setProgress(v=>v?{...v,text:'已暂停：'+e.message}:null);
      }
    });
  }
  function checkProblem(){
    if(!problem)return;
    run(async()=>{
      const result=await request(url,{action:'check',version:p.version,shotId:problem.shot,lang:problem.lang,requestId:problem.id});
      if(!mounted.current||current.current.p.id!==problem.project)return;
      setProblemRecord(result.candidate?null:result);
      if(result.shot===s.id)receive(result);
      if(result.candidate){
        const q=await current.current.saved();
        const next=await request(url,{action:'adopt',version:q.version,shotId:result.shot,lang:result.lang,requestId:result.id});
        if(!mounted.current||current.current.p.id!==problem.project)return;
        current.current.load(next);setError('');setProgress(v=>v?{...v,text:'已恢复本段音频，点击全部生成可继续。'}:null);
      }else{setError(voiceResultError(result));setProgress(v=>({...v,done:v?.done||0,total:v?.total||p.shots.length,text:'已暂停：'+voiceResultError(result)}));}
    });
  }
  function act(action, extra = {}) {
    run(async () => {
      setError("");
      const q = action === "check" ? p : await saved();
      const body = { action, version: q.version, shotId: s.id, lang, requestId: record?.id, ...extra };
      try {
        if (action === "adopt") load(await request(url, body));
        else {const result=await request(url, body);receive(result);if(action==='check')await useResult(result,q.version);}
      } catch (e) {
        setError(e.message);
        if (action === "execute") {
          // Only query the original ID after a transport error; it may already have been submitted.
          try { receive(await request(url, { ...body, action: "check" })); }
          catch { setRecords(items => items.map(item => item.id === activeId ? { ...item, status: "submitted" } : item)); }
        }
      }
    });
  }

  return <div className="doubao-casting">
    <div className="inline voice-selection">
      <Select title="选择配音音色" value={speaker} disabled={busy||!directory} onChange={selectSpeaker}
        options={(directory?.voices || []).map(v => [v.speaker_id, v.name + ' · ' + (v.kind === "clone" ? "本人音色" : v.languages?.includes('中文')?'中文':v.languages||'语种待确认')])}/>
      <button type="button" aria-expanded={managerOpen} onClick={() => {
        setManagerOpen(!managerOpen);
        if (managerOpen) setRefresh(n => n + 1);
      }}>{managerOpen ? "完成音色管理" : "管理自定义音色"}</button>
    </div>
    {directory&&<p className="muted voice-selection-status">当前选择：{voice?.name||'请选择音色'} · {directory.voices.length} 个音色可选。下方列表可逐个试听。</p>}
    {languageIssue&&<IssueNotice area="音色语言" error={languageIssue}/>}
    {!directory&&!directoryError&&<p role="status">正在加载音色列表…</p>}
    {directoryError&&<IssueNotice area="豆包音色列表" error={directoryError} summary={directoryError} onRetry={()=>setRefresh(v=>v+1)} retryLabel="重新读取音色"/>}
    {historyError&&<IssueNotice area="配音请求状态" error={historyError} summary={historyError} onRetry={()=>setRefresh(v=>v+1)} retryLabel="重新查询原请求"/>}
    {p.kind==='science'&&<VoiceBatchAction count={p.shots.length} available={availability.done} progress={shownProgress}
      onCheck={problem?checkProblem:undefined} onRetry={problem?.status==='needs_review'?()=>generate(true,problem):undefined}
      checkingDisabled={busy} onRegenerate={()=>generate(true,null,true)} onRemove={removeAll}
      removeDisabled={busy||!p.shots.some(shot=>shot.assetIds.some(id=>p.assets.some(a=>a.id===id&&['zh','en'].includes(a.role))))}
      disabled={busy||translationPending||musicMissing||!directory?.configured||!voice||!!batchLanguageIssue||p.shots.some(s=>!s[lang]?.trim())} onClick={()=>generate(true)}/>}
    {p.kind==='science'&&<p className="muted">删除后可反复重新生成，历史录音可恢复。重新生成会使用当前音色，按豆包账户计费。</p>}
    {problem&&<details className="voice-history-problem"><summary>历史配音请求{unresolved?'待核对':'未完成'} · 不影响当前已采用录音</summary><IssueNotice area="豆包配音" job={problem} error={problemLanguage||voiceResultError(problem)} onRetry={checkProblem} retryLabel="查询原配音请求"/></details>}
    {managerOpen && <iframe className="doubao-manager" title="管理我的豆包音色" src={'/voice?frameboard=voices&project='+encodeURIComponent(p.id)}/>}
    {directory && !directory.configured && <p role="status">在「管理自定义音色」的连接设置中填写豆包语音密钥。</p>}
    {musicMissing&&<p role="status">请先在上方「背景音乐」选择 BGM 并分析节奏，再生成配音。</p>}
    {error && <IssueNotice area="豆包配音" error={error} job={problem} onRetry={problem?checkProblem:undefined} retryLabel="查询原配音请求"/>}
    {directory&&<VoiceLibrary {...{directory,speaker,request,lang}} onSelect={selectSpeaker} disabled={busy}/>}
    <details className="voice-single-settings"><summary>仅重做当前段 · 讲述语气与配音记录</summary>
    {voice?.kind === "clone" ? <p className="muted">按本人录音的语气配音。正式合成前请核对这个音色槽位的费用。</p> :
      <Input title="讲述语气" value={direction} disabled={busy} onChange={setDirection} maxLength={500}/>}
    <div className="doubao-script"><small>{lang === "zh" ? "中文" : "英文"} · 本镜台词</small>
      <p>{s[lang] || "先在分镜里填写这个语言的台词。"}</p></div>
    <p className="muted">选择音色后直接生成，自动使用当前台词并保存音频。点击即提交本次配音，用量按豆包账户计费；本机无法读取账户剩余额度。</p>
    <button disabled={busy || translationPending || musicMissing || !directory?.configured || !voice || !!languageIssue || !s[lang]?.trim() ||
      !!unresolved}
      onClick={()=>generate(false)}>{busy?'正在处理配音…':chosen?'重新生成本段配音':'生成本段配音'}</button>
    {unresolved&&<div className="voice-recovery" role="status"><p>原请求尚待核对。可删除已采用的配音；再次生成前请查询原请求。</p>
      <button disabled={busy} onClick={checkProblem}>查询原配音状态</button>
      {unresolved.status==='needs_review'&&<><p className="muted">重新提交可能重复计费。</p><button disabled={busy||translationPending||musicMissing||!voice||!!languageIssue} onClick={()=>generate(false,unresolved)}>已核对原请求，重新生成本段</button></>}
    </div>}
    {visibleRecords.length > 0 && <div className="doubao-takes">
      <Select title="当前台词的配音记录" value={record?.id||''} onChange={selectRequest}
        options={visibleRecords.map(r => [r.id, r.label + " · " + statusLabel[r.status] + " · " + r.id.slice(0, 8)])}/>
      {record && <div className="doubao-take">
        <strong>{record.label} · {record.characters} 字</strong>
        <p>{record.text}</p>
        {record.error && <IssueNotice area="配音记录" job={record} error={record.error} onRetry={()=>act('check')} retryLabel="查询原请求"/>}
        {record.status === "prepared" && <p className="muted">{readyForSubmit?'本次请求已准备，点击上方生成即可继续。':'草稿或台词已变化，点击生成会按当前内容准备新请求。'}</p>}
        {["submitted", "needs_review"].includes(record.status) && <p className="muted">请查询这条请求，并核对豆包控制台记录。</p>}
        {!record.candidate && <button disabled={busy} onClick={() => act("check")}>查询原请求</button>}
        {record.candidate && <>
          <audio controls preload="none" src={record.candidate.src} aria-label="本镜豆包试听"/>
          <p className="muted">{record.candidate.duration.toFixed(2)} 秒 · {record.candidate.segments?.length
            ? "已按本次字幕起止对齐" : "缺少可用字幕时间，可手动标记"}</p>
          <button disabled={busy || !scriptMatches || chosen?.id === record.candidate.id}
            onClick={() => act("adopt")}>{chosen?.id === record.candidate.id ? "本段正在使用" : "切换到这条配音"}</button>
          {!scriptMatches && <p className="muted">台词已修改，请为新台词准备试听。</p>}
        </>}
      </div>}
    </div>}
    </details>
  </div>;
}

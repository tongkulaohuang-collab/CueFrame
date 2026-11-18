import {lemoStyle,lemoLinks} from './lemo.mjs';
import {referenceUrls} from './references.mjs';
import {LIBRARY_VERSION} from './motion-library.mjs';
export const REFERENCE_MOTION_VERSION=1;
export function motionReferences(p){
 const f=p.scienceFlow||{},items=[],style=lemoStyle(f.lemoStyleId);
 if(style)items.push({id:'lemo-'+style.slug,name:style.cn+' · 风格样片',url:lemoLinks(style).preview});
 for(const a of p.assets||[])if(a.kind==='video'&&a.role==='reference')items.push({id:a.id,name:a.name,src:a.src,confirmed:!!a.confirmed,source:a.source||'',license:a.license||''});
 for(const url of referenceUrls([f.referenceVideoUrls,f.template].filter(Boolean).join('\n')))if(!items.some(r=>r.url===url))items.push({id:'url-'+encodeURIComponent(url),name:url,url});
 return items;
}
export const referenceMotionKey=r=>JSON.stringify([REFERENCE_MOTION_VERSION,r]);
export function currentReferenceReports(p){return motionReferences(p).flatMap(r=>{
 const report=p.scienceFlow?.referenceMotion?.find(a=>a.referenceId===r.id&&a.inputKey===referenceMotionKey(r));
 return report?[report]:[];
});}
export function referenceAttempt(ref,report,history,version) {
 const key=referenceMotionKey(ref);
 const matches=r=>r?.referenceId===ref.id&&r.inputKey===key;
 const reviewedAttempt=j=>({label:report.segments.length?'人工审核已完成':'已去掉全部时段',reviewed:true,job:j});
 for(const j of history){
  const pending=j.referenceReports?.find(matches)||j.result?.find(matches);
  const current=j.referenceProgress?.inputKey?j.referenceProgress.inputKey===key:
   j.referenceProgress?.current===ref.name&&j.version===version;
  const issue=matches(j.referenceIssue)?j.referenceIssue:null;
  if(!current&&!issue&&!pending)continue;
  if(j.status==='applied'){
   // Applying a later batch can reuse a manually completed reference.
   if(report?.reviewJobId&&pending?.reviewJobId===report.reviewJobId){
    const source=history.find(item=>item.id===report.reviewJobId&&item.referenceIssue?.review?.key===report.reviewKey);
    if(source)return reviewedAttempt(source);
   }
   break;
  }
  if(j.status==='reconciled'&&!pending)return {label:report?'已分析 · 上次请求已核对':'原请求已核对，尚无完整分析',job:j};
  if(issue||current&&['failed','unknown'].includes(j.status)&&!pending){
   if(report?.reviewJobId&&report.reviewJobId===j.id&&report.reviewKey===issue?.review?.key)return reviewedAttempt(j);
   return {label:j.status==='unknown'?'结果待核对':'分析未通过',issue:issue||{reason:j.error},job:j};
  }
  if(pending){
   if(['failed','unknown','reconciled','cancelled'].includes(j.status))return {label:'已分析 · 整批中断，结果已保留',job:j};
   return {label:j.status==='ready'&&j.version!==version?'已分析 · 旧版结果':'已分析 · 等待整批采用',job:j};
  }
  if(current&&j.status==='running')return {label:j.referenceProgress.phase||'正在分析',job:j};
 }
 return {label:report?'已分析':'待分析'};
}
export function referenceAnalysisNeeds(p){const reports=currentReferenceReports(p);return motionReferences(p).filter(r=>!reports.some(a=>a.referenceId===r.id)).map(r=>'分析参考视频：'+r.name);}
export function referenceScriptKey(p){const f=p.scienceFlow||{};return JSON.stringify([LIBRARY_VERSION,...(p.contentBrief?[p.contentBrief]:[]),...((p.shots||[]).some(s=>s.semanticScene)?[(p.shots||[]).map(s=>[s.id,s.semanticScene])]:[]),f.style||'',f.template||'',f.lemoStyleId||'',motionReferences(p).map(referenceMotionKey),currentReferenceReports(p).map(r=>[r.referenceId,r.mediaHash,r.segments,r.summary,...(r.appearance?[r.appearance]:[])]),
 p.fps,p.voice,p.language,f.bgmId,f.analysis,p.shots?.map(s=>[s.id,...(p.language==='sequential'||p.language==='separate'?[s.zh,s.en]:[s[p.voice]]),s.seconds,
   ...(p.language==='sequential'||p.language==='separate'?[s.subtitleTracks]:[s.subtitleTracks?.[p.voice]]),
   s.assetIds?.filter(id=>p.assets?.some(a=>a.id===id&&a.kind==='audio'))]),
 p.assets?.filter(a=>a.id===f.bgmId||a.kind==='audio'&&p.shots?.some(s=>s.assetIds?.includes(a.id))).map(a=>[a.id,a.src,a.duration,a.segments,a.scriptText])]);}
export function referenceScriptNeeds(p){
 const missing=referenceAnalysisNeeds(p);if(missing.length)return missing;
 if((motionReferences(p).length||p.scienceFlow?.referenceScript?.explanationVersion===1)&&(p.scienceFlow?.referenceScript?.inputs!==referenceScriptKey(p)||p.scienceFlow?.referenceScript?.text!==p.scienceFlow?.rhythm))return ['按当前声音、参考分析和动效库重新编写节奏脚本'];
 return [];
}
export const referenceMotionContext=p=>({
 references:currentReferenceReports(p).filter(r=>r.segments.length),
 applications:p.scienceFlow?.referenceScript?.inputs===referenceScriptKey(p)?p.scienceFlow.referenceScript.applications||[]:[],
});
export const referenceScriptInstructions='写脚本前先完整读取 referenceMotion.references 中每个视频的带时间码分析，再读取 autoMotionLibrary 的真实效果、参数范围和模板。逐镜以参考片的具体时段说明借鉴的运动、速度变化、停留、文字显现、转场和镜头衔接，将它们适配到当前台词和实际声音；不要只复述风格名称或配色。输出 referenceDecisions，对每个参考明确 applied 或 not_applicable，并写清当前解释任务、值得借鉴的机制或不适用原因。仅对 applied 输出 referenceApplications，说明参考时段、本片时段、effectIds、customMotion 与 adaptation。必须完整分析所有选定参考，但不得轮流分摊、强行套用不相关的动作。库中没有适合的动效时，可在 customMotion 写清对象路径、起止、缓动和实现方式，后续用原生 frames/paths/cameraShots 实现；不可虚构库 ID。无参考视频时输出空数组。输出 libraryVersion 为当前 autoMotionLibrary.version。保留当前声音时间，不照搬参考片的总时长或未经核实的内容。';

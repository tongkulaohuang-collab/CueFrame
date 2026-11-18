import {isAuthoredProcess,isModelProcess} from './production-mode.mjs';
import {timeline} from './model.mjs';
import {motionAt,validateMotion} from './motion-plan.mjs';
import {compileSemanticScene,semanticFamilies,semanticStyles} from './semantic-scenes.mjs';
import {cameraAt} from './camera-plan.mjs';
import {MOTION_DESIGN_VERSION,motionImageAsset,nodeRoles} from './motion-dynamics.mjs';
import {shotImagePlan} from './shot-images.mjs';
import {explanationBeats,validateExplanationEvidence} from './explanation-plan.mjs';
import {worldState,screenPoint} from './actor-rig.mjs';
import {performanceRequirements,validatePerformance} from './performance-plan.mjs';
import {actionTiming} from './action-timing.mjs';
import {semanticOptions} from './semantic-context.mjs';
import {visualStyleContext} from './film-style.mjs';
import {nodePathBounds} from './coverage-geometry.mjs';
import {stateActionStages} from './action-stages.mjs';

export const DIRECTOR_REVIEW_VERSION=2;
export const usesDirectorDesign=p=>p.kind==='science'&&!!p.scienceFlow&&!isAuthoredProcess(p);
export const needsDirectorReview=p=>usesDirectorDesign(p)||isModelProcess(p);
export const styleAspectNames={composition:'构图',material:'素材与质感',rhythm:'动作节奏'};
const hash=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
export function actionRequirements(p,shotId,row=timeline(p).rows.find(r=>r.shot.id===shotId)) {
  if(!row)return [];
  const start=row.from/p.fps,end=(row.from+row.frames)/p.fps;
  const result=[];
  for(const source of String(p.scienceFlow?.rhythm||'').split(/\r?\n/)) {
    // Shared explicit action rows, also understood by the existing v60 script.
    // No LLM self-report may silently replace or remove these source rows.
    const m=/^\s*[•*\-]?\s*(\d+(?:\.\d+)?)(?:\s*[—–-]\s*(\d+(?:\.\d+)?))?\s*[｜|].*?[｜|]对象\s*[=：:]\s*(.+?)[｜|]动作\s*[=：:]\s*(.+)$/.exec(source);
    if(!m)continue;
    const at=Number(m[1]);if(at<start-.001||at>=end-.001)continue;
    const action=m[4].split(/[；;]\s*music-onset/)[0].trim();
    const explicit=/[｜|]形式=(motion|draw|reveal|hold)/.exec(action)?.[1];
    const plain=action.replace(/[｜|]形式=.*/,'');
    const technique=explicit||(/移项|沿圆周运动|完成一圈|进入分[子母]|下落|穿过|通过通道/.test(plain)?'motion':
      /删除线|下划线|连通|连接闭环/.test(plain)?'draw':/保持|静止展示|不新增/.test(plain)?'hold':'change');
    const eventId=/[｜|]eventId=([\w-]{1,60})(?=[｜|])/.exec(source)?.[1];
    if(eventId&&result.some(r=>r.id==='action-'+eventId))throw Error('同一镜头的 eventId 不得重复：'+eventId);
    result.push({id:eventId?'action-'+eventId:'action-'+hash(source.trim()),at:Math.max(0,at-start),until:m[2]?Math.min(end,Number(m[2]))-start:null,
      object:m[3].trim(),action:plain,technique,source:source.trim()});
  }
  return result;
}
export function designInputKey(p,shotId) {
  if(isModelProcess(p)){const s=p.shots.find(s=>s.id===shotId);return JSON.stringify(['model-process',s?.semanticScene,p.filmStyle,visualStyleContext(p),s?.semanticSync,s?.voiceAlignment,s?.handoff,p.width,p.height,p.fps,timeline(p).rows.find(r=>r.shot.id===shotId)?.frames]);}
  return JSON.stringify([p.scienceFlow?.lemoStyleId||'',p.scienceFlow?.style||'',p.scienceFlow?.template||'',
    actionRequirements(p,shotId),p.width,p.height,p.fps,...(p.shots.find(s=>s.id===shotId)?.semanticScene?[p.shots.find(s=>s.id===shotId).semanticScene]:[]),...(explanationBeats(p,shotId).length?[explanationBeats(p,shotId)]:[]),
    ...(performanceRequirements(p,shotId).length?[performanceRequirements(p,shotId)]:[])]);
}
export function needsMotionDesignUpdate(p,shotId) {
  const plan=p.shots?.find(s=>s.id===shotId)?.motionPlan;
  return usesDirectorDesign(p)&&Boolean(plan&&
    (plan.designVersion!==MOTION_DESIGN_VERSION||plan.designInputs!==designInputKey(p,shotId)));
}
function samples(plan,node,from,until) {
  const hasInk=node.media||node.text&&node.text.color!=='none'||node.paths.some(p=>p.fill!=='none'||p.stroke!=='none'&&p.strokeWidth>0);
  const times=new Set([from,until,...node.frames.filter(f=>f.time>=from&&f.time<=until).map(f=>f.time)]);
  for(let i=1;i<16;i++)times.add(from+(until-from)*i/16);
  return [...times].sort((a,b)=>a-b).map(time=>{
    const bounds=nodePathBounds(node,time,plan),point=bounds?{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}:node.rig?.pivot;
    const state=worldState(plan,time),f=state.get(node.id),p=state.point(node.id,point),c=cameraAt(plan,time),{x,y}=screenPoint(plan,c,p);
    return {...f,x:p.x,y:p.y,time,visible:!!hasInk&&f.visibleOpacity>.1&&f.reveal>.05&&f.textProgress>.05&&x>0&&x<plan.width&&y>0&&y<plan.height*.88};
  });
}
const missingActivity = '所列对象没有相应的可见运动、描线或显现';
function continuesHold(plan,node,e,r) {
  if(r.technique!=='hold'||r.until==null||r.until-r.at>=.2||e.from>r.at+.001||e.until<r.until-.001||e.until<.2)return false;
  const values=samples(plan,node,Math.min(e.from,e.until-.2),e.until),first=values[0];
  return values.every(v=>v.visible&&v.visibleOpacity>=.5&&v.textValue===first.textValue&&
    Math.abs(v.x-first.x)<=.5&&Math.abs(v.y-first.y)<=.5&&
    ['rotation','scaleX','scaleY','draw','morph','reveal','textProgress'].every(key=>Math.abs((v[key]??1)-(first[key]??1))<.01));
}
function activity(plan,n,from,until) {
  const all=samples(plan,n,from,until),seen=all.filter(f=>f.visible),span=k=>Math.max(...seen.map(f=>f[k]??1))-Math.min(...seen.map(f=>f[k]??1));
  if(!seen.length)return {visible:false,motion:false,draw:false,reveal:false,hold:false};
  const morph=Object.keys(seen[0].morphByPath||{}).some(key=>Math.max(...seen.map(v=>v.morphByPath[key]))-Math.min(...seen.map(v=>v.morphByPath[key]))>=.15);
  return {visible:true,motion:span('x')>=plan.width*.015||span('y')>=plan.height*.015||span('rotation')>=8||span('scaleX')>=.08||span('scaleY')>=.08||morph||span('mediaZoom')>=.05||span('focusX')>=2||span('focusY')>=2||new Set(seen.map(f=>f.textValue)).size>1,
    draw:n.paths.some(p=>p.stroke!=='none'&&p.strokeWidth>0)&&span('draw')>=.25,
    reveal:Math.max(...all.map(f=>f.opacity))-Math.min(...all.map(f=>f.opacity))>=.5||span('draw')>=.5||Math.max(...all.map(f=>f.reveal))-Math.min(...all.map(f=>f.reveal))>=.5||Math.max(...all.map(f=>f.textProgress))-Math.min(...all.map(f=>f.textProgress))>=.5,
    hold:seen.length>=3&&until-from>=.2};
}
export function designReport(p,shotId,plan=p.shots.find(s=>s.id===shotId)?.motionPlan,{newResult=false}={}) {
  if(isModelProcess(p)) {
    const scene=p.shots.find(s=>s.id===shotId)?.semanticScene,issues=[],row=timeline(p).rows.find(r=>r.shot.id===shotId);
    try {validateMotion(compileSemanticScene(scene,semanticOptions(p,row.shot,row)));}
    catch(error){issues.push(error.message);}
    const family=semanticFamilies.find(f=>f.id===scene?.family),theme=semanticStyles[scene?.style];
    const requirement={id:'model-'+shotId,at:0,until:row?.frames/p.fps||0,object:scene?.title||family?.name||'内容模型',
      action:'连续检查输入数值、对象关系和结果是否一致；变化能看懂，结果有足够阅读时间。',technique:'change'};
    return {mode:'content-model',requirements:[requirement],actions:[{...requirement,problem:issues[0]||''}],
      style:[{aspect:'composition',label:'构图',evidence:{description:'固定参照尺度，画面来自同一内容模型；实际排版在渲染时逐帧检查。'}},
        {aspect:'material',label:'素材与质感',evidence:{description:theme?.name||'风格待选择'}},
        {aspect:'rhythm',label:'动作节奏',evidence:{description:'本地模型按本段时长运行；是否契合解说仍须连续观看和听审。'}}],
      boundary:family?.limit,issues};
  }
  plan=shotImagePlan(plan,p.shots.find(s=>s.id===shotId)?.imageBindings);
  const requirements=actionRequirements(p,shotId),issues=[],actions=[],style=[];
  if(!requirements.length)issues.push('脚本动作：这一段缺少可核对的动作行，请在节奏脚本中列出时间、对象与动作后重新制作');
  if(!plan)return {requirements,actions,style,issues:[...issues,'动作设计：这一段尚未制作动画']};
  if(plan.nodes.some(n=>!nodeRoles.includes(n.role)))issues.push('动作设计：须区分主体、机制、素材与装饰的用途');
  if(!newResult&&(plan.designVersion!==MOTION_DESIGN_VERSION||plan.designInputs!==designInputKey(p,shotId)))
    issues.push('动作设计：这是旧版或已变更脚本的画面，尚未逐项核对动作与风格，请重新制作');
  const entries=Array.isArray(plan.actionEvidence)?plan.actionEvidence:[],ids=new Set(),diagnostics=[];
  for(const [index,e] of entries.entries()) {
    if(!e||ids.has(e.requirementId)||!requirements.some(r=>r.id===e.requirementId)) {
      issues.push('脚本动作：动作记录重复或引用了不存在的脚本要求');
      diagnostics.push({path:`motion.actionEvidence[${index}].requirementId`,message:`${e?.requirementId} 重复或不存在；每条脚本动作只保留一条记录，组合阶段放在 explanationEvidence。`});
    }
    ids.add(e?.requirementId);
  }
  const beats=explanationBeats(p,shotId),performance=performanceRequirements(p,shotId),structuredIssues=[];
  try {validateExplanationEvidence(plan,beats);}catch(error){structuredIssues.push(error.message);}
  try {validatePerformance(plan,performance,{fps:p.fps,speech:actionTiming(p,shotId).speech,beats});}catch(error){structuredIssues.push(error.message);}
  const evidenceNodes=e=>Array.isArray(e?.nodeIds)&&e.nodeIds.length&&e.nodeIds.length<=24&&new Set(e.nodeIds).size===e.nodeIds.length?
    e.nodeIds.map(id=>plan.nodes.find(n=>n.id===id)):[];
  const validRange=e=>Number.isFinite(e?.from)&&Number.isFinite(e?.until)&&e.from>=0&&e.until<=plan.duration+.0001&&e.until>e.from;
  for(const r of requirements) {
    const e=entries.find(e=>e?.requirementId===r.id),nodes=evidenceNodes(e);let problem='';
    const stages=!structuredIssues.length&&stateActionStages(r,e,plan,{actions:requirements,beats,requirements:performance});
    let field='',detail='';
    if(!e)problem='没有实现记录';
    else if(!validRange(e)||e.from>r.at+.5||e.until<r.at-.5||r.until!=null&&e.until<r.until-.5)problem='动作时间没有覆盖脚本要求';
    else if(!nodes.length||nodes.some(n=>!n||n.role==='decoration'))problem='没有关联有效主体，不能用装饰替代动作';
    else if(!['motion','draw','reveal','hold'].includes(e.technique)||
      (r.technique!=='change'&&r.technique!==e.technique&&!(stages&&stages.some(s=>s.technique===e.technique)&&e.technique!=='hold'))) {
      problem='实现方式与脚本动作不符';field='technique';
      detail=`脚本要求 ${r.technique}，实际记录 ${String(e.technique)}；只有完整绑定并通过真实状态校验的 state 动作可逐阶段使用不同形式。`;
    }
    else if(typeof e.note!=='string'||!e.note.trim()||e.note.length>500)problem='缺少可复看的动作说明';
    else if(!stages) {
      const failed=nodes.filter(n=>!activity(plan,n,e.from,e.until)[e.technique]&&!(e.technique==='hold'&&continuesHold(plan,n,e,r)));
      if(failed.length){problem=missingActivity;field='nodeIds';detail=`${e.from}–${e.until} 秒，${failed.map(n=>n.id).join('、')} 未检测到 ${e.technique}。辅助静态节点不列入执行对象；组合状态须完整关联上游部件与逐阶段证据。`;}
    }
    const item={...r,evidence:e||null,problem,...(stages?{stages,validationMode:'verified-state-stages'}:{})};actions.push(item);
    if(problem) {
      issues.push(`脚本动作：${r.at.toFixed(2)} 秒「${r.object} · ${r.action}」${problem}`);
      diagnostics.push({path:e?`motion.actionEvidence[${entries.indexOf(e)}]${field?'.'+field:''}`:'motion.actionEvidence',message:`${r.id}：${detail||problem}`});
    }
  }
  const directions=Array.isArray(plan.styleEvidence)?plan.styleEvidence:[];
  const selected=p.scienceFlow?.lemoStyleId||'custom';
  if(plan.styleId!==selected)issues.push('风格落实：动画没有对应当前选定的风格');
  if(directions.length!==3||new Set(directions.map(e=>e?.aspect)).size!==3)issues.push('风格落实：须分别记录构图、素材与质感、动作节奏');
  for(const aspect of Object.keys(styleAspectNames)) {
    const e=directions.find(e=>e?.aspect===aspect),nodes=evidenceNodes(e);let problem='';
    if(!e||!validRange(e)||typeof e.description!=='string'||!e.description.trim()||e.description.length>500)problem='缺少可定位的风格实现';
    else if(!nodes.length||nodes.some(n=>!n)||!nodes.some(n=>n.role!=='decoration'&&activity(plan,n,e.from,e.until).visible))problem='只有说明或装饰，没有对应的可见内容';
    else if(aspect==='rhythm'&&!nodes.some(n=>{const a=activity(plan,n,e.from,e.until);return a.motion||a.draw||a.reveal;}))problem='没有实际动作节奏变化';
    else if(selected==='kino-montage'&&aspect==='composition'&&!nodes.some(n=>n.role!=='decoration'&&samples(plan,n,e.from,e.until).some(f=>f.visible&&Math.abs(f.rotation)>=2)))problem='蒙太奇风格缺少主体或内容层的斜向构图';
    else if(selected==='kino-montage'&&aspect==='material'&&nodes.filter(n=>n.role!=='decoration'&&activity(plan,n,e.from,e.until).visible).length<2)problem='蒙太奇风格缺少可见的多层拼贴，不能只保留配色与红条';
    if(nodes.some(n=>n?.media&&!motionImageAsset(p,n.media.assetId)))problem='引用图片缺失或来源、使用条件未确认';
    style.push({aspect,label:styleAspectNames[aspect],evidence:e||null,problem});
    if(problem)issues.push(`风格落实：${styleAspectNames[aspect]}${problem}`);
  }
  issues.push(...structuredIssues);
  return {requirements,actions,style,diagnostics,issues:[...new Set(issues)]};
}
export function validateDesignEvidence(plan,p,shotId) {
  const report=designReport(p,shotId,plan,{newResult:true});
  if(report.issues.length) {
    const gaps=report.actions.filter(a=>a.problem===missingActivity);
    throw Object.assign(Error(report.issues.join('；')),{
      code:'DIRECTOR_DESIGN_INCOMPLETE',
      ...(report.diagnostics?.length?{issues:report.diagnostics}:{}),
      materialEntrances:gaps.length===report.issues.length?gaps.map(a=>a.evidence.requirementId):[],
    });
  }
  plan.designVersion=MOTION_DESIGN_VERSION;plan.designInputs=designInputKey(p,shotId);
  return report;
}

// Playback observations are kept separately from the explicit human checks.
// Seeking, speed changes, pauses and long event gaps cannot fill watched time.
export function observePlayback(state,sample) {
  const next={ranges:(state?.ranges||[]).map(r=>[...r]),last:sample},last=state?.last;
  if(!last||!last.playing||sample.seeking||last.seeking||sample.rate!==1||last.rate!==1)return next;
  const dt=sample.time-last.time,wall=(sample.wall-last.wall)/1000;
  if(dt<=0||dt>1.5||wall<=0||dt>wall*1.35+.15)return next;
  const start=last.time<.12?0:last.time,end=sample.time;
  const sorted=[...next.ranges,[start,end]].sort((a,b)=>a[0]-b[0]);next.ranges=[];
  for(const range of sorted){const tail=next.ranges.at(-1);if(tail&&range[0]<=tail[1]+.08)tail[1]=Math.max(tail[1],range[1]);else next.ranges.push(range);}
  return next;
}
export function playbackComplete(ranges,duration) {
  if(!Array.isArray(ranges)||!Number.isFinite(duration)||duration<=0||ranges.length>500)return false;
  let end=0;
  for(const r of ranges) {
    if(!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]<0||r[1]<r[0]||r[1]>duration+.5||r[0]>end+.12)return false;
    end=Math.max(end,r[1]);
  }
  return end>=duration-Math.min(.3,duration*.05);
}
export function directorReviewIssues(p,shotId,review,duration) {
  if(!needsDirectorReview(p))return [];
  const report=designReport(p,shotId),issues=[...report.issues];
  if(review?.decision!=='approved'||review?.directorVersion!==DIRECTOR_REVIEW_VERSION||review?.designInputs!==designInputKey(p,shotId))
    issues.push('导演检查：这段尚未通过当前声音、画面与文字检查');
  if(!playbackComplete(review?.watched,duration))issues.push('导演检查：请以正常速度完整观看这一段，拖动进度或倍速不能代替连续检查');
  if(!Array.isArray(review?.actions)||!report.requirements.every(r=>review.actions.includes(r.id)))issues.push('导演检查：请逐项确认脚本里的关键动作实际可见');
  if(!review?.audioChecked)issues.push('导演检查：请实际听完本段，确认语句连续、无异常断裂或重复，音乐没有盖过人声');
  if(!review?.styleChecked||!review?.captionsChecked)issues.push('导演检查：请核对画面主次、文字层级、退出时序及遮挡');
  return [...new Set(issues)];
}

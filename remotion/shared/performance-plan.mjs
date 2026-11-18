import {sampleMotion} from './motion-dynamics.mjs';
import {worldState,worldPoint,screenPoint} from './actor-rig.mjs';
import {cameraAt} from './camera-plan.mjs';
import {nodeVisualState,revealedRegion} from './graphics-state.mjs';
import {morphGeometryBounds,coverageBoundsIssue} from './coverage-geometry.mjs';
import {measuredReadingPause} from './action-timing.mjs';

export const PERFORMANCE_VERSION=1;
export const MIN_COVERAGE_PIXELS=8;
export const performanceKinds=['rigid','hold','state','articulated','locomotion','contact','hinge'];
const fail=(s,issues)=>{throw Object.assign(Error('动作表演：'+s),{code:'PERFORMANCE_INVALID',...(issues?.length?{issues}:{})});};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const span=values=>Math.max(...values)-Math.min(...values);
const pointOK=p=>p&&typeof p.nodeId==='string'&&[p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<16384);
export const performanceRequirements=(p,id)=>(p.scienceFlow?.referenceScript?.performanceRequirements||[]).filter(r=>r.shotId===id);
export function validatePerformanceRequirements(requirements,context) {
  if(!Array.isArray(requirements)||!requirements.length||requirements.length>240)fail('节奏脚本缺少动作类型与能力要求，请重新生成节奏脚本');
  const seen=new Map();
  for(const r of requirements) {
    const shot=context.find(s=>s.shotId===r.shotId),cue=shot?.speech.find(c=>c.id===r.cueId);
    const readingPause=r?.kind==='hold'&&r.cueId==='design'&&shot&&
      shot.actions.some(a=>a.id===r.actionId&&a.technique==='hold')&&measuredReadingPause(shot.speech,r.from,r.until);
    if(Array.isArray(r?.dependsOn)&&r.dependsOn.some(id=>seen.has(id)&&seen.get(id).shotId!==r.shotId))
      fail(r.id+' 的动作依赖跨越镜头；跨镜承接应写入 explanationBeats.dependsOn，本镜动作只能依赖本镜已完成的动作');
    if(!r||typeof r.id!=='string'||!/^[\w-]{1,60}$/.test(r.id)||seen.has(r.id)||!shot||!shot.actions.some(a=>a.id===r.actionId)||
      !performanceKinds.includes(r.kind)||typeof r.actorId!=='string'||!r.actorId||!Array.isArray(r.partIds)||
      new Set(r.partIds).size!==r.partIds.length||r.partIds.some(id=>typeof id!=='string'||!id)||
      ![r.from,r.until].every(Number.isFinite)||r.from<0||r.until<=r.from||r.until>shot.duration+.001||
      (!cue&&!readingPause)||!Array.isArray(r.dependsOn)||r.dependsOn.some(id=>!seen.has(id)||seen.get(id).shotId!==r.shotId||seen.get(id).until>r.from+.001)||
      typeof r.note!=='string'||!r.note.trim())fail((r?.id||'未命名')+' 的动作类型、时间、语音或依赖无效');
    if(['state','articulated','locomotion','contact','hinge'].includes(r.kind)&&!r.partIds.length)fail(r.id+' 未指出需要变化的部件');
    if(r.kind==='locomotion'&&r.partIds.length<2)fail(r.id+' 行走必须明确至少两个交替支撑部件');
    seen.set(r.id,r);
  }
  for(const s of context)for(const a of s.actions)if(!requirements.some(r=>r.shotId===s.shotId&&r.actionId===a.id))fail(a.id+' 缺少类型化动作要求');
  return requirements;
}
export function eventTimes(from,until,fps,extra=[]) {
  const times=new Set([from,until,...extra.filter(t=>t>=from&&t<=until)]);
  for(let f=Math.ceil(from*fps);f<until*fps;f++)times.add(f/fps);
  return [...times].sort((a,b)=>a-b);
}
function projectedBox(plan,time,target) {
  const state=worldState(plan,time),camera=cameraAt(plan,time);
  const node=plan.nodes.find(n=>n.id===target.nodeId),visible=revealedRegion(node,time,plan,target);
  const points=[{x:target.x,y:target.y},{x:target.x+target.width,y:target.y},{x:target.x,y:target.y+target.height},{x:target.x+target.width,y:target.y+target.height}]
    .map(p=>screenPoint(plan,camera,state.point(target.nodeId,p)));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const value=state.get(target.nodeId);
  return {x:Math.min(...xs),y:Math.min(...ys),width:span(xs),height:span(ys),opacity:value.visibleOpacity*value.textProgress,
    clipped:visible.width<target.width-.5||visible.height<target.height-.5};
}
export function coverageIssues(plan,event,time,measured) {
  const issues=[];
  for(const target of coverageTargets(event,time)) {
    if(!measured){const issue=coverageBoundsIssue(target,morphGeometryBounds(plan.nodes.find(n=>n.id===target.nodeId),time,plan));if(issue)issues.push(issue);}
    const b=measured?.get(target)||projectedBox(plan,time,target);
    if(b.clipped||b.opacity<.2||b.x<plan.width*.02-.5||b.x+b.width>plan.width*.98+.5||b.y<plan.height*.02-.5||b.y+b.height>plan.height*.84+.5)
      issues.push(target.nodeId+' 在关键事件中不可见、被裁切或进入字幕区');
    if(Math.min(b.width,b.height)<target.minPixels)issues.push(target.nodeId+' 小于动作要求的可读尺寸');
  }
  return issues;
}
export const coverageTargets=(event,time)=>event.coverage.filter(c=>time>=(c.from??event.from)&&time<=(c.until??event.until));
function coverageStructureIssues(plan,event,index,nodes) {
  const issues=[];
  event.coverage.forEach((target,i)=>{
    const base=`motion.performance.events[${index}].coverage[${i}]`;
    const add=(field,message)=>issues.push({path:base+(field?'.'+field:''),message:event.requirementId+' '+(target?.nodeId||`coverage[${i}]`)+': '+message});
    if(!target||typeof target!=='object'){add('','观察区域必须为对象');return;}
    if(!nodes.has(target.nodeId))add('nodeId',`nodeId=${String(target.nodeId)} 没有对应节点`);
    for(const field of ['x','y','width','height','minPixels']) {
      const value=target[field];
      if(!Number.isFinite(value))add(field,`${field}=${String(value)} 必须为有限数值`);
      else if(['width','height'].includes(field)&&value<=0)add(field,`${field}=${value} 必须大于 0`);
      else if(field==='minPixels'&&(value<MIN_COVERAGE_PIXELS||value>plan.height))
        add(field,`minPixels=${value} 必须在 ${MIN_COVERAGE_PIXELS}–${plan.height} 像素之间；实际图形短边也须达到此值`);
    }
    const from=target.from??event.from,until=target.until??event.until;
    if(!Number.isFinite(from)||from<event.from)add('from',`from=${String(from)} 必须为有限数值且不早于事件起点 ${event.from}`);
    if(!Number.isFinite(until)||until>event.until)add('until',`until=${String(until)} 必须为有限数值且不晚于事件终点 ${event.until}`);
    if(Number.isFinite(from)&&Number.isFinite(until)&&until<=from)add('until',`until=${until} 必须晚于 from=${from}`);
  });
  return issues;
}
function revealedText(plan,node,requirement,event,beats) {
  if(requirement.kind!=='state'||!node.text?.value||node.paths.length||node.media)return false;
  return beats.some(beat=>{
    if(beat.intent!=='reveal'||!beat.cueIds.includes(requirement.cueId)||beat.from<event.from-.001||beat.from>=event.until)return false;
    const evidence=plan.explanationEvidence?.find(item=>item.beatId===beat.id);
    if(!evidence||evidence.resultAt<beat.from||evidence.resultAt>Math.min(beat.until,event.until)+.001)return false;
    const fade=evidence.changes.find(change=>change.nodeId===node.id&&change.property==='opacity'&&beat.entities.includes(change.entity));
    if(!fade)return false;
    const before=worldState(plan,beat.from).get(node.id).visibleOpacity;
    const after=worldState(plan,evidence.resultAt).get(node.id).visibleOpacity;
    return after>=.5&&after-before>=.4&&Math.abs(before-fade.from)<.001&&Math.abs(after-fade.to)<.001;
  });
}
export function validatePerformance(plan,requirements=[],{fps=24,speech=[],beats=[],required=false}={}) {
  const perf=plan.performance;
  if(!perf){if(required||requirements.length)fail('缺少可执行动作事件');return plan;}
  if(perf.version!==PERFORMANCE_VERSION||!Array.isArray(perf.events)||!perf.events.length||perf.events.length>80||
    !Array.isArray(requirements)||!requirements.length)fail('动作事件必须对应上游脚本要求');
  const nodes=new Map(plan.nodes.map(n=>[n.id,n])),done=new Map();
  if(perf.events.length!==requirements.length)fail('动作事件与脚本要求数量不一致');
  for(const e of perf.events) {
    const r=requirements.find(r=>r.id===e.requirementId),actor=plan.actors?.find(a=>a.id===r?.actorId);
    if(!r||done.has(r.id)||!actor||!nodes.has(e.rootId)||actor.rootId!==e.rootId||
      ![e.from,e.at,e.until].every(Number.isFinite)||e.from<r.from-.001||e.until>r.until+.001||e.from>e.at||e.at>e.until||e.until<=e.from||
      !Array.isArray(e.partIds)||new Set(e.partIds).size!==e.partIds.length||
      e.partIds.length!==r.partIds.length||e.partIds.some(id=>!actor.parts.some(p=>p.nodeId===id&&r.partIds.includes(p.id)))||
      !Array.isArray(e.contacts)||!Array.isArray(e.supports)||!Array.isArray(e.coverage)||!e.coverage.length||e.coverage.length>12)
      fail((r?.id||e.requirementId)+' 的主体、部件或事件区间不匹配');
    if((r.dependsOn||[]).some(id=>!done.has(id)||done.get(id).until>e.from+.001))fail(r.id+' 在前置动作完成前发生');
    const cue=speech.find(c=>c.id===r.cueId);
    const readingPause=r.kind==='hold'&&r.cueId==='design'&&measuredReadingPause(speech,r.from,r.until)&&
      beats.some(b=>b.intent==='hold'&&!b.cueIds?.length&&Math.abs(b.from-r.from)<.001&&Math.abs(b.until-r.until)<.001);
    if(!readingPause&&(!cue||e.at<cue.time-.25||e.at>(cue.until??cue.time)+.25))fail(r.id+' 的作用时刻不在实际语音句段内；不能伪造词级定位');
    const coverageProblems=coverageStructureIssues(plan,e,perf.events.indexOf(e),nodes);
    if(coverageProblems.length)fail(r.id+' 的相机观察区域无效：'+coverageProblems.map(issue=>issue.message).join('；'),coverageProblems);
    const times=eventTimes(e.from,e.until,fps,[e.at,...e.coverage.flatMap(c=>[c.from??e.from,c.until??e.until]),
      ...plan.nodes.flatMap(n=>[...n.frames,...(n.graphics?.morphs||[]).flatMap(m=>m.frames)].map(f=>f.time))]);
    if(['state','articulated','locomotion','contact','hinge'].includes(r.kind)) {
      if(actor.capability!=='articulated'&&!['state','hinge'].includes(r.kind))fail(r.id+' 的素材没有关节能力');
      for(const id of e.partIds) {
        if(id===e.rootId&&!['state','hinge'].includes(r.kind))fail(r.id+' 不能把根位移作为内部表演');
        const values=times.map(t=>nodeVisualState(nodes.get(id),t,plan));
        const keys=[...(id===e.rootId&&r.kind==='state'?[]:['x','y','rotation','scaleX','scaleY']),...(r.kind==='state'?['reveal','morph','mediaZoom','focusX','focusY','textProgress',...(nodes.get(id).paths.some(p=>p.stroke!=='none'&&p.strokeWidth>0)?['draw']:[])]:[])];
        const changed=keys.some(k=>span(values.map(v=>v[k]??1))>({x:2,y:2,rotation:5,scaleX:.03,scaleY:.03,draw:.15,reveal:.15,morph:.15,mediaZoom:.05,focusX:2,focusY:2,textProgress:.15}[k]));
        if(!changed&&!(r.kind==='state'&&new Set(values.map(v=>v.textValue)).size>1)&&!revealedText(plan,nodes.get(id),r,e,beats))fail(r.id+' 的 '+id+' 没有必要的内部姿态变化');
      }
    }
    if(r.kind==='locomotion') {
      if(distance(worldPoint(plan,e.rootId,e.from),worldPoint(plan,e.rootId,e.until))<plan.width*.015)fail(r.id+' 没有可追踪的行进路径');
      if(e.supports.length<2||new Set(e.supports.map(s=>s.nodeId)).size<2||e.partIds.some(id=>!e.supports.some(s=>s.nodeId===id)))fail(r.id+' 缺少交替足部支撑');
    }
    for(const s of e.supports) {
      if(!pointOK(s)||!e.partIds.includes(s.nodeId)||![s.from,s.until,s.groundY,s.tolerance].every(Number.isFinite)||s.from<e.from||s.until>e.until||s.until-s.from<.15||s.tolerance<.1||s.tolerance>plan.height*.008)fail(r.id+' 足部支撑区间无效');
      const start=worldPoint(plan,s.nodeId,s.from,s);
      for(const t of eventTimes(s.from,s.until,fps)) {
        const p=worldPoint(plan,s.nodeId,t,s);
        if(distance(p,start)>s.tolerance||Math.abs(p.y-s.groundY)>s.tolerance)fail(r.id+' 支撑脚滑动或离地：'+s.nodeId+' @ '+t.toFixed(3));
      }
      if(r.kind==='locomotion'&&!times.some(t=>(t<s.from||t>s.until)&&s.groundY-worldPoint(plan,s.nodeId,t,s).y>s.tolerance*2))fail(r.id+' 摆动脚没有离地过程：'+s.nodeId);
    }
    if(r.kind==='contact'&&!e.contacts.length)fail(r.id+' 缺少接触点');
    for(const c of e.contacts) {
      if(!pointOK(c.a)||!pointOK(c.b)||![c.a.nodeId,c.b.nodeId].every(id=>nodes.has(id))||
        ![c.at,c.until,c.tolerance].every(Number.isFinite)||Math.abs(c.at-e.at)>.001||c.until<c.at||c.until>e.until||c.tolerance<.1||c.tolerance>plan.height*.012)fail(r.id+' 接触数据无效');
      const gap=t=>distance(worldPoint(plan,c.a.nodeId,t,c.a),worldPoint(plan,c.b.nodeId,t,c.b));
      if(gap(c.at)>c.tolerance)fail(r.id+' 未接触就发生作用：'+c.at);
      if(r.kind==='contact'&&gap(Math.max(e.from,c.at-.15))<=c.tolerance)fail(r.id+' 缺少接触前的接近过程');
      for(const t of eventTimes(c.at,c.until,fps))if(gap(t)>c.tolerance)fail(r.id+' 接触后道具脱离：'+t.toFixed(3));
      for(const a of nodes.get(c.b.nodeId).attachments||[])if(a.parentId===c.a.nodeId&&Math.abs(a.from-c.at)>.001&&a.from<c.until&&a.until>e.from)fail(r.id+' 道具必须在接触时刻开始附着');
    }
    if(r.kind==='hinge')for(const id of e.partIds) {
      const values=times.map(t=>sampleMotion(nodes.get(id).frames,t));
      if(span(values.map(v=>v.rotation))<5||span(values.map(v=>v.x))>.5||span(values.map(v=>v.y))>.5)fail(r.id+' 开合必须围绕固定的局部轴心');
    }
    const observed=new Set(coverageTargets(e,e.at).map(c=>c.nodeId));
    for(const id of [...e.partIds,...e.contacts.flatMap(c=>[c.a.nodeId,c.b.nodeId])])if(!observed.has(id))fail(r.id+' 的关键部件没有相机覆盖：'+id);
    for(const t of times) {
      // Events and rendered shots use half-open intervals. At a cut the
      // following event owns the frame. At film duration there is no frame.
      if(Math.abs(t-e.until)<.00001)continue;
      const issues=coverageIssues(plan,e,t);
      if(issues.length)fail(r.id+' @ '+t.toFixed(3)+'：'+issues.join('；'));
      const shot=plan.cameraShots?.findLast(s=>t>=s.from-.00001&&t<=s.until+.00001);
      if(!shot?.eventIds?.includes(r.id))fail(r.id+' 缺少关联此事件的运镜目的');
    }
    done.set(r.id,e);
  }
  return plan;
}

export const performanceInstructions='动作契约 version=1：以文字、图像和实际解说为主。人物仅可静态图片或简单符号，不设计人物动画。从节奏脚本 performanceRequirements 逐项落实 motion.performance.events，不得把上游 state/contact/hinge 等降级为 rigid。state 点名真实变化的局部图形，允许描线或部件变化，不能用根位移抵充。motion.actors 登记稳定 id/designId/version、rootId、contentType(object/text/person-image/person-symbol)、rigid/articulated 能力、style 的 silhouette/proportions/material/light/palette/stroke/perspective 和 parts(id,nodeId,replaceable)。人物类型只能单层 rigid 静态素材，允许淡入淡出，禁止姿态变化、附着及人物视频。node.rig={actorId,partId,parentId(根为null),pivot:{x,y}}；frames.x/y 是枢轴在父坐标中的位置，父变换传给子节点。不用库局部变换驱动关节。events 给 requirementId/from/at/until/rootId/partIds(节点ID)、contacts、supports、coverage。物体接触点为 {nodeId,x,y}；contact={a,b,at,until,tolerance}；nodes.attachments=[{parentId,from,until}] 从接触后保持世界姿态跟随父节点，释放须连续。coverage={nodeId,x,y,width,height,minPixels,from,until} 指真实局部图形的可读区域；minPixels 至少为 8 且不超过画布高度，表示投影到画面的短边可读尺寸，不能仅扩大空框代替实际图形，可指定揭示后的可见区间；观察框须在 from/until 的每一帧都位于实际图形边界内，包含形变前、形变中和恢复态；不能仅照兴奋态或最大形状填写。缩小观察框后仍须满足原 minPixels，必要时增大实际图形，不能降低可读门槛或缩短机制覆盖区间。关键部件须覆盖作用时刻，位于字幕区上方。cameraShots.eventIds 关联要求ID，reason 解释观察目的，固定镜头合法。作用时刻 at 位于该要求的真实语音 cue；词级数据存在时按指代、动词、结论编排，不以句子开始代替每个动作的触发点。未听辨不能称人工词级对齐。各变化留出准备、作用、结果的阅读时间，旧文字及时退场。柔性网格首版不支持，不伪造通过。';

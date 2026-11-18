import {sampleMotion} from './motion-dynamics.mjs';
import {cameraAt} from './camera-plan.mjs';
import {worldState,inverse} from './actor-rig.mjs';
import {graphicsState,ownsVisibility} from './graphics-state.mjs';
import {textOpacity,focusOpacity} from './content-visibility.mjs';
export {focusOpacity} from './content-visibility.mjs';

// Screen-space type roles. These are editorial defaults, not a perceptual score.
export const typeRoles=Object.freeze({title:{size:36,weight:700},value:{size:48,weight:700},label:{size:24,weight:600},source:{size:18,weight:400}});
const fail=message=>{throw Error('画面层级：'+message);};
const clean=s=>s.replace(/\s/gu,'');
const inside=(s,t)=>t>=s.from&&t<s.until;
export function textPresentation(plan,id,time) {
  const rule=plan.presentation?.texts.find(t=>t.nodeId===id);
  if(!rule)return null;
  const node=plan.nodes.find(n=>n.id===id),f=sampleMotion(node.frames,time),camera=cameraAt(plan,time);
  const style=typeRoles[rule.role],fade=.12,g=graphicsState(node,time,plan);
  const m=worldState(plan,time).get(id).matrix;
  return {...rule,size:style.size*plan.height/720,weight:style.weight,
    opacity:textOpacity(plan,node,time),
    matrix:node.rig?inverse([m[0]*camera.zoom/g.scale,m[1]*camera.zoom/g.scale,m[2]*camera.zoom/g.scale,m[3]*camera.zoom/g.scale,0,0]):null,
    scaleX:1/(Math.abs(f.scaleX)*camera.zoom),scaleY:1/(Math.abs(f.scaleY)*camera.zoom*g.library.scaleY)};
}
export function validatePresentation(plan,{required=false}={}) {
  const p=plan.presentation;
  if(!p){if(required)fail('缺少文字角色、退场时间与逐阶段注意力安排');return plan;}
  if(p.version!==1||!Array.isArray(p.texts)||!Array.isArray(p.beats)||!p.beats.length||p.beats.length>80)fail('安排不完整');
  if(!plan.layout)fail('需要实际字形测量与避让检查');
  const nodes=new Map(plan.nodes.map(n=>[n.id,n])),textIds=plan.nodes.filter(n=>n.text).map(n=>n.id);
  if(p.texts.length!==textIds.length||new Set(p.texts.map(t=>t.nodeId)).size!==textIds.length)fail('每个文字节点必须有独立角色与显示区间');
  for(const t of p.texts) {
    const n=nodes.get(t.nodeId);
    if(!n?.text||!typeRoles[t.role]||!['start','middle','end'].includes(t.align)||!Number.isFinite(t.width)||t.width<30||t.width>plan.width*.9)fail(t.nodeId+' 的角色、宽度或对齐无效');
    if(!Number.isFinite(t.from)||!Number.isFinite(t.until)||t.from<0||t.until>plan.duration||t.until-t.from<.4)fail(t.nodeId+' 必须有有效的入场与退场时间');
    if(!Array.isArray(t.lines)||!t.lines.length||t.lines.length>3||t.lines.some(s=>typeof s!=='string'||!s.trim()||/\s{2,}|[\r\n]/u.test(s))||clean(t.lines.join(''))!==clean(n.text.value))fail(t.nodeId+' 分行必须保留原文，不能用空格模拟分栏');
  }
  let end=0;
  for(const b of p.beats) {
    if(!Number.isFinite(b.from)||!Number.isFinite(b.until)||Math.abs(b.from-end)>.001||b.until<=b.from||b.until>plan.duration+.001)fail('注意力阶段须顺序连续覆盖本镜');
    if(!Array.isArray(b.primaryIds)||!b.primaryIds.length||b.primaryIds.length>6||!Array.isArray(b.supportIds)||b.supportIds.length>10||typeof b.reason!=='string'||!b.reason.trim())fail('每阶段须指定一个主信息组和必要支撑');
    const ids=[...b.primaryIds,...b.supportIds];
    if(new Set(ids).size!==ids.length||ids.some(id=>!nodes.has(id))||b.primaryIds.some(id=>nodes.get(id).role==='decoration'))fail('重点不能指向缺失对象、重复对象或装饰');
    for(const t of p.texts.filter(t=>t.from<b.until&&t.until>b.from))if(!ids.includes(t.nodeId))fail(t.nodeId+' 显示时未被安排为主信息或必要支撑，请退场或明确用途');
    end=b.until;
  }
  if(Math.abs(end-plan.duration)>.001)fail('结尾缺少注意力安排');
  for(const e of plan.explanationEvidence||[])for(const change of e.changes||[]) {
    if(nodes.has(change.nodeId)&&focusOpacity(plan,change.nodeId,Math.min(plan.duration-.001,e.resultAt))<.5)fail(change.nodeId+' 的机制结果没有被安排为重点或必要支撑');
  }
  // Check interval boundaries, not just a handful of screenshots.
  const times=[...new Set([0,...p.texts.flatMap(t=>[t.from,t.until]),...plan.annotations.flatMap(a=>[a.from,a.until])])].sort((a,b)=>a-b);
  for(let i=0;i<times.length-1;i++){
    const time=(times[i]+times[i+1])/2,visible=p.texts.filter(t=>inside(t,time)),annotations=plan.annotations.filter(a=>inside(a,time));
    if(visible.filter(t=>t.role!=='source').length+annotations.length>6||visible.filter(t=>t.role==='source').length>2||annotations.length>2)fail(time.toFixed(2)+' 秒文字同时出现过多，请分阶段显示');
  }
  return plan;
}
export const presentationInstructions='必须输出 motion.presentation：version=1，texts 为每个 text 节点列 nodeId、role(title/value/label/source)、from/until（实际入场和退场）、align(start/middle/end)、width（屏幕像素宽度）和 lines（保留原文的1–3行，不以空格排栏）。字号与字重由统一屏幕尺度决定，辅助来源小于主值，相机放大不能破坏层级；不要用边框或高亮提升来源的权重。beats 连续覆盖本镜，每阶段列 from/until、primaryIds（同一个主信息组，最多6节点）、supportIds（理解所需支撑）和 reason。其他环境自动减弱，过期文字退出。全部正在显示的文字须在该阶段主信息或支撑中；普通文字加注释最多6条，来源最多2条；这是本项目编辑检查线，超出时拆分信息，不加速口播。需比较时保留对照，标题页可用title，不强行放人物或环境。layout.version=1，连线用实际测量避让。';

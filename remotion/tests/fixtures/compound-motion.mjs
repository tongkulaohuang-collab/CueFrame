import {motionFixture} from './motion.mjs';
import {referenceScriptKey} from '../../shared/reference-motion.mjs';
export function compoundMotionFixture() {
  const {p,raw}=motionFixture({presentation:true}),shotId=p.shots[0].id,m=raw.motion;
  p.scienceFlow.rhythm='• 0–2｜cueId=voice-0｜eventId=sequence｜对象=接收器、计算器与结果｜动作=接收后计算，结果最后显示并留读｜形式=motion';
  const r=p.scienceFlow.referenceScript.performanceRequirements[0];
  Object.assign(r,{actionId:'action-sequence',kind:'state',partIds:['receiver','compute','result'],from:0,until:2});
  const frame=(time,x,extra={})=>({time,x,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,draw:1,...extra});
  const nodes=[['receiver',-100,0,.5],['compute',0,.5,1],['result',100,1,1.5]].map(([id,x,from,until])=>({
    id,role:'mechanism',paths:[{d:'M -15 -15 L 15 -15 L 15 15 L -15 15 Z',fill:'none',stroke:'#ffffff',strokeWidth:2}],
    rig:{actorId:'particle-actor',partId:id,parentId:'particle',pivot:{x:0,y:0}},
    frames:[frame(0,x,{draw:.2}),...(from?[frame(from,x,{draw:.2})]:[]),frame(until,x),frame(2,x)]
  }));
  nodes[2].frames=[frame(0,100,{opacity:0,scaleX:.1}),frame(1,100,{opacity:0,scaleX:.1}),frame(1.5,100),frame(2,100)];
  m.nodes[1].frames.forEach(f=>{f.x=320;f.y=160;});
  m.nodes.push(...nodes);
  m.actors[0].parts.push(...nodes.map(n=>({id:n.id,nodeId:n.id,replaceable:true})));
  const e=m.performance.events[0];e.at=1.5;e.partIds=nodes.map(n=>n.id);
  e.coverage=nodes.map(n=>({nodeId:n.id,x:-10,y:-10,width:20,height:20,minPixels:8,from:n.id==='result'?1.5:0,until:2}));
  const beats=nodes.map((n,i)=>({id:'stage-'+i,shotId,from:i*.5,until:i===2?2:(i+1)*.5,cueIds:[r.cueId],
    intent:i===2?'reveal':'change',entities:[n.id],before:'该部件处于上一状态',after:'该部件完成本次状态变化',dependsOn:i?['stage-'+(i-1)]:[],holdReason:''}));
  p.scienceFlow.referenceScript.explanationBeats=beats;
  m.explanationEvidence=nodes.map((n,i)=>({beatId:beats[i].id,resultAt:(i+1)*.5,changes:[{entity:n.id,nodeId:n.id,property:i===2?'opacity':'draw',from:i===2?0:.2,to:1}]}));
  m.actionEvidence=[{requirementId:r.actionId,nodeIds:nodes.map(n=>n.id),from:0,until:2,technique:'motion',note:'接收描线、计算描线、结果显现，原地依次完成'}];
  m.styleEvidence.find(e=>e.aspect==='rhythm').nodeIds=['receiver','compute','result'];
  p.scienceFlow.referenceScript.inputs=referenceScriptKey(p);
  p.scienceFlow.referenceScript.text=p.scienceFlow.rhythm;
  return {p,raw};
}

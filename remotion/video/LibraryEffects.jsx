import React,{useId} from 'react';
import {motionFonts} from '../shared/motion-dynamics.mjs';
import {particlePoints} from '../shared/particle-motion.mjs';
import {graphicsState,revealBox,textRuns,libraryNodeState} from '../shared/graphics-state.mjs';
import {PresentationText} from './PresentationText';
export {libraryNodeState};
export function LibraryNode({node,plan,time,fps,draw=1,children}) {
  const unique=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const g=graphicsState(node,time,plan),state=g.library,u=Math.min(plan.width,plan.height);
  const clipId='lib-'+unique+'-'+node.id,gradientId=clipId+'-text',clip=revealBox(g.mask);
  const fill=state.gradient?'url(#'+gradientId+')':node.text?.color;
  const lines=node.text?textRuns(node,g.lines||[node.text.value],time,plan.fps||24):[];
  const visible=lines.some(line=>line.some(run=>run.opacity>.001));
  return <>
    {state.gradient&&<defs><linearGradient id={gradientId} x1={(-50+state.gradient.progress*100)+'%'} x2={(50+state.gradient.progress*100)+'%'} y1="0%" y2="0%" spreadMethod="reflect"><stop stopColor={state.gradient.colorA}/><stop offset="1" stopColor={state.gradient.colorB}/></linearGradient></defs>}
    {state.particles.map((q,index)=><g key={index} aria-hidden="true">{particlePoints(q,time,u).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={p.size} fill={q.color} opacity={p.opacity}/>)}</g>)}
    {clip&&<defs><clipPath id={clipId}><rect {...clip}/></clipPath></defs>}
    <g data-content-reveal={g.mask?.progress??1} clipPath={clip?'url(#'+clipId+')':undefined} opacity={clip&&(!clip.width||!clip.height)?0:1}>
      {children}
      {node.text&&(plan.presentation?<g data-label-placement=""><PresentationText {...{node,plan,time,draw,fill}}/></g>:
        <text opacity={visible?draw:0} textAnchor="middle" dominantBaseline="central" fontFamily={motionFonts[node.text.font]} fontSize={node.text.size} fontWeight={node.text.weight} fill={fill}>
          {lines.map((line,i)=><tspan key={i} x="0" y={(i-(lines.length-1)/2)*node.text.size*1.3}>{line.map((r,j)=><tspan key={j} opacity={r.opacity} fill={r.fill}>{r.char}</tspan>)}</tspan>)}
        </text>)}
    </g>
    {state.highlight&&<rect x={-state.highlight.width*u/200} y={-state.highlight.height*u/200} width={state.highlight.width*u/100} height={state.highlight.height*u/100} rx={u*.015} fill="none" stroke={state.highlight.color} strokeWidth={Math.max(2,u*.005)}/>}
  </>;
}
export function libraryTransitionStyle(transition,time){
  if(!transition)return {};
  const t=Math.max(0,Math.min(1,time/transition.params.duration));
  if(transition.kind==='fade')return {opacity:t};
  if(transition.kind==='gradient'){
    const soft=transition.params.softness,edge=-soft+t*(100+2*soft),angle={right:90,left:270,down:180,up:0}[transition.params.direction];
    const mask=`linear-gradient(${angle}deg,#000 ${edge-soft}%,transparent ${edge+soft}%)`;
    return {maskImage:mask,WebkitMaskImage:mask};
  }
  const n=(1-t)*100,d=transition.params.direction;
  return {clipPath:`inset(${d==='up'?n:0}% ${d==='right'?n:0}% ${d==='down'?n:0}% ${d==='left'?n:0}%)`};
}

import React from 'react';
import {textPresentation} from '../shared/presentation-plan.mjs';
import {motionFonts} from '../shared/motion-dynamics.mjs';
import {textRuns} from '../shared/graphics-state.mjs';
export function PresentationText({node,plan,time,draw=1,value,fill}) {
  const t=textPresentation(plan,node.id,time);
  if(!t||t.opacity<=0)return null;
  const lines=textRuns(node,t.lines,time,plan.fps||24,value),visible=lines.some(line=>line.some(run=>run.opacity>.001));
  return <text textAnchor={t.align} dominantBaseline="central" fontFamily={motionFonts[node.text.font]}
    fontSize={t.size} fontWeight={t.weight} fill={fill||node.text.color} opacity={visible?t.opacity*draw:0}
    data-text-role={t.role} data-max-width={t.width} transform={t.matrix?`matrix(${t.matrix.join(' ')})`:`scale(${t.scaleX} ${t.scaleY})`}>
    {lines.map((line,i)=><tspan key={i} x="0" y={(i-(lines.length-1)/2)*t.size*1.3}>{line.map((run,j)=><tspan key={j} opacity={run.opacity} fill={run.fill}>{run.char}</tspan>)}</tspan>)}
  </text>;
}

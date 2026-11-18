import {isAuthoredProcess} from '../shared/production-mode.mjs';
import React from 'react';
import {explanationScriptNeeds} from '../shared/explanation-plan.mjs';
import {referenceScriptNeeds} from '../shared/reference-motion.mjs';

export function ExplanationPlan({p,openScript,details=false}) {
  if(p.kind!=='science'||isAuthoredProcess(p))return null;
  const needs=[...explanationScriptNeeds(p),...referenceScriptNeeds(p)];
  const beats=p.scienceFlow?.referenceScript?.explanationBeats||[];
  const state=needs.length?'当前内容待更新':`已安排 ${beats.length} 个讲解阶段`;
  return <section className="explanation-plan" aria-label="讲解与画面检查">
    <h3>讲解与画面检查</h3>
    <p>关键句推进内容 · 对象呈现实际变化 · 文字和连线避让</p>
    <p role="status"><strong>{state}</strong>。{needs.length?needs[0]:'生成时核对每句对应的变化，导出时逐帧检查排版；最终效果仍需正常速度观看。'}</p>
    {needs.length>0&&openScript&&<button type="button" onClick={openScript}>前往节奏脚本</button>}
    {details&&!needs.length&&<details><summary>查看逐句画面安排</summary>
      <ol>{beats.map(b=>{const shot=p.shots.findIndex(s=>s.id===b.shotId);return <li key={b.id}>
        <b>第 {shot+1} 段 · {b.from.toFixed(2)}–{b.until.toFixed(2)} 秒</b>
        <p>{b.before} → {b.after}</p>{b.intent==='hold'&&<small>停留用途：{b.holdReason}</small>}
      </li>;})}</ol>
    </details>}
  </section>;
}

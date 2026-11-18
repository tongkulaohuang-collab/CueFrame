import {timeline} from './model.mjs';
import {actionRequirements} from './director-quality.mjs';

// Detect only explicit, one-to-one contradictions. Prose keywords are not a
// substitute for the typed beat; mixed entrances + mechanism actions are legal.
export function assertActionContract(p,shotId=null) {
  const issues=[],beats=p.scienceFlow?.referenceScript?.explanationBeats||[];
  for(const row of timeline(p).rows.filter(r=>!shotId||r.shot.id===shotId)) {
    const actions=actionRequirements(p,row.shot.id,row);
    for(const b of beats.filter(b=>b.shotId===row.shot.id&&['change','compare','result'].includes(b.intent))) {
      const own=actions.filter(a=>a.at<b.until-.001&&(a.until??a.at+.001)>b.from+.001);
      if(own.length!==1||own[0].id!=='action-'+b.id||own[0].technique!=='reveal')continue;
      issues.push({path:`rhythm.${own[0].id}.technique`,message:`${b.id} 要求 ${b.intent} 机制变化，但唯一动作被标为 reveal 显现；请按实际设计使用 motion（含局部形变）或 draw，或拆出显现与机制动作。不能用显现代替机制。`});
    }
  }
  if(issues.length)throw Object.assign(Error('节奏动作契约冲突：'+issues.map(i=>i.message).join('；')),{code:'ACTION_CONTRACT_CONFLICT',issues});
}

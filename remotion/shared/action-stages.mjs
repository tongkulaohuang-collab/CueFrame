// A typed state action may contain several different changes. Its stages come
// from the source beats and actor bindings, never from free-form action notes.
// Call only after explanation and performance evidence pass their real-track
// validators. Missing/ambiguous bindings fall back to the strict legacy check.
export function stateActionStages(action,evidence,plan,{actions,beats,requirements}) {
  if(action.technique!=='motion'||action.until==null)return null;
  const own=requirements.filter(r=>r.actionId===action.id);
  if(!own.length||own.some(r=>r.kind!=='state'||!r.partIds?.length||r.from<action.at-.001||r.until>action.until+.001))return null;
  const expected=new Set();
  for(const r of own) {
    const actor=plan.actors?.find(a=>a.id===r.actorId);
    for(const id of r.partIds) {
      const part=actor?.parts.find(p=>p.id===id);
      if(!part)return null;
      expected.add(part.nodeId);
    }
  }
  if(!evidence?.nodeIds||evidence.nodeIds.length!==expected.size||evidence.nodeIds.some(id=>!expected.has(id)))return null;
  const stages=[];
  for(const beat of beats) {
    if(beat.from<action.at-.001||beat.until>action.until+.001)continue;
    const owners=actions.filter(a=>a.at<beat.until-.001&&(a.until??a.at+.001)>beat.from+.001);
    if(owners.length!==1||owners[0].id!==action.id)return null;
    const observed=plan.explanationEvidence?.find(e=>e.beatId===beat.id);
    for(const change of observed?.changes||[]) {
      if(!expected.has(change.nodeId))continue;
      if(beat.from<evidence.from-.001||observed.resultAt>evidence.until+.001)return null;
      const technique=beat.intent==='hold'?'hold':change.property==='draw'?'draw':
        ['opacity','reveal','textProgress'].includes(change.property)?'reveal':'motion';
      stages.push({beatId:beat.id,nodeId:change.nodeId,from:beat.from,resultAt:observed.resultAt,
        until:beat.until,property:change.property,technique});
    }
  }
  if([...expected].some(id=>!stages.some(s=>s.nodeId===id&&s.technique!=='hold')))return null;
  return stages;
}

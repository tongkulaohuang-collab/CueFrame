// Reconcile an explicitly authored reading hold with the structured beat table.
// Only short silent gaps after a completed, unchanged result qualify. Speech,
// action timing and causal edges remain unchanged; unplanned gaps still fail.
export function reconcileReadingHolds(raw, context) {
  const adjustments=[];
  if(!Array.isArray(raw?.explanationBeats))return adjustments;
  for(const row of context) {
    const beats=raw.explanationBeats.filter(b=>b?.shotId===row.shotId).sort((a,b)=>a.from-b.from);
    for(let i=1;i<beats.length;i++) {
      const previous=beats[i-1],next=beats[i],gap=next.from-previous.until;
      if(!(gap>.75&&gap<=1.001)||next.from-previous.from>6.5||previous.intent==='hold')continue;
      if(beats.some(b=>b!==previous&&b!==next&&b.from<next.from&&b.until>previous.until))continue;
      const actions=row.actions.filter(a=>a.id==='action-'+previous.id&&Math.abs(a.until-previous.until)<.001);
      if(actions.length!==1)continue;
      const action=actions[0];
      if(!/(?:完成|结果|末态|落定|停稳).{0,30}(?:稳定阅读|供(?:阅读|比较|观察)|留读|保持可读|保持.*辨认)/u.test(action.action))continue;
      if(!Array.isArray(previous.cueIds)||!previous.cueIds.length||!previous.cueIds.every(id=>row.speech.some(c=>c.id===id&&c.until<=previous.until+.001)))continue;
      if(row.speech.some(c=>c.time<next.from-.001&&(c.until??row.duration)>previous.until+.001))continue;
      adjustments.push({type:'reading-hold',shotId:row.shotId,beatId:previous.id,from:previous.until,until:next.from,reason:action.action});
      previous.until=next.from;
      previous.holdReason='沿用原动作已明确的结果阅读停留：'+action.action;
    }
  }
  return adjustments;
}

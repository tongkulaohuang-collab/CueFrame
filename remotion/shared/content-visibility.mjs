// Pure visibility functions shared by the renderer and evidence checks.
export const ownsVisibility=node=>!!node.graphics?.tracks?.some(t=>t.channel==='opacity'||t.channel==='reveal')||!!node.libraryEffects?.some(e=>['text','typewriter','text-rise','stagger','mask'].includes(e.kind));
export function textOpacity(plan,node,time){
  const rule=plan.presentation?.texts.find(t=>t.nodeId===node.id);
  if(!rule)return 1;
  if(time<rule.from||time>=rule.until)return 0;
  return ownsVisibility(node)?1:Math.min(1,rule.from===0?1:(time-rule.from)/.12,rule.until===plan.duration?1:(rule.until-time)/.12);
}
const level=(beat,node,plan)=>{
  const root=plan.actors?.find(a=>a.id===node.rig?.actorId)?.rootId;
  return beat.primaryIds.includes(node.id)||root&&beat.primaryIds.includes(root)?1:
    beat.supportIds.includes(node.id)||root&&beat.supportIds.includes(root)?(node.text?1:.65):node.text?0:.16;
};
export function focusOpacity(plan,id,time){
  const beats=plan.presentation?.beats;if(!beats)return 1;
  const index=beats.findIndex(b=>time>=b.from&&time<b.until),node=plan.nodes.find(n=>n.id===id);
  if(index<0)return level(beats.at(-1),node,plan);
  const value=level(beats[index],node,plan),elapsed=time-beats[index].from;
  if(index===0||elapsed>=.18)return value;
  const t=Math.max(0,elapsed/.18),e=t*t*(3-2*t);
  return level(beats[index-1],node,plan)*(1-e)+value*e;
}

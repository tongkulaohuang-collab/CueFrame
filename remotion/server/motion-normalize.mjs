import {motionIdOK,motionReferenceFields} from '../shared/motion-structure.mjs';

// Older model output sometimes copied semantic actor.part names into node IDs.
// Repair only that unambiguous spelling, including every typed reference. Never
// change entity IDs, actor/part IDs, prose, geometry, timing or parent transforms.
export function normalizeMotionIds(raw) {
  const nodes=raw?.motion?.nodes;
  if(!Array.isArray(nodes))return {raw,adjustments:[]};
  const ids=nodes.map(n=>n?.id),mapping=new Map();
  for(const id of ids) {
    if(typeof id!=='string'||motionIdOK(id)||id.length>60||!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(id))continue;
    const next=id.replaceAll('.','_');
    if(ids.filter(value=>value===id).length!==1||ids.includes(next)||[...mapping.values()].includes(next))
      throw Object.assign(Error(`动画对象编号 ${id} 转为 ${next} 会产生重复，已保留原稿；请明确两个对象的身份。`),{code:'MOTION_ID_COLLISION'});
    mapping.set(id,next);
  }
  if(!mapping.size)return {raw,adjustments:[]};
  const draft=structuredClone(raw);
  function visit(value,key='') {
    if(typeof value==='string')return motionReferenceFields.has(key)?mapping.get(value)||value:value;
    if(Array.isArray(value))return value.map(item=>visit(item,key));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
    return value;
  }
  const normalized=visit(draft);
  normalized.motion.nodes.forEach(n=>{n.id=mapping.get(n.id)||n.id;});
  return {raw:normalized,adjustments:[...mapping].map(([from,to])=>`对象编号 ${from} → ${to}（同步节点引用）`)};
}

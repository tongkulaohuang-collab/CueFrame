// One identifier contract for model output, saved plans and local diagnostics.
export const MOTION_ID_PATTERN='^[A-Za-z0-9_-]{1,60}$';
export const motionIdOK=value=>typeof value==='string'&&new RegExp(MOTION_ID_PATTERN).test(value);
export const motionReferenceFields=new Set(['nodeId','parentId','rootId','subjectId','focusId','fromId','toId',
  'nodeIds','partIds','primaryIds','supportIds','environmentIds','targets']);

export function motionStructureIssues(plan,requirements=[]) {
  const issues=[];
  const add=(path,message)=>issues.push({path,message});
  if(!Array.isArray(plan?.nodes)){add('motion.nodes','必须是动画对象列表');return issues;}
  const nodes=new Map();
  for(const [i,n] of plan.nodes.entries()) {
    const field=`motion.nodes[${i}]`;
    if(!n||typeof n!=='object'){add(field,'必须是动画对象');continue;}
    if(!motionIdOK(n.id))add(field+'.id',`对象编号 ${JSON.stringify(n.id)??'缺失'} 须为 1–60 个英文字母、数字、下划线或连字符；语义对象 actor.part 应通过部件映射关联`);
    if(nodes.has(n.id))add(field+'.id',`对象编号 ${JSON.stringify(n.id)} 重复，必须唯一`);
    else nodes.set(n.id,n);
    if(!Array.isArray(n.paths))add(field+'.paths',`对象 ${n.id??i} 的路径必须是数组，纯文字或图片用 []`);
    else if(n.paths.length>100)add(field+'.paths',`对象 ${n.id} 有 ${n.paths.length} 条路径，最多 100 条`);
  }
  const actors=Array.isArray(plan.actors)?plan.actors:[],assigned=new Set();
  for(const [i,a] of actors.entries()) {
    const field=`motion.actors[${i}]`;
    if(!a||!Array.isArray(a.parts))continue; // Full validation reports malformed actors.
    const root=nodes.get(a.rootId),roots=[];
    for(const [k,part] of a.parts.entries()) {
      const at=`${field}.parts[${k}]`,n=nodes.get(part?.nodeId);
      if(!n){add(at+'.nodeId',`主体 ${a.id} 的部件 ${part?.id} 引用了不存在的对象 ${part?.nodeId}`);continue;}
      if(assigned.has(n.id))add(at+'.nodeId',`对象 ${n.id} 被重复登记为部件`);
      assigned.add(n.id);
      if(!n.rig)add(at+'.nodeId',`对象 ${n.id} 缺少 rig；应绑定 actorId=${a.id}、partId=${part.id}，根的 parentId=null，其余部件明确父对象和局部坐标`);
      else {
        if(n.rig.actorId!==a.id||n.rig.partId!==part.id)add(at+'.nodeId',`对象 ${n.id} 的 rig 与主体 ${a.id} / 部件 ${part.id} 不一致`);
        if(n.rig.parentId==null)roots.push(n.id);
      }
    }
    if(!root||!a.parts.some(part=>part?.nodeId===a.rootId))add(field+'.rootId',`根对象 ${a.rootId} 必须存在并登记在本主体 parts 中`);
    if(roots.length!==1||roots[0]!==a.rootId)add(field+'.rootId',`主体 ${a.id} 必须且只能有一个根 ${a.rootId}；当前无父部件为 ${JSON.stringify(roots)}`);
  }
  for(const [i,n] of plan.nodes.entries())if(n?.rig&&!assigned.has(n.id))add(`motion.nodes[${i}].rig`,`对象 ${n.id} 的部件未登记在 actors.parts 中`);
  for(const [i,e] of (Array.isArray(plan.performance?.events)?plan.performance.events:[]).entries()) {
    const r=requirements.find(r=>r.id===e?.requirementId),a=actors.find(a=>a?.id===r?.actorId);
    if(!r||!a||!Array.isArray(a.parts)||!Array.isArray(r.partIds))continue;
    const expected=r.partIds.map(id=>a.parts.find(part=>part?.id===id)?.nodeId);
    if(expected.some(id=>!id)){add(`motion.performance.events[${i}].partIds`,`${r.id} 缺少上游要求部件 ${r.partIds.join('、')} 的登记`);continue;}
    if(!Array.isArray(e.partIds)||e.partIds.length!==expected.length||new Set(e.partIds).size!==expected.length||expected.some(id=>!e.partIds.includes(id)))
      add(`motion.performance.events[${i}].partIds`,`${r.id} 须逐一对应上游部件 ${JSON.stringify(r.partIds)}，本稿节点应为 ${JSON.stringify(expected)}；其他辅助对象放 coverage，不能混入 partIds`);
  }
  return issues;
}
export function assertMotionStructure(plan,requirements=[]) {
  const issues=motionStructureIssues(plan,requirements);
  if(issues.length)throw Object.assign(Error('动画结构校验失败：\n'+issues.slice(0,24).map(i=>i.path+'：'+i.message).join('\n')+
    (issues.length>24?`\n另有 ${issues.length-24} 项，完整记录见任务技术详情。`:'')),{code:'MOTION_STRUCTURE_INVALID',issues});
}

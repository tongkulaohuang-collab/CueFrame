import {motionIdOK,assertMotionStructure} from './motion-structure.mjs';

export const MOTION_BINDING_VERSION=2;
const fail=(path,message)=>{throw Object.assign(Error('动画绑定编译失败：'+path+'：'+message),{
  code:'MOTION_BINDING_INVALID',issues:[{path,message}],
});};
// Generation declares each binding exactly once. Legacy saved plans retain
// their explicit rig/events and are never assigned a guessed parent or pose.
export function compileMotionBindings(input,requirements=[],{onAdjustment=()=>{},path='motion'}={}) {
  if(input?.bindingVersion==null)return input;
  if(![1,MOTION_BINDING_VERSION].includes(input.bindingVersion))fail(path+'.bindingVersion','不支持的绑定版本');
  if(!Array.isArray(input.nodes)||!Array.isArray(input.actors))fail(path,'缺少节点或主体目录');
  const plan=structuredClone(input),nodes=new Map(),assigned=new Set(),actorIds=new Set(),adjustments=[];
  for(const [i,n] of plan.nodes.entries()) {
    if(!n||!motionIdOK(n.id)||nodes.has(n.id))fail(`${path}.nodes[${i}].id`,'对象编号无效或重复');
    if(Object.hasOwn(n,'rig'))fail(`${path}.nodes[${i}].rig`,'新版生成只在 actors.parts 声明绑定，不重复填写 rig');
    nodes.set(n.id,n);n.rig=null;
  }
  for(const [i,a] of plan.actors.entries()) {
    const field=`${path}.actors[${i}]`;
    if(!a||!motionIdOK(a.id)||actorIds.has(a.id)||!Array.isArray(a.parts)||!a.parts.length)fail(field,'主体或部件目录无效');
    actorIds.add(a.id);const partIds=new Set(),own=new Set(a.parts.map(p=>p?.nodeId));
    if(own.size!==a.parts.length||new Set(a.parts.map(p=>p?.id)).size!==a.parts.length)fail(field+'.parts','部件身份或对象重复');
    // v2 names the namespace explicitly. v1 accepts an old part alias only
    // when both possible namespaces resolve to the exact same parent node.
    const byPart=new Map(a.parts.map(p=>[p?.id,p?.nodeId]));
    for(const [k,p] of a.parts.entries()) {
      const at=`${field}.parts[${k}]`,n=nodes.get(p?.nodeId);
      if(!n||assigned.has(n.id)||!motionIdOK(p.id)||partIds.has(p.id))fail(at,'部件身份重复或对象不存在');
      const parentKey=plan.bindingVersion===2?'parentPartId':'parentId',ref=p[parentKey],parentPath=at+'.'+parentKey;
      if(Object.hasOwn(p,parentKey==='parentId'?'parentPartId':'parentId'))fail(parentPath,'父级只声明一次，不能混用 parentId 与 parentPartId');
      if(!Object.hasOwn(p,parentKey)||!(ref===null||motionIdOK(ref)))fail(parentPath,'必须明确本主体内的父对象，唯一根用 null；不推测世界坐标或局部坐标');
      let parentId=null;
      if(ref!==null) {
        const matches=new Set([byPart.get(ref),...(plan.bindingVersion===1&&nodes.has(ref)?[ref]:[])].filter(Boolean));
        if(matches.size!==1)fail(parentPath,matches.size?'父级引用 '+ref+' 有歧义，同时指向不同的部件与节点；请明确父部件编号':
          '父级 '+ref+' 不在本主体内；'+(plan.bindingVersion===2?'parentPartId 必须引用 parts[].id：':'可用部件编号：')+[...byPart.keys()].join('、'));
        parentId=[...matches][0];
        if(!own.has(parentId))fail(parentPath,'父对象不在本主体内，不允许跨主体绑定');
        if(parentId===p.nodeId)fail(parentPath,'父对象不能是自身');
        if(plan.bindingVersion===1&&ref!==parentId)adjustments.push({type:'parent-part-reference',path:parentPath,actorId:a.id,from:ref,to:parentId});
      }
      if((p.nodeId===a.rootId)!==(parentId===null))fail(parentPath,'必须且只能由 rootId 指向的部件作为根');
      if(!p.pivot||![p.pivot.x,p.pivot.y].every(v=>Number.isFinite(v)&&Math.abs(v)<16384))fail(at+'.pivot','缺少有效局部枢轴');
      n.rig={actorId:a.id,partId:p.id,parentId,pivot:structuredClone(p.pivot)};
      assigned.add(n.id);partIds.add(p.id);
      delete p.parentId;delete p.parentPartId;delete p.pivot;
    }
  }
  // Catch cycles before any evaluator attempts to compose the tree.
  for(const n of nodes.values()) {
    const seen=new Set();let current=n;
    while(current?.rig?.parentId){if(seen.has(current.id))fail(path+'.actors','部件父子关系形成循环');seen.add(current.id);current=nodes.get(current.rig.parentId);}
  }
  for(const [i,e] of (plan.performance?.events||[]).entries()) {
    const at=`${path}.performance.events[${i}]`,r=requirements.find(r=>r.id===e.requirementId),a=plan.actors.find(a=>a.id===r?.actorId);
    if(Object.hasOwn(e,'partIds')||Object.hasOwn(e,'rootId'))fail(at,'新版事件只引用 requirementId，rootId 与 partIds 由绑定表编译');
    if(!r||!a)fail(at+'.requirementId','没有对应的上游动作要求或主体');
    e.rootId=a.rootId;
    e.partIds=r.partIds.map(id=>{const part=a.parts.find(p=>p.id===id);if(!part)fail(at+'.partIds',r.id+' 缺少要求部件 '+id);return part.nodeId;});
  }
  delete plan.bindingVersion;
  assertMotionStructure(plan,requirements);
  adjustments.forEach(onAdjustment);
  return plan;
}

export const motionBindingInstructions='生成绑定契约 bindingVersion=2：部件绑定只在 actors.parts 声明一次，每项给 id/nodeId/replaceable/parentPartId/pivot。parentPartId 只能引用同一个主体的 parts[].id（部件编号），不是 nodeId。唯一 rootId 所指部件的 parentPartId=null，其余填写真实父部件编号。例如部件 cortex 的 nodeId=motor_path_cortex，则子部件 parentPartId="cortex"，不能填 "motor_path_cortex"。rootId 仍是节点编号。系统将父部件号解析为运行时 rig.parentId 节点编号；生成时不写 parentId 或 node.rig。frames.x/y、图版 poses.x/y 和曲线控制点使用父局部坐标；根用世界坐标。performance.events 只引用 requirementId，不填写 rootId 或 partIds；系统按上游 requirement.partIds 精确映射。把真正变化的膜段/图形登记为要求部件，静态胞体、轮廓和辅助部件放 coverage；actionEvidence.nodeIds 仅列真正执行该动作的节点。辅助图形保留在 nodes 与 coverage，不重复声明为动作部件。系统仍检查每个要求部件的真实变化、完整可见区间、语音、证据和排版，不会自动改变父坐标或替不存在的动作过关。';

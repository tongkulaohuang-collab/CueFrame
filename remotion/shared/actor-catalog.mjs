const fail=s=>{throw Error('主体设计：'+s);};
const idOK=s=>typeof s==='string'&&/^[\w-]{1,60}$/.test(s);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);

export function actorDesigns(plan) {
  if(plan.actors==null){if(plan.nodes.some(n=>n.rig))fail('关节部件缺少设计目录');return [];}
  if(!Array.isArray(plan.actors)||plan.actors.length>24||new Set(plan.actors.map(a=>a.id)).size!==plan.actors.length)fail('目录格式或主体身份无效');
  const used=new Set(),designs=[];
  for(const a of plan.actors) {
    if(!idOK(a.id)||!idOK(a.designId)||!Number.isInteger(a.version)||a.version<1||!['rigid','articulated'].includes(a.capability)||
      !a.style||['silhouette','proportions','material','light','palette','stroke','perspective'].some(k=>typeof a.style[k]!=='string'||!a.style[k].trim()||a.style[k].length>300)||
      !Array.isArray(a.parts)||!a.parts.length||a.parts.length>64||new Set(a.parts.map(p=>p.id)).size!==a.parts.length)fail(a.id+' 缺少稳定设计、能力或部件');
    const nodes=a.parts.map(p=>plan.nodes.find(n=>n.id===p.nodeId));
    for(const [i,p] of a.parts.entries()) {
      const n=nodes[i];
      if(!idOK(p.id)||typeof p.replaceable!=='boolean'||!n||used.has(n.id)||n.rig?.actorId!==a.id||n.rig?.partId!==p.id)fail(a.id+' 部件映射无效');
      used.add(n.id);
    }
    if(nodes.filter(n=>!n.rig.parentId).length!==1||!nodes.some(n=>n.id===a.rootId&&!n.rig.parentId))fail(a.id+' 必须有一个根部件');
    if(a.capability==='articulated'&&nodes.length<2)fail(a.id+' 关节主体不能用一张整图代替');
    if(a.contentType!=null&&!['object','text','person-image','person-symbol'].includes(a.contentType))fail(a.id+' 内容类型无效');
    if(a.contentType?.startsWith('person-')) {
      if(a.capability!=='rigid'||nodes.length!==1||nodes[0].attachments?.length)fail(a.id+' 人物只能使用静态图片或简单符号');
      const n=nodes[0],start=n.frames[0];
      if(n.graphics?.morphs?.length||n.graphics?.textStates?.length)fail(a.id+' 人物图片不可改变内部形状或姿态');
      if(n.libraryEffects?.length||n.libraryTemplate||n.frames.some(f=>['x','y','rotation','scaleX','scaleY','draw'].some(k=>(f[k]??1)!==(start[k]??1))))fail(a.id+' 不允许人物动作；只可静态展示或淡入淡出');
    }
    const spec={...(a.contentType?{contentType:a.contentType}:{}),capability:a.capability,style:a.style,parts:a.parts.map((p,i)=>({id:p.id,replaceable:p.replaceable,
      parentId:nodes.find(n=>n.id===nodes[i].rig.parentId)?.rig.partId||null,pivot:nodes[i].rig.pivot,
      paths:nodes[i].paths,text:nodes[i].text||null,media:nodes[i].media||null})).sort((x,y)=>x.id.localeCompare(y.id))};
    designs.push({designId:a.designId,version:a.version,spec,signature:canonical(spec)});
  }
  if(plan.nodes.some(n=>n.rig&&!used.has(n.id)))fail('存在未登记的部件');
  return designs;
}
export function mergeActorCatalog(catalog=[],plan) {
  if(!Array.isArray(catalog))fail('项目目录无效');
  const out=structuredClone(catalog);
  for(const d of actorDesigns(plan)) {
    const old=out.find(a=>a.designId===d.designId&&a.version===d.version);
    if(old&&old.signature!==d.signature)fail(d.designId+' v'+d.version+' 与已存设计不一致；请复用部件或显式创建新设计版本');
    if(!old)out.push(d);
  }
  return out;
}
export function validateActorCatalog(p) {
  const catalog=p.actorCatalog||[];
  if(!Array.isArray(catalog)||catalog.length>200)fail('项目目录过大或无效');
  const keys=new Set();
  for(const d of catalog) {
    const key=d.designId+'@'+d.version;
    if(!idOK(d.designId)||!Number.isInteger(d.version)||d.version<1||keys.has(key)||d.signature!==canonical(d.spec))fail('已存设计内容或指纹无效');
    keys.add(key);
  }
  let all=catalog;
  for(const s of p.shots||[])if(s.motionPlan?.actors)all=mergeActorCatalog(all,s.motionPlan);
  return all;
}
export function actorBindingIssue(plan,binding) {
  const n=plan?.nodes.find(n=>n.id===binding.nodeId);if(!n?.rig)return null;
  const actor=plan.actors?.find(a=>a.id===n.rig.actorId),part=actor?.parts.find(p=>p.nodeId===n.id);
  if(!part?.replaceable)return n.id+' 未允许替换外观；整图不能覆盖关节主体';
  if(actor.capability==='rigid')return null;
  if(binding.scope!=='part'||binding.actorId!==actor.id||binding.partId!==part.id||binding.designVersion!==actor.version)
    return n.id+' 需要对应设计版本的部件图片，不能绑定整个人物图片';
  return null;
}
export function actorCatalogInput(p,plan) {
  if(!plan?.actors)return [];
  return actorDesigns(plan).map(d=>p.actorCatalog?.find(a=>a.designId===d.designId&&a.version===d.version)||d);
}
export function actorSkinIssues(p) {
  const used=new Map(),issues=[];
  for(const [index,shot]of (p.shots||[]).entries())for(const binding of shot.imageBindings||[]) {
    const node=shot.motionPlan?.nodes.find(n=>n.id===binding.nodeId),actor=shot.motionPlan?.actors?.find(a=>a.id===node?.rig?.actorId);
    if(!actor)continue;
    const key=actor.designId+'@'+actor.version+'/'+node.rig.partId;
    const appearance=canonical([binding.assetId,binding.box||null]);
    if(used.has(key)&&used.get(key).appearance!==appearance)issues.push(key+' 在第 '+used.get(key).number+'、'+(index+1)+' 镜使用了不一致的部件图片；请统一外观或采用新设计版本');
    else used.set(key,{appearance,number:index+1});
  }
  return issues;
}

// A setting is an environment and a process, not another zoom level.
export function validateSceneDesign(plan) {
  const d=plan.sceneDesign;if(d==null)return plan;
  if(!d||!['cut','continuous'].includes(d.transition)||
    ['setting','bridge'].some(k=>typeof d[k]!=='string'||!d[k].trim()||d[k].length>500)||
    !Array.isArray(d.environmentIds)||!d.environmentIds.length||
    new Set(d.environmentIds).size!==d.environmentIds.length||
    d.environmentIds.some(id=>!plan.nodes.some(n=>n.id===id&&(n.paths.length||n.media))))
    throw Error('场景设计：请列出实际环境对象、场景切换方式与前后交接，不能只改变相机');
  return plan;
}
export function environmentSignature(plan) {
  if(!plan?.sceneDesign)return null;
  const geometry=plan.sceneDesign.environmentIds.map(id=>plan.nodes.find(n=>n.id===id))
    .filter(Boolean).map(n=>JSON.stringify([n.paths,n.media||null])).sort();
  return JSON.stringify(geometry);
}
export function sceneVarietyIssues(p) {
  const issues=[];
  for(let i=1;i<p.shots.length;i++) {
    const a=p.shots[i-1].motionPlan,b=p.shots[i].motionPlan;
    if(a?.sceneDesign&&b?.sceneDesign&&a.sceneDesign.setting!==b.sceneDesign.setting&&
      environmentSignature(a)===environmentSignature(b))
      issues.push(`第 ${i+1} 段只更改了场景名称或机位，实际环境仍与上一段相同；请重做环境与主体过程`);
  }
  return issues;
}

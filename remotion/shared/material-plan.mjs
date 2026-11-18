import {referenceDocuments} from './references.mjs';
import {motionReferences,currentReferenceReports} from './reference-motion.mjs';
import {visualStyleContext} from './film-style.mjs';
import {visualReferenceInputs} from './visual-style.mjs';

export function materialInputs(p) {
  const f=p.scienceFlow||{};
  return JSON.stringify([p.topic,p.script,p.references,p.width,p.height,f.style,f.template,f.lemoStyleId,
    visualStyleContext(p),
    p.claims.map(c=>[c.id,c.text,c.verified,c.title,c.url,c.locator]),referenceDocuments(p),
    p.shots.map(s=>[s.id,s.zh,s.en,s.visual,s.continuity]),
    p.assets.filter(a=>['image','video','document'].includes(a.kind)&&!a.generation?.planId&&!a.imageSource)
      .map(a=>[a.id,a.name,a.kind,a.src,a.role,a.confirmed,a.source])]);
}
export const savedMaterialPlan=(p,shotId)=>shotId?p.scienceFlow?.imagePlans?.[shotId]:p.scienceFlow?.materialPlan;
export const currentMaterialPlan=(p,shotId=null)=>{
  const plan=savedMaterialPlan(p,shotId);
  if(!plan||plan.inputs!==materialInputs(p))return null;
  return !plan.imageInputs||plan.imageInputs===imagePlanInputs(p,plan.focusShotId)?plan:null;
};
export function planForMaterial(p,itemId) {
  for(const shotId of [null,...Object.keys(p.scienceFlow?.imagePlans||{})]) {
    if(savedMaterialPlan(p,shotId)?.items.some(item=>item.id===itemId))return currentMaterialPlan(p,shotId);
  }
  return null;
}
export function imagePlanInputs(p,focus=null) {
  const basis=JSON.stringify([motionReferences(p),currentReferenceReports(p).map(r=>[r.mediaHash,r.segments,r.excluded]),
    p.shots.filter(s=>!focus||s.id===focus).map(s=>[s.id,s.processVideoId,s.motionPlan?.nodes,s.motionPlan?.cameraShots])]);
  let h=2166136261;
  for(let i=0;i<basis.length;i++)h=Math.imul(h^basis.charCodeAt(i),16777619);
  return 'images-v1-'+basis.length+'-'+(h>>>0).toString(36);
}
// Search relevance follows the requested content, not saves of derived plans,
// generated assets, playback settings or project bookkeeping.
export function visualSearchInputs(p,materialId=null) {
  const item=materialId&&planForMaterial(p,materialId)?.items.find(i=>i.id===materialId);
  if(materialId&&!item)return null;
  const {narrationMotion,matchCuts,entityColors,...style}=visualStyleContext(p);
  return JSON.stringify([1,p.topic,p.script,p.references,referenceDocuments(p).map(({fetchedAt,...doc})=>doc),p.width,p.height,
    visualReferenceInputs(p),style,
    currentReferenceReports(p).map(r=>[r.mediaHash,r.segments,r.excluded,r.appearance]),
    p.shots.map(s=>[s.id,s[p.voice]||s.zh]),
    item?[item.id,item.title,item.usage,item.checks,item.shotIds,item.imageTargets]:null]);
}
export const visualSearchMatches=(p,j)=>j.project===p.id&&j.task==='research'&&j.researchScope==='visuals'&&
  typeof j.researchInputs==='string'&&j.researchInputs===visualSearchInputs(p,j.materialId);
export const materialContext=p=>{
  const plans=[null,...Object.keys(p.scienceFlow?.imagePlans||{})].map(id=>currentMaterialPlan(p,id)).filter(Boolean);
  return plans.length?{summary:plans.map(plan=>plan.summary).join('\n'),items:plans.flatMap(plan=>plan.items)}:null;
};
export function materialAsset(p,itemId,plan=planForMaterial(p,itemId)) {
  return plan&&p.assets.find(a=>['image','video'].includes(a.kind)&&a.generation?.planId===plan.id&&a.generation?.itemId===itemId);
}

export const canGenerateMaterial=item=>['generate','procedural'].includes(item.mode);
export const materialTasks=['materials','shot-images','material-image','material-supplement'];
export const materialJobActive=(j,version)=>materialTasks.includes(j.task)&&
  (['running','unknown'].includes(j.status)||j.version===version&&['awaiting','ready'].includes(j.status));

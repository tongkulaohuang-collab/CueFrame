// Layer assets are supplied explicitly. No OCR, background inference or silent retouching.
const validImage=a=>a?.kind==='image'&&a.confirmed&&a.source&&a.license;
export function validateImageTextLayers(spec,sourceId,assets,duration=Infinity){
  if(spec==null)return;
  const source=assets.find(a=>a.id===sourceId),base=assets.find(a=>a.id===spec.cleanAssetId);
  const fail=m=>{throw Error('图中文字分层：'+m);};
  if(spec.version!==1||spec.sourceAssetId!==sourceId||!validImage(source)||!validImage(base)||source.id===base.id)fail('需要已核对的原图和独立无字底图；原图变化后重新核对');
  if(!spec.confirmed||!spec.note?.trim()||spec.note.length>500)fail('请核对拆层后的字形、背景与科学含义并记录依据');
  if(!Number.isFinite(source.width)||!Number.isFinite(source.height)||source.width<=0||source.height<=0)fail('原图缺少真实像素尺寸');
  if(source.width!==base.width||source.height!==base.height)fail('无字底图须与原图尺寸相同');
  if(!Array.isArray(spec.regions)||spec.regions.length<1||spec.regions.length>12||new Set(spec.regions.map(r=>r?.id)).size!==spec.regions.length)fail('需要 1–12 个不同文字层');
  for(const r of spec.regions){
    const a=assets.find(a=>a.id===r.assetId);
    if(!r||!/^[\w-]{1,40}$/.test(r.id)||typeof r.label!=='string'||!r.label.trim()||r.label.length>80||!validImage(a)||[source.id,base.id].includes(a?.id))fail('文字层编号、名称或图片无效');
    if(a.width!==source.width||a.height!==source.height||!a.src?.toLowerCase().endsWith('.png'))fail('文字层须为与原图同尺寸的透明 PNG，保留原始位置');
    if(![r.from,r.until,r.fade,r.scale].every(Number.isFinite)||r.from<0||r.until<=r.from||r.until>duration+.000001||r.fade<.08||r.fade>2||(r.until-r.from)<2*r.fade+.25||r.scale<1||r.scale>1.2)fail('文字层时间需保留阅读停留，强调倍数为 1–1.2');
    if(!r.pivot||![r.pivot.x,r.pivot.y].every(n=>Number.isFinite(n)&&n>=0&&n<=100))fail('强调中心须在原图内（0–100%）');
  }
  return spec;
}
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
export function imageTextLayerState(r,t){
  const enter=smooth((t-r.from)/r.fade),leave=smooth((r.until-t)/r.fade);
  const pulse=Math.sin(Math.PI*Math.max(0,Math.min(1,(t-r.from)/(r.until-r.from))))**2;
  return {opacity:enter*leave,scale:1+(r.scale-1)*pulse};
}
export function imageTextAssetIds(spec){return spec?[spec.cleanAssetId,...(spec.regions||[]).map(r=>r.assetId)]:[];}
export function shotVisualAssetIds(shot){return [...new Set([...(shot.assetIds||[]),...(shot.motionPlan?.nodes||[]).flatMap(n=>[n.media?.assetId,...imageTextAssetIds(n.media?.imageText)]),...(shot.semanticScene?.items||[]).flatMap(v=>[v.assetId,...imageTextAssetIds(v.imageText)]),...(shot.imageBindings||[]).map(v=>v.assetId)].filter(Boolean))];}

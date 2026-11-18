import {lemoStyle} from './lemo.mjs';
import {motionReferences,currentReferenceReports,referenceMotionKey} from './reference-motion.mjs';

// Reference selection is the only visual authority; sync flags are independent.
export function visualReferenceInputs(p) {
  const f=p?.scienceFlow||{};
  return [f.lemoStyleId||'',f.style?.trim()||'',f.template?.trim()||'',f.referenceVideoUrls?.trim()||'',
    (p?.assets||[]).filter(a=>['image','video'].includes(a.kind)&&a.role==='reference').map(a=>[a.id,a.kind,a.src,a.confirmed,a.source,a.license])];
}
export const hasSelectedVisualReference=p=>visualReferenceInputs(p).some(v=>Array.isArray(v)?v.length:!!v);
export function visualStyleInputKey(p) {
  return JSON.stringify([1,visualReferenceInputs(p),motionReferences(p).map(referenceMotionKey),
    currentReferenceReports(p).map(r=>[r.inputKey,r.mediaHash,r.summary,r.segments,r.appearance])]);
}
export function validateReferenceAppearance(v) {
  const hex=x=>typeof x==='string'&&/^#[\da-f]{6}$/i.test(x);
  const range=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
  if(!v||v.version!==1||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||
    !['background','foreground','muted'].every(k=>hex(v[k]))||!Array.isArray(v.colors)||v.colors.length<2||v.colors.length>8||!v.colors.every(hex)||
    !['sans','serif','mono','display'].includes(v.font)||!range(v.titleScale,1,2)||!range(v.labelScale,.8,1.25)||!range(v.stroke,.5,4)||
    !range(v.start,.05,.4)||!range(v.settle,.5,.85)||typeof v.basis!=='string'||!v.basis.trim()||v.basis.length>1600)
    throw Error('参考风格缺少有效的配色、字形、线条、节奏参数或依据，请重新分析参考。');
  return v;
}
export function referenceAppearance(p) {
  if(!hasSelectedVisualReference(p))return null;
  const f=p.scienceFlow||{},receipt=f.referenceScript;
  if(receipt?.visualStyle&&receipt.visualStyleInputs===visualStyleInputKey(p))return validateReferenceAppearance(receipt.visualStyle);
  // A single observed reference can drive models directly. Free text, images,
  // and combinations are reconciled by the existing rhythm-script step.
  const refs=motionReferences(p),reports=currentReferenceReports(p);
  const plainTemplate=!f.template?.trim()||refs.some(r=>r.url===f.template.trim());
  if(!f.style?.trim()&&plainTemplate&&refs.length===1&&!(p.assets||[]).some(a=>a.kind==='image'&&a.role==='reference')) {
    const r=reports.find(r=>r.referenceId===refs[0].id);
    if(r?.segments?.length&&r.appearance)return validateReferenceAppearance(r.appearance);
  }
  return null;
}
export function referenceStyleStatus(p) {
  if(!hasSelectedVisualReference(p))return {source:'default',ready:true};
  const appearance=referenceAppearance(p),f=p.scienceFlow||{};
  return {source:'reference',ready:!!appearance,name:lemoStyle(f.lemoStyleId)?.cn||f.style?.trim()||'本期视觉参考',
    ...(appearance?{appearance}:{}),message:appearance?'已采用当前参考的视觉方案':'参考风格待解析：请完成参考视频分析；文字、图片或多份参考请继续生成节奏脚本。'};
}
export const visualStyleInstructions='全片视觉方向以 visualStyle 为准。source=reference 时，以本期选定的风格、实际参考分析与用户补充为唯一视觉依据；历史 filmStyle.preset、单段 scene.style 和旧画面不能覆盖当前参考。已解析的 appearance 统一配色、字形、字级、线条与基础节奏，构图、质感和运动仍需完整落实参考。source=default 时才使用默认视觉方案。语音同步、对象身份与镜头交接独立于视觉风格，保留实测声音时间；不为匹配参考改写台词或重录声音。';
export const appearanceInstructions='同时输出 visualStyle：结合当前视觉参考和全部适用参考分析形成唯一的全片视觉参数。包含 version=1、name、background/foreground/muted（六位十六进制色）、colors（2–8 个对象颜色）、font（sans/serif/mono/display）、titleScale（1–2）、labelScale（0.8–1.25）、stroke（0.5–4）、start（0.05–0.4）和 settle（0.5–0.85，为本片模型动作起点及结果到达的时长比例，实际语音定位优先）、basis（参考来源和适配理由，区分观察与设计）。这些是适配参数，不宣称为原片精确测量。无参考时 visualStyle=null。不得按旧预设改写参考风格。';

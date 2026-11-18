// getBBox() returns the unstroked geometry in Chromium. A horizontal path
// has zero geometric height even when its painted stroke is ten pixels thick.
export function coversStrokeOutsideBounds(target,bounds,containsInk) {
  const xs=[target.x,target.x+target.width/2,target.x+target.width];
  const ys=[target.y,target.y+target.height/2,target.y+target.height];
  const outside=xs.flatMap(x=>ys.map(y=>({x,y}))).filter(p=>
    p.x<bounds.x-.5||p.x>bounds.x+bounds.width+.5||p.y<bounds.y-.5||p.y>bounds.y+bounds.height+.5);
  return outside.length>0&&outside.every(containsInk);
}

function luminance(color) {
  const rgb=/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/.exec(color);
  const channels=rgb?rgb.slice(1).map(Number):/^#[0-9a-f]{6}$/i.test(color)?color.slice(1).match(/../g).map(value=>parseInt(value,16)):null;
  if(!channels)return null;
  const [r,g,b]=channels.map(x=>x/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
// Only quiet, explicitly staged scenery behind a label can serve as its
// background. Subject paths, foreground fills and low-contrast text still
// participate in the normal overlap checks.
export function quietScenery(plan,node,time,opacity) {
  if(opacity>.2||node.rig||node.id===plan.subjectId||!['material','decoration'].includes(node.role)||
    !plan.sceneDesign?.environmentIds?.includes(node.id))return false;
  const beat=plan.presentation?.beats?.find(b=>time>=b.from&&time<b.until);
  return !!beat&&!beat.primaryIds.includes(node.id)&&!beat.supportIds.includes(node.id);
}
export function readableOnPaint(text,paint) {
  const a=luminance(text),b=luminance(paint);
  return a!==null&&b!==null&&(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
}
export function quietGridPaint(line,base) {
  const a=luminance(line),b=luminance(base);
  return a!==null&&b!==null&&(Math.max(a,b)+.05)/(Math.min(a,b)+.05)<=1.55;
}
export function isStationaryBoard(plan,node) {
  if(!plan.sceneDesign?.environmentIds?.includes(node.id)||node.rig?.parentId||node.media||node.text||node.graphics||node.libraryEffects?.length||
    plan.actionEvidence?.some(e=>e.nodeIds.includes(node.id))||plan.explanationEvidence?.some(e=>e.changes.some(c=>c.nodeId===node.id))||
    plan.performance?.events.some(e=>e.coverage.some(c=>c.nodeId===node.id)||e.partIds.includes(node.id)))return false;
  const first=node.frames[0];
  return !!first&&node.frames.every(f=>['x','y','rotation','scaleX','scaleY','opacity','draw'].every(key=>f[key]===first[key]));
}

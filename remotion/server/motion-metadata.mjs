// Resolve only metadata already fixed by the source contract. Do not invent
// actions, camera movement, timing, or a missing observation purpose.
export function normalizeMotionMetadata(input,requirements=[],{fps=24}={}) {
 const raw=structuredClone(input),adjustments=[],motion=raw?.motion;
 if(!motion)return {raw,adjustments};
 for(const e of motion.actionEvidence||[]) {
  if(requirements.some(r=>r.actionId===e.requirementId))continue;
  const matches=requirements.filter(r=>r.id===e.requirementId);
  if(matches.length!==1||typeof matches[0].actionId!=='string')continue;
  adjustments.push(`动作引用 ${e.requirementId} → ${matches[0].actionId}（原契约唯一映射）`);
  e.requirementId=matches[0].actionId;
 }
 // A generated event may repeat the source boundary rounded to a video frame.
 // Restore that exact source boundary, not a guessed earlier/later action.
 if(Number.isFinite(fps)&&fps>0)for(const e of motion.performance?.events||[]) {
  const matches=requirements.filter(r=>r.id===e.requirementId),r=matches.length===1?matches[0]:null;
  if(!r||e.at<r.from||e.at>r.until)continue;
  for(const key of ['from','until']) {
   const before=e[key],after=r[key];
   if(!Number.isFinite(after)||before===after||Math.abs(before-Math.round(after*fps)/fps)>.000001)continue;
   if(key==='until'&&[...(e.contacts||[]),...(e.supports||[])].some(c=>c.until>after))continue;
   if(key==='from'&&(e.supports||[]).some(c=>c.from<after))continue;
   e[key]=after;
   for(const c of e.coverage||[])if(c[key]===before)c[key]=after;
   adjustments.push(`事件 ${r.id}.${key} ${before} → ${after}（还原原脚本边界，保留图形关键帧）`);
  }
 }
 if(!Array.isArray(motion.camera)||!Array.isArray(motion.cameraShots))return {raw,adjustments};
 if(motion.camera.some((f,i)=>!Number.isFinite(f.time)||(i&&f.time<=motion.camera[i-1].time)))return {raw,adjustments};
 for(const shot of motion.cameraShots) {
  const time=shot?.from;
  if(!Number.isFinite(time)||motion.camera.length>=64||motion.camera.some(f=>Math.abs(f.time-time)<.00001))continue;
  const i=motion.camera.findIndex(f=>f.time>time),a=motion.camera[i-1],b=motion.camera[i];
  if(!a||!b||!['x','y','zoom'].every(k=>Number.isFinite(a[k])&&a[k]===b[k]))continue;
  motion.camera.splice(i,0,{time,x:a.x,y:a.y,zoom:a.zoom,easing:'linear'});
  adjustments.push(`固定取景 ${time.toFixed(6)} 秒补入等值相机关键帧（画面轨迹不变）`);
 }
 return {raw,adjustments};
}

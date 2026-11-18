export const CAMERA_PLAN_VERSION=1;
export const framingNames={wide:'全景',medium:'中景',close:'近景',detail:'特写'};
const epsilon=.00001;
const fail=message=>{throw Object.assign(Error('镜头安排：'+message),{code:'CAMERA_DIRECTION_INVALID'});};
const pose=(frame,time=frame.time)=>({time,x:frame.x,y:frame.y,zoom:frame.zoom});

export function needsCameraPlanUpdate(p,shotId) {
  const plan=p.shots?.find(s=>s.id===shotId)?.motionPlan;
  return p.kind==='science'&&Boolean(plan&&(!plan.cameraShots?.length||plan.cameraPlanVersion!==CAMERA_PLAN_VERSION));
}

// Cuts change the viewpoint on exactly the cut frame. Object animation keeps
// its original world clock. Old plans without coverage retain linear motion.
export function cameraAt(plan,time) {
  const frames=plan.camera,end=frames.findIndex(f=>f.time>=time);
  if(end<=0)return pose(end===0?frames[0]:frames.at(-1),time);
  const a=frames[end-1],b=frames[end];
  if(time===b.time)return pose(b,time);
  if(plan.cameraShots?.some(s=>s.transition==='cut'&&Math.abs(s.from-b.time)<epsilon))return pose(a,time);
  const t=(time-a.time)/(b.time-a.time),u=b.easing==='smooth'?t*t*(3-2*t):t;
  return {time,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,zoom:a.zoom+(b.zoom-a.zoom)*u};
}

export function quantizeCameraTiming(plan,fps) {
  if(!plan.cameraShots)return plan;
  for(const f of plan.camera)f.time=Math.round(f.time*fps)/fps;
  for(const s of plan.cameraShots){s.from=Math.round(s.from*fps)/fps;s.until=Math.round(s.until*fps)/fps;}
  return plan;
}

export function cameraVariation(plan,fps=24) {
  const times=new Set([0,...plan.camera.filter(f=>f.time<plan.duration).map(f=>f.time)]);
  for(const s of plan.cameraShots||[]){times.add((s.from+s.until)/2);times.add(Math.max(s.from,s.until-1/fps));}
  const views=[...times].map(t=>cameraAt(plan,t));
  const cuts=(plan.cameraShots||[]).filter(s=>s.from>0&&s.transition==='cut').filter(s=>{
    const before=cameraAt(plan,Math.max(0,s.from-1/fps)),after=cameraAt(plan,s.from);
    return Math.max(before.zoom,after.zoom)/Math.min(before.zoom,after.zoom)>=1.12||
      Math.hypot((after.x-before.x)/plan.width,(after.y-before.y)/plan.height)*Math.min(before.zoom,after.zoom)>=.1;
  });
  return {zoomRatio:Math.max(...views.map(c=>c.zoom))/Math.min(...views.map(c=>c.zoom)),cuts:cuts.map(s=>s.from)};
}

export function validateCameraPlan(plan,{required=false,fps=24,purposeDriven=false}={}) {
  for(const f of plan.camera||[])if(f.easing!=null&&!['linear','smooth'].includes(f.easing))fail('相机缓动类型无效');
  if(plan.cameraShots==null){if(required)fail('缺少视觉镜头，请为口播安排全景、近景或特写及切换时机');return plan;}
  const shots=plan.cameraShots;
  if(!Array.isArray(shots)||!shots.length||shots.length>32)fail('需要 1–32 个连续的视觉镜头');
  for(const [i,s] of shots.entries()) {
    if(!s||!Number.isFinite(s.from)||!Number.isFinite(s.until)||s.from<0||s.until>plan.duration+epsilon||
      s.until-s.from<Math.min(.25,plan.duration)-epsilon||Math.abs(s.from-(i?shots[i-1].until:0))>epsilon)
      fail('第 '+(i+1)+' 个视觉镜头的时间有空缺、重叠或过短');
    if(!Object.hasOwn(framingNames,s.framing)||!['cut','move'].includes(s.transition)||
      !plan.nodes.some(n=>n.id===s.focusId)||typeof s.reason!=='string'||!s.reason.trim()||s.reason.length>500)
      fail('第 '+(i+1)+' 个视觉镜头缺少有效景别、观察对象、切换方式或理由');
    if(!plan.camera.some(f=>Math.abs(f.time-s.from)<epsilon))fail('第 '+(i+1)+' 个视觉镜头的入点没有对应相机关键帧');
  }
  if(Math.abs(shots.at(-1).until-plan.duration)>epsilon)fail('视觉镜头没有覆盖完整口播时长');
  if(required&&!purposeDriven&&plan.duration>=6) {
    const minimum=plan.duration>=18?3:2;
    if(shots.length<minimum)fail(`这段 ${plan.duration.toFixed(1)} 秒口播至少需要 ${minimum} 个视觉镜头，不能只保持一个构图`);
    if(new Set(shots.map(s=>s.framing)).size<2)fail('需要至少两种景别，按内容安排全景与近景或特写');
    if(plan.duration>=18&&shots.some(s=>s.until-s.from>12+epsilon))fail('有单一构图持续超过 12 秒，请在语义节点安排切镜或推进观察');
    const variation=cameraVariation(plan,fps);
    if(variation.zoomRatio<1.25-epsilon)fail('实际远近变化不足，最大与最小取景比例需至少相差 25%，不能只修改景别名称');
    if(!variation.cuts.length)fail('没有有效切镜，请在语义节点切换到明显不同的取景，而非保持原构图或仅缓慢平移');
  }
  return plan;
}

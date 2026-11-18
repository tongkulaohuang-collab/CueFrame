import {sampleMotion} from './motion-dynamics.mjs';
import {nodeVisualState,graphicsState} from './graphics-state.mjs';

// SVG affine matrices. Keep shear introduced by rotated, non-uniform parents.
export const identity=()=>[1,0,0,1,0,0];
export const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function inverse(m) {
  const d=m[0]*m[3]-m[1]*m[2];
  if(Math.abs(d)<1e-10)throw Error('部件变换不可逆');
  return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];
}
export const transformPoint=(m,{x=0,y=0}={})=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export const matrixScale=m=>{const trace=m[0]**2+m[1]**2+m[2]**2+m[3]**2,det=m[0]*m[3]-m[1]*m[2];return Math.sqrt((trace+Math.sqrt(Math.max(0,trace*trace-4*det*det)))/2);};
export function localMatrix(node,time,plan={}) {
  const f=sampleMotion(node.frames,time),r=f.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),p=node.rig?.pivot||{x:0,y:0};
  const a=c*f.scaleX,b=s*f.scaleX,d=c*f.scaleY,cc=-s*f.scaleY;
  // x/y position the pivot in the parent's coordinates (legacy pivot = zero).
  const g=graphicsState(node,time,plan);
  return multiply([a,b,cc,d,f.x-a*p.x-cc*p.y,f.y-b*p.x-d*p.y],
    [g.scaleX,0,0,g.scaleY,g.offsetX,g.offsetY]);
}
export function worldState(plan,time) {
  const nodes=new Map(plan.nodes.map(n=>[n.id,n])),cache=new Map(),visiting=new Set();
  function at(id,t) {
    const key=id+'@'+t;
    if(cache.has(key))return cache.get(key);
    if(visiting.has(key))throw Error('部件或附着关系存在循环：'+id);
    const n=nodes.get(id);if(!n)throw Error('部件不存在：'+id);
    visiting.add(key);
    const f=nodeVisualState(n,t,plan),parent=n.rig?.parentId?at(n.rig.parentId,t):{matrix:identity(),opacity:1};
    let matrix=multiply(parent.matrix,localMatrix(n,t,plan));
    const a=n.attachments?.find(a=>t>=a.from&&t<a.until);
    if(a) {
      // Preserve the complete world pose at contact, then lock it to the hand.
      // No playback state, accumulated deltas or frame-order dependency.
      const restParent=n.rig?.parentId?at(n.rig.parentId,a.from).matrix:identity();
      const rest=multiply(restParent,localMatrix(n,a.from,plan));
      matrix=multiply(multiply(at(a.parentId,t).matrix,inverse(at(a.parentId,a.from).matrix)),rest);
    }
    const value={...f,matrix,opacity:f.opacity*parent.opacity,visibleOpacity:f.visibleOpacity*parent.opacity};
    visiting.delete(key);cache.set(key,value);return value;
  }
  return {get:id=>at(id,time),point:(id,p)=>transformPoint(at(id,time).matrix,p)};
}
export const worldPoint=(plan,id,time,p)=>worldState(plan,time).point(id,p);
export const screenPoint=(plan,camera,p)=>({x:plan.width/2+(p.x-camera.x)*camera.zoom,y:plan.height/2+(p.y-camera.y)*camera.zoom});
export function validateRig(plan) {
  const nodes=new Map(plan.nodes.map(n=>[n.id,n]));
  for(const n of plan.nodes) {
    if(n.rig) {
      const r=n.rig;
      if(![r.actorId,r.partId].every(v=>typeof v==='string'&&/^[\w-]{1,60}$/.test(v))||
        !r.pivot||![r.pivot.x,r.pivot.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=16384)||
        r.parentId!=null&&(!nodes.has(r.parentId)||r.parentId===n.id||nodes.get(r.parentId).rig?.actorId!==r.actorId))throw Error('部件身份、父节点或关节中心无效：'+n.id);
      if(n.libraryTemplate||n.libraryEffects?.length)throw Error('关节部件请使用可计算的关键帧；库内局部变换尚未纳入关节求值：'+n.id);
    }
    let end=-1;
    if(n.attachments!=null&&(!Array.isArray(n.attachments)||n.attachments.length>12))throw Error('附着区间无效：'+n.id);
    for(const a of n.attachments||[]) {
      if(!nodes.has(a.parentId)||a.parentId===n.id||![a.from,a.until].every(Number.isFinite)||a.from<0||a.until<=a.from||a.until>plan.duration||a.from<end)throw Error('附着区间或对象无效：'+n.id);
      end=a.until;
    }
  }
  // Union graph rejects even a temporarily hidden circular parenting relation.
  const done=new Set(),active=new Set();
  function visit(n) {if(done.has(n.id))return;if(active.has(n.id))throw Error('部件或附着关系存在循环：'+n.id);active.add(n.id);
    for(const id of [n.rig?.parentId,...(n.attachments||[]).map(a=>a.parentId)].filter(Boolean))visit(nodes.get(id));
    active.delete(n.id);done.add(n.id);}
  plan.nodes.forEach(visit);
  // Returning to the authored track must not teleport the released object.
  for(const n of plan.nodes)for(const a of n.attachments||[])if(a.until<plan.duration) {
    const state=worldState(plan,a.until),base=worldState(plan,a.from).get(n.id).matrix;
    const attached=multiply(multiply(state.get(a.parentId).matrix,inverse(worldState(plan,a.from).get(a.parentId).matrix)),base);
    if(attached.some((v,i)=>Math.abs(v-state.get(n.id).matrix[i])>(i<4?.01:.5)))throw Error('释放时姿态不连续：'+n.id+' @ '+a.until);
  }
  return plan;
}

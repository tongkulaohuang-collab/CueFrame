import {graphicsState} from './graphics-state.mjs';

// Exact centerline bounds for line, horizontal/vertical, and cubic/quadratic paths.
// Unsupported paths remain subject to the browser's getBBox check.
export function pathGeometryBounds(d) {
  if(typeof d!=='string'||!/^[MLHVCQZmlhvcqz\d.eE,+\s-]+$/.test(d))return null;
  if(d.replace(/[MLHVCQZmlhvcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,'').replace(/[\s,]/g,''))return null;
  const tokens=d.match(/[MLHVCQZmlhvcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  if(!/^[Mm]$/.test(tokens[0]))return null;
  let i=0,command='',x=0,y=0,start={x:0,y:0};const points=[];
  const add=(x,y)=>points.push({x,y});
  const roots=(a,b,c)=>Math.abs(a)<1e-12?(Math.abs(b)<1e-12?[]:[-c/b]):b*b-4*a*c<0?[]:[(-b+Math.sqrt(b*b-4*a*c))/(2*a),(-b-Math.sqrt(b*b-4*a*c))/(2*a)];
  const curve=ps=>{
    const ts=[0,1];
    for(const axis of ['x','y']) {
      const [a,b,c,d]=ps.map(p=>p[axis]);
      ts.push(...(ps.length===3?roots(0,a-2*b+c,b-a):roots(-a+3*b-3*c+d,2*(a-2*b+c),b-a)).filter(t=>t>0&&t<1));
    }
    for(const t of ts){const u=1-t,v=axis=>ps.length===3?u*u*ps[0][axis]+2*u*t*ps[1][axis]+t*t*ps[2][axis]:u*u*u*ps[0][axis]+3*u*u*t*ps[1][axis]+3*u*t*t*ps[2][axis]+t*t*t*ps[3][axis];add(v('x'),v('y'));}
  };
  while(i<tokens.length) {
    if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
    const type=command.toUpperCase(),relative=command===command.toLowerCase();
    if(type==='Z'){add(x,y);add(start.x,start.y);x=start.x;y=start.y;command='';continue;}
    const count={M:2,L:2,H:1,V:1,Q:4,C:6}[type];if(!count||i+count>tokens.length)return null;
    const values=tokens.slice(i,i+count).map(Number);if(values.some(v=>!Number.isFinite(v)))return null;i+=count;
    const ps=[];
    if(type==='H')ps.push({x:values[0]+(relative?x:0),y});
    else if(type==='V')ps.push({x,y:values[0]+(relative?y:0)});
    else for(let k=0;k<count;k+=2)ps.push({x:values[k]+(relative?x:0),y:values[k+1]+(relative?y:0)});
    if(type==='M'){start=ps[0];command=relative?'l':'L';}
    else if(['L','H','V'].includes(type)){add(x,y);add(ps[0].x,ps[0].y);}
    else curve([{x,y},...ps]);
    ({x,y}=ps.at(-1));
  }
  if(!points.length)return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys);
  return {x:left,y:top,width:Math.max(...xs)-left,height:Math.max(...ys)-top};
}
export function morphGeometryBounds(node,time,plan) {
  return node?.graphics?.morphs?.length?nodePathBounds(node,time,plan):null;
}
// Use actual path placement for observation; the transform origin may be far
// from its artwork. Unsupported content keeps its existing measurement path.
export function nodePathBounds(node,time,plan) {
  if(!node||node.text||node.media||node.libraryTemplate||node.libraryEffects?.length)return null;
  const boxes=graphicsState(node,time,plan).paths.map(p=>pathGeometryBounds(p.d));
  if(!boxes.length||boxes.some(b=>!b))return null;
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
export function coverageBoundsIssue(target,bounds) {
  if(bounds&&(target.x<bounds.x-.5||target.y<bounds.y-.5||target.x+target.width>bounds.x+bounds.width+.5||target.y+target.height>bounds.y+bounds.height+.5))
    return target.nodeId+' 观察区域超出实际渲染图形';
  return null;
}

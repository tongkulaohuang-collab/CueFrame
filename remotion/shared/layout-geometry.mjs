export const expandBox = (b,p=0) => ({x:b.x-p,y:b.y-p,width:b.width+2*p,height:b.height+2*p});
export const boxesOverlap = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
export function segmentHitsBox(a,b,r) {
  let lo=0,hi=1;
  for (const [p,q] of [[a.x-b.x,a.x-r.x],[b.x-a.x,r.x+r.width-a.x],[a.y-b.y,a.y-r.y],[b.y-a.y,r.y+r.height-a.y]]) {
    if(Math.abs(p)<1e-9) {if(q<0)return false;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
  }
  return true;
}
export function routeConnector(start,end,boxes,bounds,padding=10) {
  const obstacles=boxes.map(b=>expandBox(b,padding));
  const xs=[start.x,end.x,...obstacles.flatMap(b=>[b.x-1,b.x+b.width+1])];
  const ys=[start.y,end.y,...obstacles.flatMap(b=>[b.y-1,b.y+b.height+1])];
  const candidates=[ [start,{x:end.x,y:start.y},end], [start,{x:start.x,y:end.y},end],
    ...xs.map(x=>[start,{x,y:start.y},{x,y:end.y},end]),
    ...ys.map(y=>[start,{x:start.x,y},{x:end.x,y},end]) ];
  const clean=points=>points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
  const score=points=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-points[i].x,p.y-points[i].y),0)+points.length*12;
  const routes=candidates.map(clean).filter(points=>points.every(p=>p.x>=bounds.x&&p.x<=bounds.x+bounds.width&&p.y>=bounds.y&&p.y<=bounds.y+bounds.height)&&
    points.slice(1).every((p,i)=>!obstacles.some(r=>segmentHitsBox(points[i],p,r))));
  routes.sort((a,b)=>score(a)-score(b));
  if(!routes.length)throw Error('连线没有可用通道，请移动端口或标签');
  return routes[0];
}

export function labelIssues(labels,width,height) {
  const issues=[];
  for(const [i,a] of labels.entries()) {
    if(a.x<width*.025||a.x+a.width>width*.975||a.y<height*.025||a.y+a.height>height*.84)issues.push(a.id+' 超出画面或进入字幕安全区');
    for(const b of labels.slice(i+1)) if(boxesOverlap(expandBox(a,3),expandBox(b,3)))issues.push(a.id+' 与 '+b.id+' 文字重叠');
  }
  return issues;
}

export function validateLayout(plan) {
  if(plan.layout==null)return;
  const layout=plan.layout;
  if(layout.version!==1||!Array.isArray(layout.connectors)||layout.connectors.length>48)throw Error('测量排版设置无效');
  const ids=new Set();
  for(const c of layout.connectors) {
    if(!/^[\w-]{1,60}$/.test(c.id)||ids.has(c.id)||!plan.nodes.some(n=>n.id===c.fromId)||!plan.nodes.some(n=>n.id===c.toId)||
      ![c.fromX,c.fromY,c.toX,c.toY,c.from,c.until,c.strokeWidth].every(Number.isFinite)||c.from<0||c.until<=c.from||c.until>plan.duration||c.strokeWidth<1||c.strokeWidth>12||!/^#[\da-f]{6}$/i.test(c.color))throw Error('连线端口、时序或样式无效');
    ids.add(c.id);
  }
  if(plan.nodes.some(n=>n.text&&/\s{2,}/u.test(n.text.value)))throw Error('文字不能用连续空格模拟列，请拆成独立标签');
  // Reveals now preserve complete SVG text runs; invisible glyphs reserve the
  // final measured layout instead of reflowing on every frame.
}

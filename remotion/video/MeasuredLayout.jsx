import {useLayoutEffect,useState} from 'react';
import {continueRender,delayRender} from 'remotion';
import {cameraAt} from '../shared/camera-plan.mjs';
import {labelIssues,routeConnector} from '../shared/layout-geometry.mjs';
import {worldState,screenPoint} from '../shared/actor-rig.mjs';
import {coverageIssues,coverageTargets} from '../shared/performance-plan.mjs';
import {revealedRegion,revealBox} from '../shared/graphics-state.mjs';
import {coverageBoundsIssue} from '../shared/coverage-geometry.mjs';
import {artworkObstacles,placeLabels} from './label-placement.mjs';
import {coversStrokeOutsideBounds} from './painted-geometry.mjs';

const point=(matrix,p)=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});
function boxInRoot(el,root) {
  // Browser font shaping and actual transforms, including zoom/rotation. Never
  // estimate Chinese glyph width from string length or rely on painter order.
  const b=el.getBBox(),matrix=root.getScreenCTM().inverse().multiply(el.getScreenCTM());
  const corners=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height}].map(p=>point(matrix,p));
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
function opacity(el,root) {
  let value=1;
  for(let n=el;n&&n!==root;n=n.parentElement) {const style=getComputedStyle(n);if(style.display==='none'||style.visibility==='hidden')return 0;value*=Number(style.opacity);}
  return value;
}
function port(plan,time,id,x,y) {
  return screenPoint(plan,cameraAt(plan,time),worldState(plan,time).point(id,{x,y}));
}

export function useMeasuredLayout(ref,plan,time) {
  const [result,setResult]=useState({key:'',routes:[],error:null});
  const key=String(time);
  useLayoutEffect(()=>{
    if(!plan.layout&&!plan.performance)return;
    const handle=delayRender('测量文字并核对连线 '+time.toFixed(3));let active=true;
    document.fonts.ready.then(()=>{
      if(!active)return;
      const root=ref.current;
      for(const wrapper of root.querySelectorAll('[data-label-placement][transform]'))wrapper.removeAttribute('transform');
      const measure=()=>[...root.querySelectorAll('text')].map((el,i)=>({el,id:el.closest('[data-motion-node]')?.getAttribute('data-motion-node')||'annotation-'+i,color:getComputedStyle(el).fill,...boxInRoot(el,root)}));
      const visible=entries=>entries.filter(b=>opacity(b.el,root)>.12);
      const state=worldState(plan,time);
      const inReveal=(id,p)=>{const b=revealBox(state.get(id).graphics.mask);return !b||p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;};
      const obstacles=artworkObstacles(root,plan,time,{boxInRoot,opacity,state,inReveal});
      placeLabels(visible(measure()),obstacles,plan,root);
      const allLabels=measure(),labels=visible(allLabels),issues=labelIssues(labels,plan.width,plan.height);
      for(const label of labels) {
        const limit=Number(label.el.getAttribute('data-max-width'));
        if(limit>0&&label.width>limit+1)issues.push(label.id+' 实际字形超出设定栏宽（'+Math.ceil(label.width)+' / '+limit+' px），请换行或缩短文字');
        for(const hit of obstacles){const issue=hit(label);if(issue)issues.push(issue);}
      }
      const elements=new Map([...root.querySelectorAll('[data-motion-node]')].map(el=>[el.getAttribute('data-motion-node'),el]));
      for(const event of plan.performance?.events||[])if(time>=event.from&&time<=event.until) {
        const measured=new Map();
        for(const target of coverageTargets(event,time)) {
          const el=elements.get(target.nodeId);if(!el){issues.push('动作部件未渲染：'+target.nodeId);continue;}
          const bounds=el.getBBox();
          // A model cannot pass by declaring an arbitrary empty region.
          const geometryIssue=coverageBoundsIssue(target,bounds);
          if(geometryIssue) {
            const paths=[...el.querySelectorAll('path')].filter(p=>{
              const style=getComputedStyle(p);
              return style.stroke!=='none'&&Number(style.strokeOpacity)>.05&&opacity(p,root)>.05;
            }).map(path=>({path,toLocal:path.getScreenCTM().inverse().multiply(el.getScreenCTM())}));
            const inside=coversStrokeOutsideBounds(target,bounds,p=>paths.some(({path,toLocal})=>{
              const q=point(toLocal,p);
              return path.isPointInStroke(new DOMPoint(q.x,q.y));
            }));
            if(!inside)issues.push(geometryIssue);
          }
          const m=root.getScreenCTM().inverse().multiply(el.getScreenCTM());
          const corners=[{x:target.x,y:target.y},{x:target.x+target.width,y:target.y},{x:target.x,y:target.y+target.height},{x:target.x+target.width,y:target.y+target.height}].map(p=>point(m,p));
          const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
          const ink=[...el.querySelectorAll('path,text,foreignObject')].some(child=>{
            if(opacity(child,root)<=.05)return false;const style=getComputedStyle(child);
            return child.tagName!=='path'||style.fill!=='none'&&Number(style.fillOpacity)>.05||style.stroke!=='none'&&Number(style.strokeOpacity)>.05&&state.get(target.nodeId).draw!==0;
          });
          const region=revealedRegion(plan.nodes.find(n=>n.id===target.nodeId),time,plan,target);
          measured.set(target,{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),opacity:ink?opacity(el,root)*state.get(target.nodeId).textProgress:0,
            clipped:region.width<target.width-.5||region.height<target.height-.5});
          // Large unrelated foreground fills must not hide the event. Intended
          // overlaps within one articulated actor are left to pose review.
          const own=plan.nodes.find(n=>n.id===target.nodeId),later=plan.nodes.slice(plan.nodes.indexOf(own)+1)
            .filter(n=>n.rig?.actorId!==own.rig?.actorId||!own.rig).filter(n=>!event.coverage.some(c=>c.nodeId===n.id));
          const probes=[.25,.5,.75].flatMap(x=>[.25,.5,.75].map(y=>point(m,{x:target.x+x*target.width,y:target.y+y*target.height})));
          for(const n of later)for(const path of elements.get(n.id)?.querySelectorAll('path')||[]) {
            const style=getComputedStyle(path);if(style.fill==='none'||Number(style.fillOpacity)<.8||opacity(path,root)<.8)continue;
            const inv=root.getScreenCTM().inverse().multiply(path.getScreenCTM()).inverse();
            if(probes.filter(p=>{const q=point(inv,p);return inReveal(n.id,q)&&path.isPointInFill(new DOMPoint(q.x,q.y));}).length>=7)issues.push(target.nodeId+' 的关键动作被 '+n.id+' 遮挡');
          }
        }
        issues.push(...coverageIssues(plan,event,time,measured));
      }
      const routes=[];
      for(const c of plan.layout?.connectors||[]) {
        if(time<c.from||time>=c.until)continue;
        const points=routeConnector(port(plan,time,c.fromId,c.fromX,c.fromY),port(plan,time,c.toId,c.toX,c.toY),allLabels,
          {x:plan.width*.025,y:plan.height*.025,width:plan.width*.95,height:plan.height*.815},10+c.strokeWidth/2);
        routes.push({...c,d:points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')});
      }
      if(issues.length)throw Error('排版检查 '+time.toFixed(3)+' 秒：'+[...new Set(issues)].slice(0,6).join('；'));
      setResult({key,routes,error:null});
    }).catch(error=>{if(active)setResult({key,routes:[],error});}).finally(()=>continueRender(handle));
    return ()=>{active=false;continueRender(handle);};
  },[plan,time,ref,key]);
  if(result.error&&result.key===key)throw result.error;
  return result.key===key?result.routes:[];
}

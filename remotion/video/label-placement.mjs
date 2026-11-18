import {boxesOverlap,expandBox,labelIssues} from '../shared/layout-geometry.mjs';
import {sampledStrokeHitsBox} from './stroke-sampling.mjs';
import {isStationaryBoard,quietGridPaint,quietScenery,readableOnPaint} from './painted-geometry.mjs';

const point=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});

export function artworkObstacles(root,plan,time,geometry) {
  const {boxInRoot,opacity,state,inReveal}=geometry,shapes=[],boards=new Map();
  const rootInverse=root.getScreenCTM().inverse();
  for(const el of root.querySelectorAll('[data-motion-node] path')) {
    const alpha=opacity(el,root);
    if(alpha<.12)continue;
    const id=el.closest('[data-motion-node]').getAttribute('data-motion-node');
    const node=plan.nodes.find(n=>n.id===id),style=getComputedStyle(el);
    const matrix=rootInverse.multiply(el.getScreenCTM()),inverse=matrix.inverse();
    const body=boxInRoot(el,root),scale=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d));
    const length=el.getTotalLength()*(state.get(id).draw??1);
    if(!length)continue;
    const padding=2+Number.parseFloat(style.strokeWidth)*scale/2;
    const strokeBounds=expandBox(body,padding);
    const fill=node.role!=='decoration'&&style.fill!=='none'&&Number(style.fillOpacity)>.12;
    const stroke=style.stroke!=='none'&&Number.parseFloat(style.strokeWidth)>0;
    const scenery=quietScenery(plan,node,time,alpha);
    // A dark board may also be the rig root for the data drawn on it.
    // Its border, moving cells and high-contrast markings remain obstacles.
    if(!boards.has(id)&&fill&&Number(style.fillOpacity)>=.95&&body.width>=plan.width*.55&&body.height>=plan.height*.45&&isStationaryBoard(plan,node)) {
      boards.set(id,{el,color:style.fill,alpha:alpha*Number(style.fillOpacity),inside:label=>[0,.5,1].every(dx=>[0,.5,1].every(dy=>{
        const q=point(inverse,{x:label.x+dx*label.width,y:label.y+dy*label.height});
        return el.isPointInFill(new DOMPoint(q.x,q.y));
      }))});
    }
    const board=boards.get(id);
    const behind=(label,paint,isFill=false)=>{
      if(!(el.compareDocumentPosition(label.el)&Node.DOCUMENT_POSITION_FOLLOWING)||!readableOnPaint(label.color,paint))return false;
      if(scenery)return true;
      return !!board&&(board.alpha>=.95||readableOnPaint(label.color,plan.bg))&&
        (isFill?board.el===el:board.el!==el&&!fill&&quietGridPaint(paint,board.color))&&board.inside(label);
    };
    let segments;
    function strokeSegments() {
      if(segments)return segments;
      segments=[];
      const steps=Math.max(1,Math.ceil(length*scale/2)),step=length/steps;
      let last=el.getPointAtLength(0),from=point(matrix,last);
      for(let i=1;i<=steps;i++) {
        const local=el.getPointAtLength(i*step),to=point(matrix,local);
        if(inReveal(id,local))segments.push({from,to,last,local,step});
        last=local;from=to;
      }
      return segments;
    }
    shapes.push(label=>{
      if(label.id===id||!boxesOverlap(label,strokeBounds))return null;
      if(fill&&boxesOverlap(label,body)&&!behind(label,style.fill,true)) {
        for(const dx of [0,.5,1])for(const dy of [0,.5,1]) {
          const q=point(inverse,{x:label.x+dx*label.width,y:label.y+dy*label.height});
          if(inReveal(id,q)&&el.isPointInFill(new DOMPoint(q.x,q.y)))return label.id+' 文字压住 '+id+' 主体图形';
        }
      }
      if(stroke&&!behind(label,style.stroke)) {
        const box=expandBox(label,padding);
        if(strokeSegments().some(s=>sampledStrokeHitsBox(s.from,s.to,s.last,s.local,s.step,box)))return id+' 的线条穿过 '+label.id+' 文字';
      }
      return null;
    });
  }
  return shapes;
}

// Move only an unbound label within its original neighbourhood. A node that
// carries a measured action, an actor or a connector keeps its authored pose.
// Rebuild from the original transform on every frame, including random seeks.
export function placeLabels(labels,obstacles,plan,root) {
  const occupied=[],unit=Math.max(5,Math.round(plan.height*.013));
  const offsets=[{x:0,y:0}];
  for(let i=1;i<=8;i++)for(const [x,y] of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]])offsets.push({x:x*i*unit,y:y*i*unit});
  const locked=new Set([plan.subjectId,...(plan.performance?.events||[]).flatMap(e=>e.coverage.map(c=>c.nodeId)),
    ...(plan.actionEvidence||[]).flatMap(e=>e.nodeIds),...(plan.layout?.connectors||[]).flatMap(c=>[c.fromId,c.toId])]);
  const records=labels.map(label=>{
    const wrapper=label.el.closest('[data-label-placement]'),node=plan.nodes.find(n=>n.id===label.id);
    return {label,wrapper,fixed:!wrapper||locked.has(label.id)||!!node?.rig||!!node?.paths?.length||!!node?.media};
  });
  const rootInverse=root.getScreenCTM().inverse();
  for(const {label,wrapper,fixed} of records.sort((a,b)=>Number(b.fixed)-Number(a.fixed))) {
    if(fixed){occupied.push(label);continue;}
    const width=Number(label.el.getAttribute('data-max-width'));
    // Long quantities with units can use the space between the value and
    // label type sizes. At 720p a fitted value remains at least 30px.
    const floor=label.el.getAttribute('data-text-role')==='value'?.63:.78;
    const scale=width>0?Math.max(floor,Math.min(1,(width-.5)/Math.max(1,label.width))):1;
    const anchor=label.el.getAttribute('text-anchor');
    const px=label.x+label.width*(anchor==='start'?0:anchor==='end'?1:.5),py=label.y+label.height/2;
    const preferred={...label,x:px+(label.x-px)*scale,y:py+(label.y-py)*scale,width:label.width*scale,height:label.height*scale};
    let placed=false;
    for(const offset of offsets) {
      const box={...preferred,x:preferred.x+offset.x,y:preferred.y+offset.y};
      if(labelIssues([box],plan.width,plan.height).length||occupied.some(other=>boxesOverlap(expandBox(box,3),expandBox(other,3)))||obstacles.some(hit=>hit(box)))continue;
      if(offset.x||offset.y||scale!==1) {
        const parent=rootInverse.multiply(wrapper.parentElement.getScreenCTM());
        const transform=root.createSVGMatrix().translate(offset.x+px,offset.y+py).scale(scale).translate(-px,-py);
        const m=parent.inverse().multiply(transform).multiply(parent);
        wrapper.setAttribute('transform',`matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')})`);
      }
      occupied.push(box);placed=true;break;
    }
    if(!placed)occupied.push(label);
  }
}

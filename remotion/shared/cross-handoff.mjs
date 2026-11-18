import {graphicsState,nodeVisualState} from './graphics-state.mjs';
import {sampleMotion} from './motion-dynamics.mjs';

export const bridgeFamilies=['narrative','comparison','causal','product'];
export function bridgeIssues(before,scene,handoff){
  if(handoff?.mode!=='bridge')return [];
  const errors=[];
  if(!before||!bridgeFamilies.includes(before.family)||!bridgeFamilies.includes(scene?.family)||before.family===scene.family)errors.push('跨类型交接需要相邻的图文、数值、因果或产品模型；同类型请使用终态承接');
  if(!handoff.reason?.trim())errors.push('跨类型交接须说明同一对象与新表示之间的关系');
  if(!Number.isFinite(handoff.seconds)||handoff.seconds<.25||handoff.seconds>1.2)errors.push('跨类型交接时间须为0.25–1.2秒');
  if(!Array.isArray(handoff.entityIds)||!handoff.entityIds.length||handoff.entityIds.length>6||new Set(handoff.entityIds).size!==handoff.entityIds.length)errors.push('请选择1–6个不重复的跨镜对象');
  for(const id of handoff.entityIds||[]){
    const a=before?.items?.find(v=>v.id===id),b=scene?.items?.find(v=>v.id===id);
    if(!a||!b||a.label!==b.label)errors.push('交接对象须在前后段具有同一编号与名称：'+id);
    if(a?.assetId&&b?.assetId&&a.assetId!==b.assetId)errors.push('交接对象更换了图片，请用比较或新场景：'+id);
  }
  return errors;
}
// These four compilers produce rects/circles or checked media. A bridge is an
// explicit change of representation, not a claimed morph or numeric trajectory.
function box(node,paths=node.paths){
  if(node.media)return {x:-node.media.width/2,y:-node.media.height/2,width:node.media.width,height:node.media.height};
  const pairs=paths.flatMap(p=>{const nums=p.d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)?.map(Number)||[];return Array.from({length:Math.floor(nums.length/2)},(_,i)=>[nums[2*i],nums[2*i+1]]);});
  if(!pairs.length)throw Error('跨类型交接对象没有可见形状');
  const x=Math.min(...pairs.map(p=>p[0])),y=Math.min(...pairs.map(p=>p[1]));
  return {x,y,width:Math.max(.01,...pairs.map(p=>p[0]-x)),height:Math.max(.01,...pairs.map(p=>p[1]-y))};
}
const frame=(base,time,opacity=base.opacity)=>({...base,time,opacity});
const clean=list=>list.filter((f,i)=>!i||f.time>list[i-1].time);
export function applyCrossHandoff(nodes,scene,{handoff,previousPlan,duration,fps,filmStyle,focusBeats=[],phraseEdits=[]}){
  if(handoff?.mode!=='bridge')return null;
  const issues=bridgeIssues(previousPlan?.semanticModel?.source,scene,handoff);
  if(!filmStyle?.matchCuts)issues.push('请先开启全片镜头衔接');
  if(handoff.seconds>duration-.6)issues.push('交接后需保留至少0.6秒完整观察');
  if(issues.length)throw Error(issues.join('；'));
  const end=handoff.seconds,cut=end*.55,labelOut=end*.15,labelIn=end+.12,oldTime=previousPlan.duration-1/fps,ghosts=[];
  for(const id of handoff.entityIds){
    const target=nodes.find(n=>n.id==='sem-'+id),prior=previousPlan.nodes.find(n=>n.id==='sem-'+id);
    if(!target||!prior)throw Error('跨类型交接找不到实际对象：'+id);
    const old=nodeVisualState(prior,oldTime,previousPlan),g=old.graphics,now=sampleMotion(target.frames,end);
    if(old.visibleOpacity<.95||old.reveal<.95||old.textProgress<.95)throw Error('前镜对象在最后一帧不可见，不能自动交接：'+id);
    if(scene.family==='product'&&now.opacity<.95)throw Error('产品镜头须从交接对象开始展示：'+id);
    if(focusBeats.some(b=>b.entityId===id&&b.from<labelIn)||phraseEdits.some(e=>e.nodeId==='sem-label-'+id&&e.from<labelIn))throw Error('对象台词早于交接完成，请缩短交接或使用比较切镜：'+id);
    const a=box(prior,g.paths),b=box(target,graphicsState(target,end,{fps}).paths),scale=Math.max(.35,Math.min(1.5,b.width/a.width,b.height/a.height));
    if(a.width<.1||a.height<.1||b.width<.1||b.height<.1)throw Error('交接形状没有足够的可见尺寸，请使用比较切换：'+id);
    const start={...old,scaleX:old.scaleX,scaleY:old.scaleY,opacity:old.opacity};
    // Keep only the pose keys; evaluated graphics are frozen separately.
    const pose=Object.fromEntries(['x','y','rotation','scaleX','scaleY','opacity'].map(k=>[k,start[k]]));
    const dest={...pose,x:now.x+(b.x+b.width/2)*now.scaleX-(a.x+a.width/2)*pose.scaleX*scale,y:now.y+(b.y+b.height/2)*now.scaleY-(a.y+a.height/2)*pose.scaleY*scale,scaleX:pose.scaleX*scale,scaleY:pose.scaleY*scale};
    const ghost={id:'handoff-'+id,role:'mechanism',paths:structuredClone(g.paths),...(prior.media?{media:structuredClone(prior.media)}:{}),frames:[frame(pose,0),frame(pose,labelOut),{...frame(dest,cut),easing:'smooth'},frame(dest,end,0),frame(dest,duration,0)]};
    if(prior.media)ghost.graphics={version:1,tracks:['mediaZoom','focusX','focusY'].map(channel=>({channel,frames:[{time:0,value:g[channel]},{time:duration,value:g[channel]}]})),morphs:[],textStates:[]};
    ghosts.push(ghost);
    target.frames=clean([frame(now,0,0),frame(now,cut,0),frame(now,end,1),...target.frames.filter(f=>f.time>end).map(f=>scene.family==='narrative'?{...f,opacity:1}:f)]);
    // Exit the old label before moving the representation, then show the new
    // label in its final reading position. Sliding text would cross the image.
    const label=nodes.find(n=>n.id==='sem-label-'+id),before=previousPlan.nodes.find(n=>n.id==='sem-label-'+id);
    if(label&&before){const l=sampleMotion(before.frames,oldTime),dest=sampleMotion(label.frames,labelIn);label.frames=[frame(l,0,1),frame(l,labelOut,0),frame(dest,end,0),frame(dest,labelIn,1),...label.frames.filter(f=>f.time>labelIn).map(f=>({...f,opacity:1}))];if(label.graphics?.textCues)label.graphics.textCues=label.graphics.textCues.filter(c=>c.mode!=='reveal');}
    const value=nodes.find(n=>n.id==='sem-value-'+id);if(value){const v=sampleMotion(value.frames,end);value.frames=[frame(v,0,0),frame(v,cut,0),frame(v,end,1),...value.frames.filter(f=>f.time>end)];}
    const oldValue=previousPlan.nodes.find(n=>n.id==='sem-value-'+id);if(oldValue){const v=sampleMotion(oldValue.frames,oldTime),vg=graphicsState(oldValue,oldTime,previousPlan);ghosts.push({id:'handoff-value-'+id,role:'mechanism',paths:[],text:{...oldValue.text,value:vg.value},frames:[frame(v,0),frame(v,cut,0),frame(v,duration,0)]});}
  }
  // Ghosts are below incoming objects but above the panel, so one visible
  // representation always remains throughout the handoff.
  nodes.splice(nodes.findIndex(n=>n.id==='sem-subject')+1,0,...ghosts);
  if(scene.family==='causal'){
    // Relations belong to the incoming representation. Showing the new arrow
    // over travelling old pictures makes it appear to connect the wrong thing.
    for(const n of nodes.filter(n=>/^sem-(edge|arrow)-/.test(n.id))){
      const pose=sampleMotion(n.frames,labelIn);
      n.frames=[frame(pose,0,0),frame(pose,end,0),frame(pose,labelIn,1),...n.frames.filter(f=>f.time>labelIn)];
    }
    for(const n of nodes.filter(n=>/^sem-signal-/.test(n.id))){
      const start=n.frames.find(f=>f.opacity>0)?.time;
      if(start!=null&&start<labelIn){
        const scale=(duration-labelIn)/(duration-start);
        n.frames=n.frames.map(f=>({...f,time:f.time<start?0:labelIn+(f.time-start)*scale}));
      }
    }
  }
  return {from:previousPlan.semanticModel.family,to:scene.family,entityIds:[...handoff.entityIds],seconds:end,reason:handoff.reason,method:'position-and-dissolve',previousTime:oldTime};
}

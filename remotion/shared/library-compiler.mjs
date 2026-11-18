import {defaultParams,libraryItem,validateParams,LIBRARY_VERSION} from './motion-library.mjs';
import {sampleMotion,easeMotion} from './motion-dynamics.mjs';
import {cameraAt} from './camera-plan.mjs';
import {worldState} from './actor-rig.mjs';
const clone=v=>structuredClone(v);
const frame=(time,x,y,more={})=>({time,x,y,rotation:0,scaleX:1,scaleY:1,opacity:1,...more});
const track=(d,x,y)=>[frame(0,x,y),frame(d/2,x,y),frame(d,x,y)];
const path=(d,fill='none',stroke='none',strokeWidth=0)=>({d,fill,stroke,strokeWidth});
const rect=(w,h)=>`M ${-w/2} ${-h/2} h ${w} v ${h} h ${-w} Z`;
const circle=r=>`M ${-r} 0 a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0`;
export function templatePlan(id,params,{width=960,height=540,duration=6,preview=false}={}){
  const q=validateParams(id,params,duration),w=width,h=height,u=Math.min(w,h),d=duration;
  const plan={libraryTemplate:id,width:w,height:h,duration:d,bg:q.bg,subjectId:'subject',nodes:[],camera:[{time:0,x:w/2,y:h/2,zoom:1},{time:d,x:w/2,y:h/2,zoom:1}],annotations:[]};
  const shape=(id,drawing,x,y,role='mechanism')=>({id,role,paths:drawing,frames:track(d,x,y)});
  const glyph=(id,value,x,y,size=u*.09)=>({...shape(id,[],x,y),text:{value,font:'sans',size:Math.max(12,Math.min(400,size)),weight:600,color:'#edf4f6'}});
  if(id==='mechanism'){
    const subject=shape('subject',[path(circle(u*.055),q.color)],w*.18,h*.43,'subject');
    subject.frames=[frame(0,w*.14,h*.43),frame(d*.5,w*.5,h*.43),frame(d,w*.86,h*.43)];
    plan.nodes=[shape('track',[path(`M 0 0 H ${w*.8}`,'none','#4a6573',2)],w*.1,h*.43),
      shape('zone',[path(rect(w*.18,h*.44),'#233946',q.color,2)],w*.5,h*.43),subject,
      glyph('label',q.label||'对象',w*.18,h*.62,u*.045)];
    plan.annotations=[{nodeId:'subject',text:'经过作用区',from:d*.35,until:d*.65,x:0,y:-u*.1}];
  }else if(id==='formula-scene'){
    const values=[q.a||'A','+',q.b||'B','=',q.c||'C'];
    plan.nodes=values.map((v,i)=>glyph(i===0?'subject':'symbol-'+i,v,w*(.2+i*.15),h*.43));
    plan.nodes[0].role='subject';
    const move=(n,x,bend)=>{n.frames=[frame(0,n.frames[0].x,h*.43),frame(d*.18,n.frames[0].x,h*.43),frame(d*.76,w*x,h*.43,{easing:'smooth',curve:{x1:n.frames[0].x,y1:h*bend,x2:w*x,y2:h*bend}}),frame(d,w*x,h*.43)];};
    move(plan.nodes[2],.8,.17);move(plan.nodes[3],.35,.6);move(plan.nodes[4],.5,.64);
    plan.nodes[1].frames=[frame(0,w*.35,h*.43),frame(d*.18,w*.35,h*.43),frame(d*.3,w*.35,h*.43,{opacity:0}),frame(d,w*.35,h*.43,{opacity:0})];
    const minus=glyph('minus','−',w*.65,h*.43);minus.frames=[frame(0,w*.65,h*.43,{opacity:0}),frame(d*.65,w*.65,h*.43,{opacity:0}),frame(d*.8,w*.65,h*.43),frame(d,w*.65,h*.43)];plan.nodes.push(minus);
    plan.annotations=[{nodeId:'symbol-2',text:'移项',from:d*.2,until:d*.65,x:0,y:-u*.09}];
  }else if(id==='data-scene'){
    const max=Math.max(1,q.valueA,q.valueB),barW=Math.min(w*.17,u*.3);
    for(const [i,value,label] of [[0,q.valueA,q.labelA],[1,q.valueB,q.labelB]]){
      const x=w*(i?.68:.32),bh=h*.38*Math.max(.02,value/max),bar=shape(i?'bar-b':'subject',[path(rect(barW,bh),i?q.color:'#6999be')],x,h*.68-bh/2,i?'mechanism':'subject');
      bar.libraryBounds={height:bh};bar.libraryEffects=[{kind:'bar',params:{from:0,until:d*.65}}];
      const n=glyph('value-'+i,String(value)+q.unit,x,h*.68-bh-u*.065,u*.065);n.libraryEffects=[{kind:'counter',params:{from:0,until:d*.65,start:0,end:value,decimals:0,suffix:q.unit}}];
      plan.nodes.push(bar,n,glyph('label-'+i,label||String(i+1),x,h*.76,u*.045));
    }
    const delta=glyph('difference','差值 '+Math.abs(q.valueB-q.valueA)+q.unit,w*.5,h*.16,u*.055);delta.libraryEffects=[{kind:'text',params:{from:d*.66,until:d*.85}}];plan.nodes.push(delta);
  }else if(id==='product-scene'){
    const iw=Math.min(w*.68,u*1.3),ih=h*.52;
    const n=shape('subject',[path(rect(iw+u*.035,ih+u*.035),'#233946',q.color,2)],w*.5,h*.43,'subject');
    if(q.assetId)n.media={assetId:q.assetId,width:iw,height:ih,fit:'contain'};
    else if(!preview)throw Error('请选择已确认来源及使用条件的产品图片');
    plan.nodes=[n];if(!q.assetId)plan.nodes.push(glyph('placeholder','产品图片位置',w*.5,h*.43,u*.06));
    plan.camera=[{time:0,x:w*.5,y:h*.5,zoom:1},{time:d*.4,x:w*.52,y:h*.42,zoom:1.3,easing:'smooth'},{time:d*.65,x:w*.52,y:h*.42,zoom:1.3},{time:d,x:w*.5,y:h*.5,zoom:1,easing:'smooth'}];
    plan.annotations=[{nodeId:'subject',text:q.label||'功能细节',from:d*.35,until:d*.7,x:0,y:ih*.45}];
  }else throw Error('镜头模板不存在');
  plan.annotations=plan.annotations.map(a=>({...a,from:Math.min(a.from,d-.11),until:Math.min(d,Math.max(a.until,Math.min(a.from,d-.11)+.11))}));
  return plan;
}
function replaceSegment(frames,from,until,insert,owned){
  const before=frames.filter(f=>f.time<from),after=frames.filter(f=>f.time>until);
  const merged=owned? [...new Set([...insert.map(f=>f.time),...frames.filter(f=>f.time>=from&&f.time<=until).map(f=>f.time)])].sort((a,b)=>a-b).map(time=>{
    const base=sampleMotion(frames,time),effect=sampleMotion(insert,time);
    return {...base,time,...Object.fromEntries(owned.map(k=>[k,effect[k]])),easing:'linear',curve:null};
  }):insert;
  const result=[...before,...merged,...after];
  // Retain the effect's final pose through the remaining shot, not an old snapback.
  if(after.length)for(const f of after)for(const key of owned||Object.keys(insert.at(-1)))if(!['time','curve','easing'].includes(key))f[key]=insert.at(-1)[key];
  return result;
}
export function compileEffects(base,instances){
  const plan=clone(base),w=plan.width,h=plan.height,u=Math.min(w,h);let transition=null;
  const occupied=new Map(),channels={line:['layout'],arc:['layout'],formula:['layout'],orbit:['layout'],draw:['draw'],bar:['bar'],stagger:['opacity'],mask:['reveal'],text:['text-reveal'],typewriter:['text-reveal'],counter:['value'],'text-rise':['opacity'],'text-gradient':['text-fill']};
  for(const instance of instances){
    const e=libraryItem(instance.effectId),q=validateParams(e?.id,instance.params,plan.duration);
    if(e.scope==='transition'){transition={kind:e.id,params:q};continue;}
    const nodes=instance.targets.map(id=>plan.nodes.find(n=>n.id===id));
    if(!nodes.length||nodes.some(n=>!n))throw Error('请选择当前镜头中有效的目标对象');
    if(e.requires==='text'&&nodes.some(n=>!n.text))throw Error('这个动效需要选择文字或公式对象');
    if(e.id==='draw'&&nodes.some(n=>!n.paths.some(p=>p.stroke!=='none'&&p.strokeWidth>0)))throw Error('路径描线需要带描边的对象');
    if(!plan.subjectWindows&&['stagger','text','mask','typewriter','text-rise'].includes(e.id)&&nodes.some(n=>n.id===plan.subjectId))throw Error('主体须持续可见，请选择内容对象或使用路径类动效');
    for(const [index,n] of nodes.entries()){
      for(const channel of channels[e.id]||[]){const key=n.id+':'+channel,spans=occupied.get(key)||[];if(spans.some(s=>q.from<s.until&&q.until>s.from))throw Error('动效通道冲突：'+n.id+' '+channel);spans.push(q);occupied.set(key,spans);}
      const at=sampleMotion(n.frames,q.from),pose=(t,x=at.x,y=at.y,extra={})=>({...at,time:t,x,y,curve:null,...extra});
      if(['line','arc','formula'].includes(e.id)){
        const x0=q.x0*w/100,y0=q.y0*h/100,x1=q.x1*w/100,y1=q.y1*h/100;
        // A single cubic preserves the requested arc and speed; midpoint is sampled exactly.
        const track=[pose(q.from,x0,y0),pose(q.until,x1,y1,{easing:q.easing,...(e.id==='line'?{}:{curve:{x1:x0,y1:y0+q.bend*h/100,x2:x1,y2:y1+q.bend*h/100}})})];
        const inner=Array.from({length:17},(_,i)=>({...sampleMotion(track,q.from+(q.until-q.from)*i/16),time:q.from+(q.until-q.from)*i/16,easing:'linear',curve:null}));
        n.frames=replaceSegment(n.frames,q.from,q.until,inner,['x','y']);
      }else if(e.id==='orbit'){
        const r=q.radius*u/100,cx=q.cx*w/100,cy=q.cy*h/100;
        const frames=Array.from({length:33},(_,i)=>{const a=easeMotion(i/32,q.easing)*Math.PI*2*q.turns;return pose(q.from+(q.until-q.from)*i/32,cx+Math.cos(a)*r,cy+Math.sin(a)*r,{easing:'linear'});});
        n.frames=replaceSegment(n.frames,q.from,q.until,frames,['x','y']);
      }else if(e.id==='draw'){
        n.frames=replaceSegment(n.frames,q.from,q.until,[pose(q.from,at.x,at.y,{draw:0}),pose((q.from+q.until)/2,at.x,at.y,{draw:.5}),pose(q.until,at.x,at.y,{draw:1})],['draw']);
        for(const f of n.frames)if(f.time<q.from)f.draw=0;
      }else if(e.id==='arrow'){
        const len=u*q.length/100,offset=u*.13,arrow={id:'arrow-'+instance.instanceId.replace(/[^\w-]/g,'').slice(0,35)+'-'+index,role:'mechanism',paths:[path(`M ${-len/2} 0 H ${len/2} m -12 -8 l 12 8 l -12 8`,'none',q.color,3)],frames:n.frames.map(f=>({...f,y:f.y+offset,draw:f.time<=q.from?0:f.time>=q.until?1:(f.time-q.from)/(q.until-q.from)}))};
        for(const t of [q.from,q.until])if(!arrow.frames.some(f=>f.time===t)){const f=sampleMotion(n.frames,t);arrow.frames.push({...f,time:t,y:f.y+offset,draw:t===q.from?0:1});}arrow.frames.sort((a,b)=>a.time-b.time);plan.nodes.push(arrow);
      }else if(['push','follow'].includes(e.id)){
        const ca=cameraAt(plan,q.from),times=[q.from,...n.frames.filter(f=>f.time>q.from&&f.time<q.until).map(f=>f.time),q.until];
        const target=worldState(plan,q.from).point(n.id,n.rig?.pivot);
        const cam=times.map(t=>{const pos=worldState(plan,t).point(n.id,n.rig?.pivot),k=(t-q.from)/(q.until-q.from);return {time:t,x:e.id==='follow'?pos.x:ca.x+(target.x-ca.x)*k,y:e.id==='follow'?pos.y:ca.y+(target.y-ca.y)*k,zoom:ca.zoom+(q.zoom-ca.zoom)*k,easing:'smooth'};});
        plan.camera=replaceSegment(plan.camera,q.from,q.until,cam);
        // New plans retain the authored event coverage; validation checks the
        // resulting path. Legacy library edits still regenerate camera plans.
        if(!plan.performance)delete plan.cameraShots;
        delete plan.cameraPlanVersion;
      }else{
        const start=q.from+(e.id==='stagger'?index*q.stagger:0);if(start>=q.until)throw Error('依次入场的间隔超过动作时长');
        n.libraryEffects=[...(n.libraryEffects||[]),{kind:e.id,params:{...q,from:start}}];
      }
    }
  }
  return {plan,transition};
}
export function demoFor(id,params,{width=960,height=540,duration=6}={}){
  if(libraryItem(id)?.type==='template')return {plan:templatePlan(id,params,{width,height,duration,preview:true}),transition:null};
  const base=templatePlan('mechanism',defaultParams('mechanism'),{width,height,duration});
  const n=base.nodes.find(n=>n.id==='label');n.text.value=['counter'].includes(id)?'100':'观察变化，理解过程';n.frames=track(duration,width*.5,height*.7);n.text.size=Math.max(12,Math.min(width*.055,height*.065));
  const target=['text','counter','formula','typewriter','text-rise','text-gradient'].includes(id)?'label':['draw','highlight','mask','stagger','bar'].includes(id)?'zone':'subject';
  return compileEffects(base,[{instanceId:'demo',effectId:id,params,targets:id==='stagger'?['zone','label']:[target]}]);
}

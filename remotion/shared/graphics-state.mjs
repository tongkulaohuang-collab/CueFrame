import {spring} from 'remotion';
import {sampleMotion,easeMotion,motionEasings} from './motion-dynamics.mjs';
import {textOpacity,focusOpacity} from './content-visibility.mjs';
export {ownsVisibility} from './content-visibility.mjs';

// This evaluator is shared by SVG rendering, action evidence and visibility
// checks. It is a pure function of scene time, including random-access renders.
export const GRAPHICS_VERSION=1;
const clamp=v=>Math.max(0,Math.min(1,v));
const limits={opacity:[0,1],scale:[.05,10],reveal:[0,1],mediaZoom:[1,8],focusX:[0,100],focusY:[0,100]};
export const graphicsChannels=Object.keys(limits);
const segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});
export const graphemes=s=>Array.from(segmenter.segment(s),p=>p.segment);
export function trackValue(frames,time) {
  const i=frames.findIndex(f=>f.time>=time);
  if(i<=0)return frames[i===0?0:frames.length-1].value;
  const a=frames[i-1],b=frames[i];
  return a.value+(b.value-a.value)*easeMotion((time-a.time)/(b.time-a.time),b.easing);
}
const progress=(q,t)=>clamp((t-q.from)/(q.until-q.from));
const entry=(q,t,fps)=>clamp(spring({frame:(t-q.from)*fps,fps,config:{damping:200,stiffness:100,mass:1},durationInFrames:Math.max(1,(q.until-q.from)*fps)}));
export function libraryNodeState(node,time,fps=24) {
  let value=node.text?.value,opacity=1,scaleY=1,mask=null,highlight=null,textReveal=null,letters=null,rise=0,gradient=null;
  const particles=[];
  for(const {kind,params:q} of node.libraryEffects||[]) {
    const t=progress(q,time);
    if(kind==='counter')value=(q.start+(q.end-q.start)*easeMotion(t,'smooth')).toFixed(q.decimals)+q.suffix;
    if(kind==='stagger')opacity*=entry(q,time,fps);
    if(kind==='bar')scaleY*=.02+.98*easeMotion(t,'smooth');
    if(kind==='mask')mask={progress:t,width:q.width};
    if(kind==='highlight'&&time>=q.from&&time<q.until)highlight=q;
    if(kind==='text')textReveal={q,time,fps};
    if(kind==='typewriter')letters=Math.floor(graphemes(value).length*t);
    if(kind==='text-rise'){opacity*=easeMotion(t,'smooth');rise=q.distance*(1-easeMotion(t,'ease-out'));}
    if(kind==='text-gradient')gradient={...q,progress:t};
    if(kind==='particles')particles.push(q);
  }
  return {value,opacity,scaleY,mask,highlight,textReveal,letters,rise,gradient,particles};
}

function pathTokens(d) {
  if(typeof d!=='string'||d.length>12000||!/^[MLCQZmlcqz\d.eE,+\s-]+$/.test(d))throw Error('图形形变仅支持对应的 M/L/C/Q/Z 路径');
  const tokens=d.match(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  if(d.replace(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,'').replace(/[\s,]/g,''))throw Error('形变路径包含不完整数字');
  if(!['M','m'].includes(tokens[0]))throw Error('形变路径必须从 M 开始');
  let command='',count=0;
  const arity={M:2,L:2,C:6,Q:4,Z:0};
  const check=()=>{const n=arity[command.toUpperCase()];if(command&&(n===0?count!==0:count===0||count%n!==0))throw Error('形变路径参数数量无效');};
  for(const v of tokens)if(/^[a-z]$/i.test(v)){check();command=v;count=0;}else {if(!Number.isFinite(Number(v))||Math.abs(Number(v))>16384)throw Error('形变路径坐标无效');count++;}
  check();return tokens;
}
export function morphPath(a,b,t) {
  const x=pathTokens(a),y=pathTokens(b);
  if(x.length!==y.length||x.some((v,i)=>/^[a-z]$/i.test(v)?v!==y[i]:/^[a-z]$/i.test(y[i])))throw Error('形变路径须有相同命令、顺序和参数数量');
  if(t<=0)return a;if(t>=1)return b;
  return x.map((v,i)=>/^[a-z]$/i.test(v)?v:String(Number((Number(v)+(Number(y[i])-Number(v))*t).toFixed(5)))).join(' ');
}
export function graphicsState(node,time,plan={}) {
  const g=node.graphics,library=libraryNodeState(node,time,plan.fps||24),u=Math.min(plan.width||1280,plan.height||720);
  const channels={opacity:1,scale:1,reveal:1,mediaZoom:1,focusX:50,focusY:50};
  for(const t of g?.tracks||[])channels[t.channel]=Math.max(limits[t.channel][0],Math.min(limits[t.channel][1],trackValue(t.frames,time)));
  const mask=g?.reveal?{...g.reveal,progress:channels.reveal}:library.mask?{
    direction:'right',bounds:{x:-library.mask.width*u/200,y:-u*2,width:library.mask.width*u/100,height:u*4},progress:library.mask.progress}:null;
  const lines=g?.textStates?.findLast(s=>time>=s.from)?.lines;
  const paths=g?.morphs?.length?node.paths.map((p,i)=>{const m=g.morphs.find(m=>m.pathIndex===i);return m?{...p,d:morphPath(m.from,m.to,trackValue(m.frames,time))}:p;}):node.paths;
  const bottom=(node.libraryBounds?.height??u*.4)/2,pivot=g?.pivot||{x:0,y:0};
  return {...channels,library,paths,lines,mask,pivot,
    opacity:channels.opacity*library.opacity,
    scaleX:channels.scale,scaleY:channels.scale*library.scaleY,
    offsetX:pivot.x*(1-channels.scale),
    offsetY:pivot.y*(1-channels.scale)+library.rise*u/100+bottom*(1-library.scaleY),
    morphProgress:g?.morphs?.map(m=>trackValue(m.frames,time))||[],
    value:lines?lines.join(''):library.value};
}
export function nodeVisualState(node,time,plan={}) {
  const f=sampleMotion(node.frames,time),g=graphicsState(node,time,plan);
  const runs=node.text?textRuns(node,g.lines||[node.text.value],time,plan.fps||24).flat():[];
  return {...f,opacity:f.opacity*g.opacity,visibleOpacity:f.opacity*g.opacity*textOpacity(plan,node,time)*focusOpacity(plan,node.id,time),scaleX:f.scaleX*g.scaleX,scaleY:f.scaleY*g.scaleY,
    reveal:g.mask?.progress??1,emphasis:g.scale,mediaZoom:g.mediaZoom,focusX:g.focusX,focusY:g.focusY,
    morph:g.morphProgress[0]??0,morphByPath:Object.fromEntries((node.graphics?.morphs||[]).map((m,i)=>[m.pathIndex,g.morphProgress[i]])),textValue:g.value,textProgress:runs.length?runs.reduce((sum,r)=>sum+r.opacity,0)/runs.length:1,graphics:g};
}
export function revealBox(mask) {
  if(!mask)return null;
  const {bounds:b,direction:d,progress:p}=mask;
  return {x:b.x+(d==='left'?b.width*(1-p):0),y:b.y+(d==='up'?b.height*(1-p):0),
    width:b.width*(['left','right'].includes(d)?p:1),height:b.height*(['up','down'].includes(d)?p:1)};
}
// A declared rectangle is visible only to the extent actually revealed.
export function revealedRegion(node,time,plan,box) {
  const clip=revealBox(graphicsState(node,time,plan).mask);if(!clip)return box;
  const x=Math.max(box.x,clip.x),y=Math.max(box.y,clip.y);
  return {x,y,width:Math.max(0,Math.min(box.x+box.width,clip.x+clip.width)-x),height:Math.max(0,Math.min(box.y+box.height,clip.y+clip.height)-y)};
}

export function textRuns(node,lines,time,fps=24,override) {
  const lib=libraryNodeState(node,time,fps),states=node.graphics?.textStates?.findLast(s=>time>=s.from);
  let layout=states?.lines||lines;
  const value=override??lib.value;
  const counter=node.libraryEffects?.find(e=>e.kind==='counter');
  if(!states&&counter){
    const q=counter.params,end=q.end.toFixed(q.decimals),current=value.slice(0,value.length-q.suffix.length||undefined);
    layout=layout.map(line=>line.includes(end)?line.replace(end,current):line);
    if(layout.length===1)layout=[value];
  }
  let index=0,phrase=0,offset=0;
  const totalPhrases=Math.max(1,(layout.join('').match(/[^，。！？,;；]+[，。！？,;；]?/gu)||[]).length);
  return layout.map(line=>graphemes(line).map(char=>{
    let alpha=lib.letters==null?1:(index<lib.letters?1:0);
    if(lib.textReveal){const {q}=lib.textReveal,step=(q.until-q.from)/totalPhrases;alpha*=entry({from:q.from+phrase*step,until:q.from+(phrase+1)*step},time,fps);}
    const start=(node.text?.value||'').indexOf(char,offset),end=(start<0?offset:start)+char.length;offset=end;
    let fill;
    for(const cue of node.graphics?.textCues||[])if(start>=cue.start&&end<=cue.end){
      if(cue.mode==='reveal')alpha*=easeMotion(clamp((time-cue.from)/Math.min(.15,cue.until-cue.from)),'smooth');
      else if(time>=cue.from&&time<cue.until)fill=cue.color||node.text.color;
    }
    index++;if(/[，。！？,;；]/u.test(char))phrase++;
    return {char,opacity:alpha,...(fill?{fill}:{})};
  }));
}

export function validateGraphics(node,duration) {
  const g=node.graphics;if(!g)return;
  const fail=s=>{throw Error('图文动效：'+node.id+' '+s);};
  if(g.version!==1||!Array.isArray(g.tracks)||g.tracks.length>6||!Array.isArray(g.morphs)||g.morphs.length>12||!Array.isArray(g.textStates)||g.textStates.length>24)fail('版本或轨道结构无效');
  const frames=(list,min,max)=>{if(!Array.isArray(list)||list.length<2||list.length>64||list[0].time!==0||Math.abs(list.at(-1).time-duration)>.001||list.some((f,i)=>!Number.isFinite(f.time)||f.time<0||f.time>duration||i>0&&f.time<=list[i-1].time||!Number.isFinite(f.value)||f.value<min||f.value>max||f.easing!=null&&!motionEasings.includes(f.easing)))fail('轨道须从0覆盖到镜尾，时间递增且数值在范围内');};
  const seen=new Set();
  for(const t of g.tracks){if(!limits[t.channel]||seen.has(t.channel))fail('通道不存在或重复');seen.add(t.channel);frames(t.frames,...limits[t.channel]);}
  if(g.pivot&&![g.pivot.x,g.pivot.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=16384))fail('锚点无效');
  if(node.text&&g.pivot&&(g.pivot.x!==0||g.pivot.y!==0))fail('文字强调使用其排版基线锚点(0,0)');
  if(seen.has('reveal')!==Boolean(g.reveal))fail('揭示轨道和裁切边界必须同时提供');
  if(g.reveal&&(!['right','left','up','down'].includes(g.reveal.direction)||!g.reveal.bounds||!['x','y','width','height'].every(k=>Number.isFinite(g.reveal.bounds[k])&&Math.abs(g.reveal.bounds[k])<=16384)||g.reveal.bounds.width<=0||g.reveal.bounds.height<=0))fail('揭示方向或边界无效');
  if(['mediaZoom','focusX','focusY'].some(c=>seen.has(c))&&!node.media)fail('图片焦点轨道需要真实媒体');
  const paths=new Set();
  for(const m of g.morphs){if(!Number.isInteger(m.pathIndex)||!node.paths[m.pathIndex]||paths.has(m.pathIndex))fail('形变路径编号无效或重复');paths.add(m.pathIndex);frames(m.frames,0,1);morphPath(m.from,m.to,.5);if(node.paths[m.pathIndex].d!==m.from)fail('形变初始路径须与对象设计一致');}
  if(g.textStates.length&&!node.text)fail('内容替换需要文字节点');
  for(const [i,s] of g.textStates.entries())if(!Number.isFinite(s.from)||s.from<0||s.from>=duration||i>0&&s.from<=g.textStates[i-1].from||!Array.isArray(s.lines)||!s.lines.length||s.lines.length>3||s.lines.some(l=>typeof l!=='string'||!l.trim()||/[\r\n]|\s{2,}/u.test(l))||[...s.lines.join('')].length>80)fail('文字状态的时间或分行无效');
  const kinds=(node.libraryEffects||[]).map(e=>e.kind);
  if(g.textCues!=null){
    if(!Array.isArray(g.textCues)||g.textCues.length>80)fail('语块定时结构无效');
    if(g.textCues.length&&(!node.text||g.textStates.some(s=>s.from!==0||s.lines.join('')!==node.text.value)||kinds.some(k=>['counter','typewriter','text','text-gradient'].includes(k))))fail('语块定时需要固定文字与分行，不能与改字、逐字或渐变效果混用');
    const boundaries=new Set([0]);let at=0;for(const c of graphemes(node.text?.value||'')){at+=c.length;boundaries.add(at);}
    for(const [i,c] of g.textCues.entries()){
      if(!boundaries.has(c.start)||!boundaries.has(c.end)||c.end<=c.start||!['reveal','emphasis'].includes(c.mode)||!Number.isFinite(c.from)||!Number.isFinite(c.until)||c.from<0||c.until<=c.from||c.until>duration||c.color!=null&&!/^#[0-9a-f]{6}$/i.test(c.color))fail('语块必须按完整字符划定，并有有效时间与颜色');
      if(g.textCues.slice(0,i).some(p=>p.mode===c.mode&&p.start<c.end&&p.end>c.start&&p.from<c.until&&p.until>c.from))fail('同一语块的同类动效不能重叠');
      for(const m of node.text.value.matchAll(/\d+(?:\.\d+)?(?:[%％]|[a-zA-Z]+|°C|万元|元|个|秒|米|千克|公里)?|[a-zA-Z]+/gu))if(c.start<m.index+m[0].length&&c.end>m.index&&(c.start>m.index||c.end<m.index+m[0].length))fail('数字与单位、英文单词须作为完整语块');
    }
  }
  if(seen.has('opacity')&&kinds.some(k=>['stagger','text-rise'].includes(k))||seen.has('reveal')&&kinds.includes('mask')||seen.has('scale')&&kinds.includes('bar')||g.textStates.length&&kinds.some(k=>['counter','typewriter','text'].includes(k)))fail('多个效果占用同一通道，请明确使用一个轨道');
}

export const graphicsInstructions='图文动效可在 node.graphics 给 version=1、pivot{x,y}(无锚点填null)、tracks[{channel,frames:[{time,value,easing}]}]、reveal(无则null)、morphs[]、textStates[]、可选textCues[]。textCues每项为{start,end,from,until,mode:reveal/emphasis,color:null或六位十六进制色}；start/end是完整文字UTF-16区间，绑定实际语音时间，按完整语块显现或短时关键词着色，不拆数字单位、英文单词或字素，不与逐字/计数/动态改字混用；布局始终保留完整文字，未使用填null。轨道从0到duration；channel为opacity[0,1]、scale[.05,10]、reveal[0,1]、mediaZoom[1,8]、focusX/focusY[0,100]。reveal={direction:right/left/up/down,bounds:{x,y,width,height}}与reveal轨道同时给。scale是局部强调，文字也生效，相机字号保护不抵消它；文字pivot为0,0。morphs={pathIndex,from,to,frames}，仅同命令同参数数量的M/L/C/Q/Z路径，进度0–1，初态与paths一致。textStates={from,lines}按实际事件换内容，固定分行；不要用文字替代物理机制。没有动效填graphics=null。显现、停留、变化、退出围绕真实语音安排，不能重复占用通道。主体需进出时给motion.subjectWindows[{from,until,reason}]定义完全可见的阅读/机制窗口，事件coverage仍必须实际可见，不可用假主体绕过。';

// Deterministic content models compiled to the SAME nodes used by production
// MotionArtwork. No DOM screenshots, external rendering or generated answers.
import {applyNarrationMotion,applyMatchedHandoff} from './semantic-motion.mjs';
import {applyPhraseEdits} from './phrase-edits.mjs';
import {applyCrossHandoff} from './cross-handoff.mjs';
import {validateImageTextLayers} from './image-text-layers.mjs';
export const SEMANTIC_VERSION=1;
export const semanticFamilies=Object.freeze([
  {id:'comparison',name:'数值比较',status:'supported',limit:'同单位非负数，最多 6 组'},
  {id:'causal',name:'因果链',status:'supported',limit:'明确给定的有向无环关系；不自动推断因果'},
  {id:'narrative',name:'图文叙事',status:'supported',limit:'2–6 个事件，图像或符号，不含人物表演'},
  {id:'image-text',name:'图片文字分层',status:'experimental',limit:'一张原图、同尺寸无字底图与透明文字层；需人工核对真实拆层'},
  {id:'product',name:'真实产品演示',status:'supported',limit:'只采用已核对的图片，不生成界面或按钮'},
  {id:'proportion',name:'占比与分配',status:'experimental',limit:'非负权重；显示实际分母'},
  {id:'trend',name:'数据趋势',status:'experimental',limit:'最多 12 个有序观测点，不外推'},
  {id:'ratio',name:'比值关系',status:'experimental',limit:'仅 a/b，分母大于零'},
  {id:'network',name:'关系网络',status:'experimental',limit:'最多 6 个节点，按真实边展示连接'},
  {id:'probability',name:'概率抽样',status:'experimental',limit:'独立伯努利样本，不代表普遍规律'},
  {id:'optimization',name:'优化过程',status:'experimental',limit:'仅 f(x)=x² 的梯度下降'},
  {id:'structure',name:'结构拆解',status:'experimental',limit:'抽象部件层次，不是解剖或 CAD 模型'},
  {id:'physical',name:'匀速运动',status:'experimental',limit:'仅一维匀速模型，不含碰撞或流体'},
]);
export const semanticStyles=Object.freeze({
  editorial:{name:'纸本图解',bg:'#f4eee2',ink:'#24342e',accent:'#b83b2d',secondary:'#306e64',muted:'#c9c8b6',font:'sans'},
  technical:{name:'深色实验室',bg:'#0e1826',ink:'#edf4fa',accent:'#6bd9c4',secondary:'#f3b664',muted:'#385064',font:'sans'},
  minimal:{name:'清晰白底',bg:'#ffffff',ink:'#182b46',accent:'#3158b8',secondary:'#bb4d36',muted:'#c3cfdf',font:'sans'},
});
const fail=message=>{throw Error('内容组件：'+message);};
const number=(v,min=-1e6,max=1e6)=>Number.isFinite(v)&&v>=min&&v<=max;
const label=v=>typeof v==='string'&&v.trim()&&[...v].length<=24&&!/[\r\n]/.test(v);
export function validateSemanticScene(s, assets=[]) {
  if(!s||s.version!==1||!semanticFamilies.some(f=>f.id===s.family)||!semanticStyles[s.style])fail('版本、类型或风格无效');
  if(s.title&&!label(s.title)||s.unit&&(!label(s.unit)||[...s.unit].length>8))fail('标题须为不超过 24 字的单行文本，单位最多 8 字');
  if(!Array.isArray(s.items)||s.items.length>6||s.items.some(v=>!v||!/^[\w-]{1,35}$/.test(v.id)||!label(v.label))||new Set(s.items.map(v=>v.id)).size!==s.items.length)fail('对象编号须唯一，名称须简短，最多 6 项');
  if(s.items.some(v=>v.focusQuote!=null&&(typeof v.focusQuote!=='string'||v.focusQuote.length>80)))fail('对象强调台词最多 80 字');
  if(s.items.some(v=>v.focus!=null&&(!v.assetId||!number(v.focus.x,0,100)||!number(v.focus.y,0,100)||!number(v.focus.zoom,1,4))))fail('图片焦点需已选图片、0–100% 位置及 1–4 倍局部放大');
  if(['comparison','proportion','ratio','causal','network','structure','narrative','product'].includes(s.family)&&s.items.length<2)fail('至少提供两个真实对象');
  if(['comparison','proportion','ratio'].includes(s.family)&&s.items.some(v=>!number(v.value,0)))fail('数值须为有限非负数');
  if(['proportion','ratio'].includes(s.family)&&s.items.reduce((sum,v)=>sum+v.value,0)<=0)fail('分母不能为零');
  if(s.family==='ratio'&&(s.items.length!==2||s.items[1].value===0))fail('比值需要两个数，第二个为非零分母');
  if(s.family==='comparison'&&s.items.some(v=>v.to!=null&&!number(v.to,0)))fail('目标数值须为非负数');
  if(['causal','network'].includes(s.family)){
    if(!Array.isArray(s.edges)||!s.edges.length||s.edges.length>15||s.edges.some(e=>e.from===e.to||![e.from,e.to].every(id=>s.items.some(v=>v.id===id)))||new Set(s.edges.map(e=>e.from+':'+e.to)).size!==s.edges.length)fail('连接关系须引用真实、不同的对象，且不能重复');
    if(s.family==='causal'){
      const visiting=new Set(),done=new Set();
      const visit=id=>{if(visiting.has(id))fail('因果链存在循环，请改用关系网络或重审因果');if(done.has(id))return;visiting.add(id);for(const e of s.edges.filter(e=>e.from===id))visit(e.to);visiting.delete(id);done.add(id);};
      s.items.forEach(v=>visit(v.id));
    }
  }
  if(s.family==='image-text'&&(s.items.length!==1||!s.items[0].assetId||!s.items[0].imageText))fail('文字分层模型需要一张图片及其完整分层素材');
  if(s.family==='product'||s.items.some(v=>v.assetId))for(const v of s.items){
    if(!v.assetId&&s.family!=='product')continue;
    if(!assets.some(a=>a.id===v.assetId&&a.kind==='image'&&a.confirmed&&a.source&&a.license))fail('产品或叙事图片必须采用已核对来源的图片素材');
  }
  if(s.family==='trend'&&(!Array.isArray(s.series)||s.series.length<2||s.series.length>12||s.series.some((v,i)=>!number(v.x)||!number(v.y)||i>0&&v.x<=s.series[i-1].x)))fail('趋势需要 2–12 个 x 递增的观测点');
  const p=s.parameters||{};
  for(const v of s.items)if(v.imageText){if(!['narrative','product','image-text'].includes(s.family))fail('图中文字分层只用于图文或图片模型');validateImageTextLayers(v.imageText,v.assetId,assets);}
  if(s.family==='probability'&&(!number(p.probability,0,1)||!Number.isInteger(p.count)||p.count<4||p.count>96||!Number.isInteger(p.seed)||p.seed<0||p.seed>0xffffffff))fail('概率应为 0–1，样本数 4–96，种子为非负 32 位整数');
  if(s.family==='optimization'&&(!number(p.initial,-100,100)||p.initial===0||!number(p.rate,.01,.49)||!Number.isInteger(p.steps)||p.steps<2||p.steps>12))fail('平方损失模型需要非零初值、0.01–0.49 步长及 2–12 次迭代');
  if(s.family==='physical'&&(!number(p.initial,-100,100)||!number(p.speed,-100,100)||p.speed===0))fail('匀速模型需要有限初始位置和非零速度');
  return s;
}
export function evaluateSemanticScene(s, assets=[]) {
  validateSemanticScene(s,assets);
  const p=s.parameters||{},out={items:s.items.map(v=>({...v})),edges:s.edges||[],series:s.series||[]};
  if(s.family==='proportion') {out.total=s.items.reduce((a,v)=>a+v.value,0);out.shares=s.items.map(v=>v.value/out.total);}
  if(s.family==='ratio')out.ratio=s.items[0].value/s.items[1].value;
  if(s.family==='probability'){
    let seed=p.seed>>>0;
    out.outcomes=Array.from({length:p.count},()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296<p.probability;});
    out.successes=out.outcomes.filter(Boolean).length;out.frequency=out.successes/p.count;
  }
  if(s.family==='optimization') {out.iterations=[p.initial];for(let i=0;i<p.steps;i++)out.iterations.push(out.iterations.at(-1)*(1-2*p.rate));out.losses=out.iterations.map(x=>x*x);}
  return out;
}
const rounded=v=>Number(v.toFixed(3)).toString();
const rect=(x,y,w,h)=>`M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
const circle=r=>`M ${-r} 0 C ${-r} ${-r*.5523} ${-r*.5523} ${-r} 0 ${-r} C ${r*.5523} ${-r} ${r} ${-r*.5523} ${r} 0 C ${r} ${r*.5523} ${r*.5523} ${r} 0 ${r} C ${-r*.5523} ${r} ${-r} ${r*.5523} ${-r} 0 Z`;
export function compileSemanticScene(scene,{width=960,height=540,duration=6,fps=24,assets=[],filmStyle=null,speechTiming=null,comparisonMax=null,physicalDomain=null,focusBeats=[],previousPlan=null,continuityOrder=null,phraseEdits=[],handoff=null}={}) {
  if(filmStyle?.source==='reference'&&!filmStyle.ready)throw Error(filmStyle.message);
  const order=continuityOrder||previousPlan?.semanticModel?.source.items.map(v=>v.id);
  if(filmStyle?.matchCuts&&order&&['comparison','narrative'].includes(scene.family))scene={...scene,items:scene.items.slice().sort((a,b)=>(order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)))};
  const model=evaluateSemanticScene(scene,assets),theme=typeof filmStyle?.theme==='object'?filmStyle.theme:semanticStyles[filmStyle?.theme||scene.style];
  if(!number(duration,.5,3600)||!number(width,160,4096)||!number(height,160,4096))fail('画幅或时长无效');
  const u=Math.min(width,height),font=Math.max(12,u*.035)*(filmStyle?.labelScale||1),nodes=[];
  const color=(v,i)=>filmStyle?.entityColors[v.id]||(i%2?theme.secondary:theme.accent);
  const key=(time,values={})=>({time,x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,...values});
  const still=values=>[key(0,values),key(duration/2,values),key(duration,values)];
  const node=(id,x,y,paths=[],extra={})=>{const n={id:'sem-'+id,role:'mechanism',paths,frames:still({x,y}),...extra};nodes.push(n);return n;};
  const shape=(id,x,y,d,color=theme.accent)=>node(id,x,y,[{d,fill:color,stroke:'none',strokeWidth:0}]);
  const text=(id,value,x,y,size=font,color=theme.ink,maxWidth=width*.84)=>{
    const chars=[...String(value)],weight=c=>c.codePointAt(0)>255?1:.63;
    const measured=chars.reduce((sum,c)=>sum+weight(c),0)*size;
    size=Math.max(12,Math.min(size,maxWidth/Math.max(1,measured/size)));
    const lines=[''];let used=0;
    for(const c of chars){if(used+weight(c)*size>maxWidth&&lines.at(-1)){lines.push('');used=0;}lines[lines.length-1]+=c;used+=weight(c)*size;}
    if(lines.length>3)fail('标签过长，请缩短：'+value);
    return node(id,x,y,[],{text:{value:String(value),font:theme.font,size,color,weight:600},...(lines.length>1?{graphics:{version:1,tracks:[],morphs:[],textStates:[{from:0,lines}]}}:{})});
  };
  const fade=(n,at)=>{const a=Math.max(.001,at),b=Math.min(duration-.001,a+duration*.06);n.frames=[key(0,{...n.frames[0],time:0,opacity:0}),key(a,{...n.frames[0],time:a,opacity:0}),key(b,{...n.frames[0],time:b}),key(duration,{...n.frames[0],time:duration})];return n;};
  const title=scene.title||semanticFamilies.find(f=>f.id===scene.family).name;
  if(scene.title)text('title',title,width/2,height*.12,font*(filmStyle?.titleScale||1.4));
  const panel=shape('subject',width/2,height*.48,rect(-width*.43,-height*.25,width*.86,height*.5),theme.bg);panel.role='subject';
  // The frame is the actual comparison/diagram container, with a visible edge.
  panel.paths[0].stroke=scene.family==='network'?'none':theme.muted;panel.paths[0].strokeWidth=filmStyle?.stroke||1.5;
  const labels=(v,i,x,y,maxWidth=width*.17)=>text('label-'+v.id,v.label,x,y,font*.9,theme.ink,maxWidth);
  const n=scene.items.length;
  if(scene.family==='comparison'){
    const max=Math.max(1,comparisonMax||0,...scene.items.flatMap(v=>[v.value,v.to??v.value]));
    scene.items.forEach((v,i)=>{
      const y=height*(.3+i*.36/Math.max(1,n-1)),x=width*.3,w=width*.48,h=Math.min(height*.055,height*.24/n);
      labels(v,i,width*.18,y+h/2);
      const a=rect(0,0,w*v.value/max,h),z=rect(0,0,w*(v.to??v.value)/max,h);
      const bar=shape(v.id,x,y,a,color(v,i));
      bar.graphics={version:1,tracks:[],morphs:[{pathIndex:0,from:a,to:z,frames:[{time:0,value:0},{time:duration*.2,value:0},{time:duration*.72,value:1,easing:'smooth'},{time:duration,value:1}]}],textStates:[]};
      const value=text('value-'+v.id,rounded(v.value)+(scene.unit||''),width*.86,y+h/2,font*.85);
      if(v.to!=null)value.libraryEffects=[{kind:'counter',params:{from:duration*.2,until:duration*.72,start:v.value,end:v.to,decimals:1,suffix:scene.unit||''}}];
    });
  }else if(['proportion','ratio'].includes(scene.family)){
    if(scene.family==='proportion'){
      let x=width*.12;scene.items.forEach((v,i)=>{const w=width*.76*model.shares[i];shape(v.id,x,height*.34,rect(0,0,w,height*.11),color(v,i));text('label-'+v.id,`${v.label} ${rounded(model.shares[i]*100)}%`,width*(i%2?.7:.3),height*(.52+Math.floor(i/2)*.075),font*.8,theme.ink,width*.33);x+=w;});
      text('total','合计 '+rounded(model.total)+(scene.unit||''),width/2,height*.76);
    }else{
      const max=Math.max(...scene.items.map(v=>v.value)),portrait=height>width;
      scene.items.forEach((v,i)=>{
        if(scene.unit){const n=text(v.id,rounded(v.value),width*.56,height*(.34+i*.24),font*1.7,color(v,i),width*.4);labels(v,i,width*.25,height*(.34+i*.24),width*.26);}
        else{shape(v.id,width*(portrait?.28:.2),height*(.32+i*.19),rect(0,0,width*(portrait?.5:.55)*v.value/max,height*.07),color(v,i));labels(v,i,width*(portrait?.17:.12),height*(.35+i*.19),width*(portrait?.14:.12));}
      });
      if(scene.unit)node('division-line',0,0,[{d:`M ${width*.4} ${height*.46} L ${width*.72} ${height*.46}`,fill:'none',stroke:theme.muted,strokeWidth:2}]);
      const relation=[...scene.items.map(v=>v.value),model.ratio].some(v=>Math.abs(Number(rounded(v))-v)>1e-9)?'≈':'=';
      text('result',`${rounded(scene.items[0].value)} / ${rounded(scene.items[1].value)} ${relation} ${rounded(model.ratio)}${scene.unit?' '+scene.unit:''}`,width/2,height*.76);
    }
  }else if(['causal','network'].includes(scene.family)){
    const position=new Map(scene.items.map((v,i)=>[v.id,scene.family==='causal'?{x:width*(.15+.7*i/(n-1)),y:height*.44}:{x:width/2+width*.28*Math.cos(2*Math.PI*i/n),y:height*.45+height*.16*Math.sin(2*Math.PI*i/n)}]));
    for(const [i,e] of scene.edges.entries()){
      const a=position.get(e.from),b=position.get(e.to),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),r=u*.035;
      const line=node('edge-'+i,0,0,[{d:`M ${a.x+dx*r/len} ${a.y+dy*r/len} L ${b.x-dx*r/len} ${b.y-dy*r/len}`,fill:'none',stroke:theme.muted,strokeWidth:3}]);
      const token=shape('signal-'+i,a.x,a.y,circle(u*.01));const from=duration*(.15+.55*i/scene.edges.length),until=from+duration*.2;
      token.frames=[key(0,{x:a.x,y:a.y,opacity:0}),key(from,{x:a.x,y:a.y}),key(until,{x:b.x,y:b.y}),key(duration,{x:b.x,y:b.y,opacity:0})];
      if(scene.family==='causal') {const bx=b.x-dx*r/len,by=b.y-dy*r/len;node('arrow-'+i,0,0,[{d:`M ${bx-dx*.035-dy*.025} ${by-dy*.035+dx*.025} L ${bx} ${by} L ${bx-dx*.035+dy*.025} ${by-dy*.035-dx*.025}`,fill:'none',stroke:theme.accent,strokeWidth:3}]);}
    }
    scene.items.forEach((v,i)=>{const {x,y}=position.get(v.id);shape(v.id,x,y,circle(u*.035),color(v,i));
      if(scene.family==='network')labels(v,0,x+Math.cos(2*Math.PI*i/n)*u*.12,y+Math.sin(2*Math.PI*i/n)*u*.12,width*.15);
      else labels(v,0,x,y+u*.07,Math.min(width*.14,width*.56/Math.max(1,n-1)));});
  }else if(['trend','optimization'].includes(scene.family)){
    const data=scene.family==='trend'?scene.series:model.losses.map((y,x)=>({x,y})),minX=data[0].x,maxX=data.at(-1).x,minY=Math.min(0,...data.map(v=>v.y)),maxY=Math.max(1,...data.map(v=>v.y));
    const pos=v=>({x:width*(.16+.68*(v.x-minX)/(maxX-minX)),y:height*(.65-.32*(v.y-minY)/(maxY-minY))});
    node('axes',0,0,[{d:`M ${width*.16} ${height*.27} L ${width*.16} ${height*.65} L ${width*.85} ${height*.65}`,fill:'none',stroke:theme.muted,strokeWidth:2}]);
    text('axis-min',rounded(minY),width*.1,height*.65,font*.7);text('axis-max',rounded(maxY),width*.1,height*.3,font*.7);
    data.forEach((v,i)=>{const at=pos(v);if(i){const prev=pos(data[i-1]),line=node('line-'+i,0,0,[{d:`M ${prev.x} ${prev.y} L ${at.x} ${at.y}`,fill:'none',stroke:theme.accent,strokeWidth:3}]);fade(line,duration*(.1+.6*(i-1)/data.length));}fade(shape('point-'+i,at.x,at.y,circle(u*.008)),duration*(.1+.6*i/data.length));});
    text('result',scene.family==='optimization'?`f(x)=x² · ${rounded(model.losses[0])} → ${rounded(model.losses.at(-1))}`:`${rounded(data[0].x)} → ${rounded(data.at(-1).x)}${scene.unit?' · '+scene.unit:''}`,width/2,height*.76,font*.9);
  }else if(scene.family==='probability'){
    const cols=Math.ceil(Math.sqrt(model.outcomes.length*width/height)),rows=Math.ceil(model.outcomes.length/cols),gap=Math.min(width*.7/cols,height*.35/rows);
    model.outcomes.forEach((ok,i)=>fade(shape('sample-'+i,width/2+(i%cols-(cols-1)/2)*gap,height*.3+Math.floor(i/cols)*gap,circle(gap*.28),ok?theme.accent:theme.muted),duration*(.12+.5*i/model.outcomes.length)));
    text('result',`p=${scene.parameters.probability} · 样本 ${model.successes}/${scene.parameters.count}`,width/2,height*.76,font*.9);
  }else if(scene.family==='physical'){
    const {initial,speed}=scene.parameters,finish=initial+speed*duration,x=width*.18,z=width*.82;
    node('track',0,0,[{d:`M ${x} ${height*.5} L ${z} ${height*.5}`,fill:'none',stroke:theme.muted,strokeWidth:2}]);
    const domain=physicalDomain||[Math.min(initial,finish),Math.max(initial,finish)];
    if(domain.length!==2||!domain.every(Number.isFinite)||domain[1]<=domain[0]||initial<domain[0]||finish>domain[1]||finish<domain[0]||initial>domain[1])fail('物理参照范围须覆盖实际运动');
    const pos=v=>x+(z-x)*(v-domain[0])/(domain[1]-domain[0]);
    const body=shape('body',pos(initial),height*.46,circle(u*.04));body.frames=[key(0,{x:pos(initial),y:height*.46}),key(duration/2,{x:pos((initial+finish)/2),y:height*.46}),key(duration,{x:pos(finish),y:height*.46})];
    text('start',rounded(initial)+(scene.unit||''),pos(initial),height*.61);text('end',rounded(finish)+(scene.unit||''),pos(finish),height*.61);
    const sign=Number(rounded(initial))===initial&&Number(rounded(speed))===speed?'=':'≈';
    text('equation',`x ${sign} ${rounded(initial)} + ${rounded(speed)}t${scene.unit?' · '+scene.unit:''}`,width/2,height*.76,font*.9);
  }else if(scene.family==='image-text'){
    const v=scene.items[0];validateImageTextLayers(v.imageText,v.assetId,assets,duration);
    node(v.id,width/2,height*.46,[],{role:'material',media:{assetId:v.assetId,width:width*.88,height:height*.68,fit:'contain',imageText:v.imageText}});
    panel.paths=[];nodes.splice(nodes.indexOf(panel),1);
  }else if(scene.family==='product'&&filmStyle){
    scene.items.forEach((v,i)=>{const at=duration*i/n,until=duration*(i+1)/n,blend=Math.min(.12,duration/n*.2);
      validateImageTextLayers(v.imageText,v.assetId,assets,duration);
      const item=node(v.id,width/2,height*.45,[],{role:'material',media:{assetId:v.assetId,width:width*.82,height:height*.5,fit:'contain',...(v.imageText?{imageText:v.imageText}:{})}});
      const frames=[key(0,{x:width/2,y:height*.45,opacity:i===0?1:0})];
      if(i)frames.push(key(at-blend,{x:width/2,y:height*.45,opacity:0}),key(at+blend,{x:width/2,y:height*.45}));
      if(i<n-1)frames.push(key(until-blend,{x:width/2,y:height*.45}),key(until+blend,{x:width/2,y:height*.45,opacity:0}));
      frames.push(key(duration,{x:width/2,y:height*.45,opacity:i===n-1?1:0}));item.frames=frames;
      const caption=text('label-'+v.id,v.label,width/2,height*.76,font,theme.ink,width*.8);
      // Images dissolve; labels hand off without two different texts overlapping.
      const captions=[key(0,{x:width/2,y:height*.76,opacity:i===0?1:0})];
      if(i)captions.push(key(at,{x:width/2,y:height*.76,opacity:0}),key(at+.001,{x:width/2,y:height*.76}));
      if(i<n-1)captions.push(key(until-.001,{x:width/2,y:height*.76}),key(until,{x:width/2,y:height*.76,opacity:0}));
      captions.push(key(duration,{x:width/2,y:height*.76,opacity:i===n-1?1:0}));caption.frames=captions;
    });
  }else{
    const vertical=height>width,cols=Math.min(n,vertical?2:3),rows=Math.ceil(n/cols);
    scene.items.forEach((v,i)=>{
      const x=width*(.1+.8*((i%cols)+.5)/cols),y=height*(rows===1?.43:.32+.27*Math.floor(i/cols)/(rows-1));
      const w=width*.65/cols,h=Math.min(height*.32/rows,u*.2);
      validateImageTextLayers(v.imageText,v.assetId,assets,duration);
      const item=v.assetId?node(v.id,x,y,[],{role:'material',media:{assetId:v.assetId,width:w,height:h,fit:'contain',...(v.imageText?{imageText:v.imageText}:{})}}):shape(v.id,x,y,rect(-w/2,-h/2,w,h),color(v,i));
      if(scene.family==='structure')item.frames=[key(0,{x:width/2,y:height*.42}),key(duration*.65,{x,y}),key(duration,{x,y})];
      else fade(item,duration*(.08+.5*i/n));
      const caption=labels(v,i,x,y+h/2+font*1.1,width*.72/cols);
      if(scene.family==='structure')fade(caption,duration*.7);
    });
    if(scene.family==='narrative'&&filmStyle&&rows===1){
      const centers=scene.items.map((_,i)=>width*(.1+.8*(i+.5)/cols));
      node('story-route',0,0,[{d:`M ${centers[0]} ${height*.29} L ${centers.at(-1)} ${height*.29}`,fill:'none',stroke:theme.muted,strokeWidth:2}]);
      const token=shape('story-cursor',centers[0],height*.29,circle(u*.012));
      token.frames=[key(0,{x:centers[0],y:height*.29}),...centers.map((x,i)=>key(duration*(.12+.66*i/(n-1)),{x,y:height*.29})),key(duration,{x:centers.at(-1),y:height*.29})];
    }
  }
  const subjectId='sem-'+(['comparison','proportion','ratio','causal','network','narrative','product','structure','image-text'].includes(scene.family)?scene.items[0].id:scene.family==='physical'?'body':scene.family==='probability'?'sample-0':'axes');
  const subject=nodes.find(n=>n.id===subjectId);subject.role='subject';panel.role='decoration';
  if((filmStyle||speechTiming)&&scene.family!=='physical'){
    const start=speechTiming?.start??duration*(filmStyle?.start??.2),settle=speechTiming?.settle??duration*(filmStyle?.settle??.72);
    if(start<1/fps||settle<=start+1/fps||settle>duration-.6)fail('语音同步点需递增，并为结果保留至少 0.6 秒');
    const input=[0,duration*.2,duration*.72,duration],output=[0,start,settle,duration];
    const retime=t=>{const i=t<=input[1]?0:t<=input[2]?1:2;return output[i]+(t-input[i])/(input[i+1]-input[i])*(output[i+1]-output[i]);};
    for(const n of nodes){for(const f of n.frames)f.time=retime(f.time);
      for(const m of n.graphics?.morphs||[])for(const f of m.frames)f.time=retime(f.time);
      for(const f of n.graphics?.textStates||[])f.from=retime(f.from);
      for(const e of n.libraryEffects||[]){e.params.from=retime(e.params.from);e.params.until=retime(e.params.until);}}
  }
  // Names must be visible when spoken. Only advance explanatory entrances;
  // physical trajectories and numerical interpolation keep their own clock.
  if(focusBeats.length&&scene.family==='structure'){
    const first=Math.min(...focusBeats.map(b=>b.from)),finish=Math.max(1/fps,first-.12);
    for(const item of scene.items){
      const target=nodes.find(n=>n.id==='sem-'+item.id),label=nodes.find(n=>n.id==='sem-label-'+item.id);
      const settle=target.frames[1].time;
      if(finish<settle){target.frames[1].time=finish;
        if(label){const from=Math.max(.001,finish-.12),until=Math.max(from+.001,finish);label.frames=[key(0,{...label.frames[0],time:0,opacity:0}),key(from,{...label.frames[0],time:from,opacity:0}),key(until,{...label.frames[0],time:until,opacity:1}),key(duration,{...label.frames[0],time:duration,opacity:1})];}
      }
    }
  }
  if(focusBeats.length&&scene.family==='narrative'){
    for(const beat of focusBeats){const target=nodes.find(n=>n.id==='sem-'+beat.entityId);if(!target)continue;
      const visible=target.frames.find(f=>f.opacity>=.95)?.time||0;
      if(visible>beat.from){const until=Math.max(.002,beat.from),from=Math.max(.001,until-.18);
        target.frames=[key(0,{...target.frames[0],time:0,opacity:0}),key(from,{...target.frames[0],time:from,opacity:0}),key(until,{...target.frames[0],time:until,opacity:1}),key(duration,{...target.frames[0],time:duration,opacity:1})];}
    }
    // The narration outline is the attention marker; a second, unrelated moving
    // cursor would point to a different object on the same frame.
    const cursor=nodes.findIndex(n=>n.id==='sem-story-cursor');if(cursor>=0)nodes.splice(cursor,1);
  }
  applyNarrationMotion(nodes,scene,{focusBeats,duration,filmStyle},theme);
  // A fresh narrative starts with its first real object already visible.
  if(scene.family==='narrative'&&filmStyle?.narrationMotion&&!previousPlan)for(const f of subject.frames)f.opacity=1;
  const matched=applyMatchedHandoff(nodes,scene,{previousPlan,duration,fps,filmStyle});
  const bridge=applyCrossHandoff(nodes,scene,{handoff,previousPlan,duration,fps,filmStyle,focusBeats,phraseEdits});
  applyPhraseEdits(nodes,phraseEdits,duration,{replaceAutomatic:true});
  for(const [i,beat] of focusBeats.entries()){
    const target=nodes.find(n=>n.id==='sem-'+beat.entityId);
    if(!target||!Number.isFinite(beat.from)||!Number.isFinite(beat.until)||beat.from<0||beat.until>duration||beat.until-beat.from<.3)fail('解说重点缺少有效对象或时间');
    const ring=structuredClone(target);ring.id='focus-'+beat.entityId+'-'+i;ring.role='decoration';delete ring.text;delete ring.libraryEffects;delete ring.media;
    if(target.media)ring.paths=[{d:rect(-target.media.width/2,-target.media.height/2,target.media.width,target.media.height),fill:'none',stroke:theme.accent,strokeWidth:3}];
    else if(!target.paths.length&&target.text)ring.paths=[{d:rect(-font*1.1,-font*1.2,font*2.2,font*2.4),fill:'none',stroke:theme.accent,strokeWidth:3}];
    else ring.paths=ring.paths.map(p=>({...p,fill:'none',stroke:theme.accent,strokeWidth:3}));
    const fade=Math.min(.12,(beat.until-beat.from)/4),points=[{time:0,value:0},{time:beat.from,value:0},{time:beat.from+fade,value:1},{time:beat.until-fade,value:1},{time:beat.until,value:0},{time:duration,value:0}];
    ring.graphics={version:1,tracks:[{channel:'opacity',frames:points.filter((f,j)=>!j||f.time>points[j-1].time)}],morphs:target.graphics?.morphs?structuredClone(target.graphics.morphs):[],textStates:[]};nodes.push(ring);
  }
  const visibleFrom=subject.frames.find(f=>f.opacity>=.95)?.time||0;
  return {width,height,fps,duration,bg:theme.bg,subjectId,nodes,annotations:[],
    layout:{version:1,connectors:[]},
    ...(scene.family==='product'&&filmStyle?{subjectWindows:[{from:visibleFrom,until:subject.frames.filter(f=>f.opacity>=.95).at(-1).time,reason:'顺序展示完整真实界面，经短叠化由下一界面承接产品操作'}]}:visibleFrom?{subjectWindows:[{from:visibleFrom,until:duration,reason:'对象进入后保持可见，供连续观察与比较'}]}:{}),
    camera:[{time:0,x:width/2,y:height/2,zoom:1},{time:duration,x:width/2,y:height/2,zoom:1}],
    cameraShots:[{from:0,until:duration,framing:'wide',transition:'cut',focusId:subjectId,reason:'固定构图保持相同尺度，方便观察同一模型的变化'}],
    semanticModel:{version:1,family:scene.family,source:scene,values:model,...(filmStyle?{filmStyle:filmStyle.preset}:{}),...(speechTiming?{speechTiming}:{} ),...(focusBeats.length?{focusBeats}:{} ),...(bridge?{crossHandoff:bridge}:{}),...(matched.length?{matchedHandoff:{nodes:matched,seconds:Math.min(.4,duration*.1),previousDuration:previousPlan.duration}}:{})}};
}
export function validateSemanticBinding(plan,scene,options) {
  if(!scene)return;
  const expected=compileSemanticScene(scene,options);
  for(const n of expected.nodes){
    const found=plan.nodes.find(v=>v.id===n.id);
    if(!found)fail('缺少由模型生成的对象：'+n.id);
    const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!=null).map(k=>[k,v[k]])):v);
    for(const key of ['paths','frames','text','graphics','media','libraryEffects'])if(canonical(found[key]??null)!==canonical(n[key]??null))fail('模型数值、文字或几何被改写：'+n.id+' / '+key);
  }
}

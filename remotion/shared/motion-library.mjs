// Frameboard v1 curated registry. Only these compiled components can be rendered.
export const LIBRARY_VERSION=2;
const num=(key,label,value,min,max,step=.1)=>({key,label,type:'number',value,min,max,step});
const text=(key,label,value,maxLength=40)=>({key,label,type:'text',value,maxLength});
const color={key:'color',label:'强调色',type:'color',value:'#76dfc4'};
const timing=[num('from','开始（秒）',0,0,3600),num('until','完成（秒）',2,.04,3600)];
const easing={key:'easing',label:'速度变化',type:'select',value:'smooth',options:[['linear','匀速'],['smooth','平滑起落'],['ease-in','加速'],['ease-out','减速落位']]};
const path=[num('x0','起点 X（%）',25,-100,200),num('y0','起点 Y（%）',45,-100,200),num('x1','终点 X（%）',75,-100,200),num('y1','终点 Y（%）',45,-100,200),easing];
const item=(id,name,category,description,fields=[],extra={})=>({id,name,category,description,type:'effect',version:1,source:'Frameboard 原生',fields:[...timing,...fields],...extra});
export const effects=[
  item('typewriter','逐字出现','文字与数据','按实际时长逐字显现，保持文字布局。',[],{requires:'text'}),
  item('text-rise','文字上浮入场','文字与数据','文字短距离上浮并淡入。',[num('distance','上浮距离（短边 %）',6,0,20)],{requires:'text'}),
  item('text-gradient','渐变文字','文字与数据','双色渐变沿文字流动。',[{...color,key:'colorA',label:'起始色'},{...color,key:'colorB',label:'结束色',value:'#8b8fff'}],{requires:'text'}),
  item('particles','粒子动效','过程与强调','确定性粒子随对象发散、环绕或流动；仅用于有语义理由的强调。',[num('count','粒子数量',48,4,128,1),num('radius','范围（短边 %）',28,2,60),num('size','粒子半径（像素）',3,1,12),num('seed','固定种子',17,0,99999,1),color,{key:'mode',label:'运动方式',type:'select',value:'burst',options:[['burst','发散'],['orbit','环绕'],['flow','流动']]}]),
  item('gradient','渐变转场','镜头与衔接','柔边渐变揭示下一镜，保留原声音与字幕入点。',[],{scope:'transition',fields:[num('duration','衔接时长（秒）',1,.05,3),num('softness','柔边宽度（%）',18,2,40),{key:'direction',label:'方向',type:'select',value:'right',options:[['right','向右'],['left','向左'],['down','向下'],['up','向上']]}]}),
  item('line','直线路径','对象运动','沿指定起点与终点运动。',path),
  item('arc','弧线路径','对象运动','保持对象身份，沿可追踪弧线移动。',[...path,num('bend','弧线高度（%）',-22,-100,100)]),
  item('orbit','绕中心旋转','对象运动','指定中心、半径和圈数，适合轨迹演示。',[num('cx','中心 X（%）',50,0,100),num('cy','中心 Y（%）',45,0,100),num('radius','半径（短边 %）',25,1,100),num('turns','圈数',1,-3,3),easing]),
  item('stagger','依次入场','对象运动','依次显示所选对象；主体进出需先安排完整可读区间。',[num('stagger','间隔（秒）',.2,0,10)],{source:'Onda · MIT'}),
  item('draw','路径描线','过程与强调','按时间逐步画出对象的轮廓。'),
  item('arrow','箭头生长','过程与强调','为对象增加从左到右生长的指向箭头。',[num('length','长度（短边 %）',20,2,80),color]),
  item('highlight','局部框选','过程与强调','在指定时间内围住目标，随后消失。',[num('width','框宽（短边 %）',30,2,150),num('height','框高（短边 %）',20,2,150),color]),
  item('mask','遮罩揭示','过程与强调','从左到右显示对象。',[num('width','揭示宽度（短边 %）',60,2,200)]),
  item('text','文字逐段出现','文字与数据','按标点拆分短句，依次淡入。',[],{requires:'text',source:'Onda · MIT'}),
  item('counter','数字递增','文字与数据','从起始数值过渡到目标数值。',[num('start','起始数值',0,-1e9,1e9,1),num('end','目标数值',100,-1e9,1e9,1),num('decimals','小数位',0,0,3,1),text('suffix','单位','',8)],{requires:'text'}),
  item('bar','柱形增长','文字与数据','对象以底部为基点逐渐长高。'),
  item('formula','公式符号移位','文字与数据','单独移动已确认的公式符号，沿弧线落位。',[...path,num('bend','弧线高度（%）',-20,-100,100)],{requires:'text'}),
  item('push','相机推进','镜头与衔接','以所选对象为焦点推进观察。',[num('zoom','目标放大倍数',1.35,.2,5)]),
  item('follow','对象跟随','镜头与衔接','相机跟随对象的实际运动轨迹。',[num('zoom','观察放大倍数',1,.2,5)]),
  item('fade','交叉淡化','镜头与衔接','在原切点后淡入当前镜头，上一镜末帧作衔接；音频入点保持不变。',[],{scope:'transition',fields:[num('duration','衔接时长（秒）',.6,.05,3)]}),
  item('wipe','方向擦除','镜头与衔接','在原切点后揭示当前镜头，上一镜末帧作衔接；音频入点保持不变。',[ ],{scope:'transition',fields:[num('duration','衔接时长（秒）',.6,.05,3),{key:'direction',label:'揭示方向',type:'select',value:'right',options:[['right','向右'],['left','向左'],['down','向下'],['up','向上']]}]}),
];
const theme=[color,{key:'bg',label:'背景色',type:'color',value:'#101e2a'}];
export const templates=[
  {id:'mechanism',name:'机制过程',description:'同一对象穿过作用区，连续路径与短注释。',fields:[text('label','对象短名称','对象',12),...theme]},
  {id:'formula-scene',name:'公式推导',description:'展示 A + B = C 到 A = C − B 的符号移位。',fields:[text('a','左侧符号','A',4),text('b','移项符号','B',4),text('c','右侧符号','C',4),...theme]},
  {id:'data-scene',name:'数据对比',description:'两组数据同时增长，显示实际差值。',fields:[text('labelA','第一组名称','方案 A',12),text('labelB','第二组名称','方案 B',12),num('valueA','第一组数值',38,0,1e9,1),num('valueB','第二组数值',72,0,1e9,1),text('unit','单位','',8),...theme]},
  {id:'product-scene',name:'产品展示',description:'围绕真实产品图或界面截图推进，再回到整体。',fields:[{key:'assetId',label:'产品图片',type:'asset',value:''},text('label','功能短注释','功能细节',16),...theme]},
].map(t=>({...t,type:'template',category:'镜头模板',version:1,source:'Frameboard 原创模板'}));
export const libraryItems=[...effects,...templates];
export const libraryItem=id=>libraryItems.find(x=>x.id===id);
export function defaultParams(id,duration=6){const item=libraryItem(id);if(!item)throw Error('动效条目不存在');return Object.fromEntries(item.fields.map(f=>[f.key,f.key==='until'?Math.min(2,duration):f.key==='duration'?Math.min(.6,duration):f.value]));}
export function validateParams(id,params,duration=3600){
  const item=libraryItem(id);if(!item||!params||typeof params!=='object'||Array.isArray(params))throw Error('动效参数无效');
  const out={};for(const f of item.fields){const v=params[f.key]??f.value;
    if(f.type==='number'&&(!Number.isFinite(v)||v<f.min||v>f.max||f.step===1&&!Number.isInteger(v)))throw Error(f.label+'超出允许范围');
    if(f.type==='text'&&(typeof v!=='string'||[...v].length>f.maxLength||/[\r\n]/.test(v)))throw Error(f.label+'请使用简短单行文字');
    if(f.type==='color'&&!/^#[\da-f]{6}$/i.test(v||''))throw Error(f.label+'无效');
    if(f.type==='select'&&!f.options.some(o=>o[0]===v))throw Error(f.label+'无效');
    if(f.type==='asset'&&(typeof v!=='string'||v&&!/^[\w-]{1,90}$/.test(v)))throw Error('图片编号无效');
    out[f.key]=v;
  }
  if('from'in out&&(out.until<=out.from||out.until>duration+.00001))throw Error('动作时间须位于本镜内，完成时间须晚于开始时间');
  if('duration'in out&&out.duration>duration)throw Error('衔接时长超过本镜时长');
  return out;
}
export function validateLibraryEffects(node,duration){
  if(node.libraryEffects==null)return;
  if(!Array.isArray(node.libraryEffects)||node.libraryEffects.length>24)throw Error('对象动效过多');
  const channels={text:'text-reveal',typewriter:'text-reveal',counter:'text-value',mask:'reveal',stagger:'opacity','text-rise':'opacity',bar:'scale','text-gradient':'text-fill'},owners=new Set();
  for(const e of node.libraryEffects){if(!['text','counter','highlight','mask','stagger','bar','typewriter','text-rise','text-gradient','particles'].includes(e.kind))throw Error('对象动效类型无效');if(libraryItem(e.kind).requires==='text'&&!node.text)throw Error('文字动效需要文字对象');validateParams(e.kind,e.params,duration);}
  // These effects hold their terminal state. A later effect would also own the
  // earlier interval, even when its nominal animation window does not overlap.
  for(const e of node.libraryEffects){const channel=channels[e.kind];if(channel&&owners.has(channel))throw Error('动效通道冲突：'+node.id+' '+channel+' 请合为一个完整轨道');if(channel)owners.add(channel);}
}
export function validateLibraryShot(s){
  if(s.libraryTransition){if(!['fade','wipe','gradient'].includes(s.libraryTransition.kind))throw Error('衔接类型无效');validateParams(s.libraryTransition.kind,s.libraryTransition.params,s.motionPlan?.duration||s.seconds);}
  const l=s.motionLibrary;if(l==null)return;
  if(l.version!==1||!Array.isArray(l.instances)||l.instances.length>24)throw Error('动效库版本或数量无效');
  const duration=s.motionPlan?.duration||s.seconds;
  for(const e of l.instances){if(!libraryItem(e.effectId)||libraryItem(e.effectId).type!=='effect'||typeof e.instanceId!=='string'||!Array.isArray(e.targets)||e.targets.some(x=>typeof x!=='string'))throw Error('动效记录无效');validateParams(e.effectId,e.params,duration);}
  if(l.template){if(libraryItem(l.template.id)?.type!=='template')throw Error('镜头模板无效');validateParams(l.template.id,l.template.params,duration);}
}

// Complete stories, separate from individual component cases. Never use live project data.
const scene=(family,title,items=[],extra={})=>structuredClone({version:1,family,title,items,style:'editorial',unit:'',...extra});
const values=(a,b)=>[{id:'small',label:'甲组',value:a},{id:'large',label:'乙组',value:b}];
const events=[{id:'original',label:'原始文件'},{id:'draft',label:'修改副本'},{id:'checked',label:'核对结果'}];
export const qualityFilms=[
 {id:'data',title:'同样增加，比例为什么不同',style:'editorial',width:960,height:540,
  brief:'只用自编的二十与八十这两组数，解释增量和比例的区别。',shots:[
   {text:'这里是两组示例数据。甲组二十，乙组八十。先看原来的数量，再比较同样增加后的变化。',scene:scene('comparison','示例：起点不同',values(20,80))},
   {text:'现在，两组都增加十个。甲组变成三十，乙组变成九十。增加的数量相同，变化比例却不一样。',scene:scene('comparison','同样增加 10 个',values(20,80).map(v=>({...v,to:v.value+10}))),startQuote:'现在',endQuote:'甲组变成三十'},
   {text:'十除以二十，等于零点五。也就是增加百分之五十。比较比例时，要把增加量和原来的数量一起看。',scene:scene('ratio','甲组：增量 / 原数量',[{id:'increment',label:'增加量',value:10},{id:'base',label:'原数量',value:20}])}]},
 {id:'physical',title:'匀速运动怎样连续衔接',style:'technical',width:960,height:540,
  brief:'同一小球沿直线每秒移动两个单位，只研究匀速，不涉及碰撞、加速和真实测量。',shots:[
   {text:'这是一维匀速运动的示例。小球从零出发，每秒移动两个单位。固定视角，让起点和终点都能看清。',scene:scene('physical','简化模型：匀速直线运动',[],{unit:'m',parameters:{initial:0,speed:2}})},
   {text:'下一段接着刚才的位置，继续向前。镜头没有让小球回到起点。同一段运动，需要保留前一段的终点。',scene:scene('physical','接着前一段的位置',[],{unit:'m',parameters:{initial:0,speed:2}}),continuePhysical:true},
   {text:'另取一个十秒的观察窗口，路程是二十米。路程除以时间，速度就是每秒两米。这个结论只用于这里的匀速模型。',scene:scene('ratio','另一窗口：20 m / 10 s',[{id:'distance',label:'路程 m',value:20},{id:'time',label:'时间 s',value:10}],{unit:'m/s'})}]},
 {id:'product',title:'内容如何进入真实工作台',style:'minimal',width:960,height:540,
  brief:'展示已有工作台的真实界面；截图为本机已有核对记录，未重绘任何按钮。',shots:[
   {text:'先把希望解释的问题，写进工作台。这里展示真实界面。内容目标说明观众是谁，以及看完应该理解什么。',scene:scene('product','真实界面：明确内容目标',[{id:'editor',label:'工作台编辑区',image:'workbench-preview.jpg'},{id:'narrow',label:'窄窗口下的工作台',image:'workbench-narrow.jpg'}])},
   {text:'接着，用真实数值和对象建立内容模型。输入决定图形和标签。预览和导出共用同一个渲染组件。',scene:scene('causal','内容 → 模型 → 画面',[{id:'input',label:'真实输入'},{id:'model',label:'内容模型'},{id:'output',label:'共享渲染'}],{edges:[{from:'input',to:'model'},{from:'model',to:'output'}]})},
   {text:'最后，保存版本，再看完整样片。检查字幕、动作和前后镜头。自动校验提供依据，成片仍然需要连续观看。',scene:scene('narrative','保存后，完整检查',[{id:'save',label:'保存版本'},{id:'preview',label:'完整样片'},{id:'review',label:'连续审片'}])}]},
 {id:'story',title:'一份文件的三种状态',style:'technical',width:720,height:960,
  brief:'自编流程故事：保留原件、修改副本、核对结果；不使用人物表演。',shots:[
   {text:'假设你要修改一份文件。先保留原始文件，再建立修改副本。这样，新的尝试就有可以回到的起点。',scene:scene('narrative','一次修改，从原件开始',events)},
   {text:'修改发生在副本里，原始文件仍然保留。完成修改以后，再检查结果。修改成功，不等于检查已经完成。',scene:scene('causal','修改和核对是两个步骤',events,{edges:[{from:'original',to:'draft'},{from:'draft',to:'checked'}]})},
   {text:'把这三个状态分开记录，才能知道现在到了哪一步。原件提供来路，副本记录变化，核对结果决定下一步。',scene:scene('structure','来路、变化、结果',events)}]},
];
const held=structuredClone(qualityFilms[0]);held.id='data-holdout';held.title='不同数据与竖屏的比例验证';held.style='minimal';held.width=720;held.height=960;
held.brief='独立保留输入：四十二与一百四十，各增加七；改变画幅与风格。';
held.shots[0].text='换一组示例。甲组四十二，乙组一百四十。比较以前，先看清两组原来的数量。';held.shots[0].scene.items=values(42,140);
held.shots[1].text='现在，两组都增加七个。甲组变成四十九，乙组变成一百四十七。增加量相同，比例却不一样。';held.shots[1].scene.items=values(42,140).reverse().map(v=>({...v,to:v.value+7}));held.shots[1].scene.title='同样增加 7 个';held.shots[1].endQuote='甲组变成四十九';
held.shots[2].text='七除以四十二，大约等于零点一六七。比较比例，需要同时保留增加量与原来的数量。';held.shots[2].scene.items[0].value=7;held.shots[2].scene.items[1].value=42;
qualityFilms.push(held);
const storyHeld=structuredClone(qualityFilms[3]);storyHeld.id='story-holdout';storyHeld.title='横屏叙事与对象换序验证';storyHeld.width=960;storyHeld.height=540;storyHeld.style='editorial';storyHeld.shots[2].scene.items.reverse();qualityFilms.push(storyHeld);

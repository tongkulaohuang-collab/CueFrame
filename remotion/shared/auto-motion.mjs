import {effects,templates,LIBRARY_VERSION} from './motion-library.mjs';
export const selectableEffects=effects.filter(e=>!['push','follow'].includes(e.id));
export function autoMotionContext(){return {version:LIBRARY_VERSION,selection:'AI 按当前脚本自主选择，不要求用户逐项设置',effects:selectableEffects.map(({id,name,description,requires,scope,fields})=>({id,name,description,requires,scope,parameters:fields})),cameraReferences:effects.filter(e=>['push','follow'].includes(e.id)).map(({id,name,description})=>({id,name,description})),templates:templates.map(({id,name,description})=>({id,name,description}))};}
export function autoMotionInstructions(stage){return [
  '动效与模板库作为后台能力使用，由 AI 根据口播语义、实测时间、主体运动与已选风格自行选择；不要要求用户打开动效面板，也不要把目录名称放进字幕。允许不用效果，不为凑种类添加装饰。',
  '文字可选逐字出现、上浮入场、双色渐变；转场可选柔边渐变；粒子可选发散、环绕、流动。粒子仅作有语义理由的强调，不能把装饰粒子冒充真实科学机制，不遮挡主体或字幕。保持原配音与字幕入点。',
  '机制、公式、数据、产品模板仅作为构图参考，按实际内容生成对象与动作，不能直接复制 A/B/C、38/72 等示例值。保留已确认的对象设计和科学依据；产品图片只能用已确认素材。',
  stage==='motion'?'输出顶层 effectSelections 数组（不需要时 []），每项含 effectId、targets、params、reason。targets 使用本镜真实 node ID；转场 targets=[]；params 严格符合所选类型和本镜时长。系统实际编译这些效果，请勿再把同一个效果重复烘焙到 frames。主体出现或退出须给subjectWindows阅读窗口；文字和图片显现按语义选择，图形形变使用真实graphics轨道，不虚构effectId。相机推进/跟随直接落实到既有 cameraShots，不能用库组件删除镜头规划。visual 说明采用的模板构图及动效理由；actionEvidence 仍必须核对真实关键动作，不能用粒子或文字强调替代它们。': '在分镜/节奏脚本的 visual 或动作说明中记录适用的模板、对象、动效和时间理由，传给后续动画制作；按当前 schema 输出，不增加不支持的字段。',
].join('\n');}

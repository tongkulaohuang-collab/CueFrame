// Reviewed, local-only procedural templates. HTTP callers cannot supply code.
import {scienceScene,scienceParameters} from './science-scenes.mjs';
export const localEngines = ['blender','anatomy'];
export const localViews = ['overview','pin','slot','pen'];
export function localSpec(input={}) {
  if(!localEngines.includes(input.engine)) throw Error('请选择 Blender 或 Anatomy');
  const template=input.template||'sine-plotter',scene=scienceScene(template);
  if(template!=='sine-plotter'&&!scene) throw Error('本地模板不存在');
  if(scene&&input.engine!==scene.engine)throw Error('本科学场景使用 Blender 三维渲染');
  const out={engine:input.engine,template,view:input.view||'overview',index:Number(input.index??-1),duration:Number(input.duration??8),start:Number(input.start??0),width:Number(input.width??1280),height:Number(input.height??720),fps:Number(input.fps??24),...(scene?{parameters:scienceParameters(template,input.parameters)}:{})};
  if(!Number.isInteger(out.index)||out.index < -1||out.index>6)throw Error('镜头调度无效');
  if(!(scene?scene.views.map(v=>v[0]):localViews).includes(out.view))throw Error('机位无效');
  if(!Number.isFinite(out.duration)||out.duration<1||out.duration>180||!Number.isFinite(out.start)||out.start<0||out.start>3600)throw Error('时长应为 1–180 秒，连续时间起点应为 0–3600 秒');
  if(![out.width,out.height].every(x=>Number.isInteger(x)&&x>=160&&x<=1920&&x%2===0)||![24,25,30].includes(out.fps))throw Error('画面需为 160–1920 的偶数尺寸，帧率为 24、25 或 30');
  return out;
}
export function plotterAt(t){const theta=2*Math.PI*(t+.8)/8;return {theta,x:-96+38*Math.cos(theta),y:38*Math.sin(theta),penX:137,feed:16,amplitude:38,period:8};}
export function isLocalProcess(s){return localEngines.includes(s?.processEngine);}
export function protectProcess(s){if(s?.processVideoId || isLocalProcess(s))throw Error('本镜使用已选过程视频。请在连续镜头设计中重新渲染，或先解除过程视频后生成 SVG 动画。');}

import {motionIssues} from './motion-plan.mjs';
import {validateMotion} from './motion-plan.mjs';
import {compileSemanticScene} from './semantic-scenes.mjs';
import {semanticOptions} from './semantic-context.mjs';
import {timeline} from './model.mjs';
export const continuityFields = {
  subject: '主体或正在解释的对象',
  path: '起始状态、变化过程与结果（物理运动须写完整路径）',
  camera: '观察位置与构图理由（可固定相机）',
  handoff: '前后段的对象、逻辑、空间与时间衔接',
};
export const continuousChecks = [
  '主要画面清楚表达本段内容',
  '对象的状态变化可追踪，物理运动路径完整',
  '对象、空间与时间连续，镜头服务过程观察',
  '字幕小号同步，节点注释短暂贴近对象，卡片与标题服务内容',
  '已按正常速度观看完整连续片段并记录时间码',
];
export function continuityIssues(s) {
  return Object.entries(continuityFields).filter(([k])=>!s?.continuity?.[k]?.trim()).map(([,label])=>'连续镜头设计缺少：'+label);
}
export function processMediaIssues(p,s,frames) {
  if(p.productionMode==='model-process'&&s){try{const row=timeline(p).rows.find(r=>r.shot.id===s.id);validateMotion(compileSemanticScene(s.semanticScene,semanticOptions(p,s,row)));return [];}catch(e){return [e.message];}}
  if(p.kind!=='science'||!s)return [];
  const a=p.assets.find(a=>a.id===s.processVideoId&&s.assetIds.includes(a.id)&&a.kind==='video');
  if(!a)return s.motionPlan?motionIssues(s.motionPlan,p,frames??Math.round(s.seconds*p.fps),s):['这一镜的连续动画尚未生成'];
  const offset=s.processOffset||0;
  return offset<0||offset+(frames??Math.round(s.seconds*p.fps))/p.fps>a.duration+1/p.fps?['连续过程视频长度不足；请补齐过程，不能定格或循环凑时长']:[];
}

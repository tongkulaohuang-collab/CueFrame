import {currentReferenceReports, motionReferences, referenceAnalysisNeeds, referenceScriptNeeds} from './reference-motion.mjs';

// Both the editor and the job broker use the same inputs and task state.
export function storyboardBlocker(p, jobs = []) {
  const pending = jobs.find(j => j.project === p.id && ['storyboard', 'rhythm', 'reference-motion'].includes(j.task) &&
    (['running', 'unknown'].includes(j.status) || j.status === 'ready' && j.version === p.version));
  if (pending) {
    const name = {storyboard:'分镜与连续镜头设计', rhythm:'节奏脚本', 'reference-motion':'参考视频分析'}[pending.task];
    const state = {running:'正在生成', unknown:'的提交结果待核对', ready:'的结果待写入'}[pending.status];
    return {message:name + state + '。', target:'job', job:pending};
  }
  if (!p.shots.length) return {message:'先在「口播与音乐」准备分段口播。', target:'narration'};
  if (!motionReferences(p).length || referenceAnalysisNeeds(p).length || !currentReferenceReports(p).some(r => r.segments.length)) {
    return {message:'先在「风格与参考」完成参考视频分析，并保留可用片段。', target:'references'};
  }
  if (!p.scienceFlow?.rhythm?.trim()) return {message:'先在上方生成节奏脚本。', target:'rhythm'};
  if (referenceScriptNeeds(p).length) return {message:'请按当前参考视频分析更新上方的节奏脚本。', target:'rhythm'};
  if (!p.claims.some(claim => claim.verified)) return {message:'请先核实本期分镜使用的科学依据。', target:'claims'};
  return null;
}

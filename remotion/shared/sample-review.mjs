import {directorReviewIssues,DIRECTOR_REVIEW_VERSION,designInputKey,needsDirectorReview} from './director-quality.mjs';
// A sample belongs to one saved project version, shot and language.
export function sampleJob(tasks, project, shotId, variant) {
  return tasks.filter(j => j.type === 'render' && j.scope === 'shot' &&
    j.project === project.id && j.version === project.version &&
    j.shotId === shotId && j.variant === variant)
    .sort((a,b) => String(b.created || '').localeCompare(String(a.created || '')))[0] || null;
}

export function sampleReviewRecord(job, project, input, {contentCurrent=false}={}) {
  if (job.type !== 'render' || job.scope !== 'shot' || job.status !== 'done' || !job.output)
    throw Error('样镜生成完成后才能审核');
  if (!project || project.id !== job.project || input.version !== project.version || (project.version !== job.version&&!contentCurrent))
    throw Error('内容已有修改，请生成当前版本的样镜后审核');
  if (!['approved', 'changes'].includes(input.decision)) throw Error('请选择审核结果');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.decision === 'changes' && !note) throw Error('请填写修改意见');
  if (note.length > 4000) throw Error('修改意见请控制在 4000 字以内');
  if (!Number.isFinite(input.time) || input.time < 0) throw Error('无效的播放时间');
  const review={ decision:input.decision, note, time:input.time, reviewedAt:new Date().toISOString() };
  if(input.scope!=null&&!['captions','visual','audio','playback'].includes(input.scope))throw Error('请选择声音、播放、文字或画面问题');
  if(input.decision==='changes')review.scope=input.scope||'visual';
  if(needsDirectorReview(project)) {
    Object.assign(review,{directorVersion:DIRECTOR_REVIEW_VERSION,designInputs:designInputKey(project,job.shotId),
      watched:input.watched,actions:input.actions,audioChecked:input.audioChecked===true,styleChecked:input.styleChecked===true,captionsChecked:input.captionsChecked===true});
    if(input.decision==='approved') {
      const errors=directorReviewIssues(project,job.shotId,review,job.evidence?.frames/project.fps);
      if(errors.length)throw Error(errors.join('；'));
    }
  }
  return review;
}

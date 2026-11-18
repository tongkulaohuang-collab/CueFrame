import {db, get, job, jobs, persistJob, write, conflict} from './store.mjs';
import {sampleReviewRecord} from '../shared/sample-review.mjs';
import {reusableSegment, segmentFingerprint} from './segments.mjs';

export function recordSampleDecision(id, input) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const sample = job(id);
    let project = get(sample.project);
    const source = get(sample.project, sample.version);
    const contentCurrent = source && sample.scope === 'shot' &&
      project.shots.some(s => s.id === sample.shotId) &&
      segmentFingerprint(project, sample.shotId, sample.variant) === segmentFingerprint(source, sample.shotId, sample.variant);
    const review = sampleReviewRecord(sample, project, input, {contentCurrent});
    const changed = persistJob({...sample, review});
    let nextSample = null;
    if (project.kind === 'product' && project.flow === 'review' && project.pauses.includes('样镜') &&
        (input.advance || input.decision === 'changes')) {
      const history = jobs(project.id).sort((a,b) => String(b.created).localeCompare(String(a.created)));
      if (reusableSegment(project, sample.shotId, sample.variant, history)?.id !== id)
        throw conflict('请审核当前版本最新生成的样镜');
      const variants = project.language === 'separate' ? ['zh','en'] : [project.voice];
      for (const shot of project.shots) {
        const variant = variants.find(lang => reusableSegment(project, shot.id, lang, history)?.review?.decision !== 'approved');
        if (variant) {
          nextSample = {shotId:shot.id, variant};
          break;
        }
      }
      const allApproved = nextSample === null;
      if (project.passed.includes('样镜') !== allApproved) {
        const passed = project.passed.filter(k => k !== '样镜');
        if (allApproved) passed.push('样镜');
        project = write({...project, passed}, project.version);
      }
    }
    db.exec('COMMIT');
    return input.advance ? {job:changed, project, nextSample} : changed;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

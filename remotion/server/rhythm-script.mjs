import {timeline} from '../shared/model.mjs';
import {actionTiming} from '../shared/action-timing.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
import {currentMaterialPlan} from '../shared/material-plan.mjs';
import {LIBRARY_VERSION, libraryItem} from '../shared/motion-library.mjs';
import {currentReferenceReports} from '../shared/reference-motion.mjs';
import {hasSelectedVisualReference,visualStyleInputKey,validateReferenceAppearance} from '../shared/visual-style.mjs';
import {validateScienceResult} from './science-ai.mjs';
import {validateExplanationBeats,EXPLANATION_VERSION} from '../shared/explanation-plan.mjs';
import {validatePerformanceRequirements,PERFORMANCE_VERSION} from '../shared/performance-plan.mjs';
import {assertActionContract} from '../shared/action-contract.mjs';

const seconds = value => Number(value.toFixed(3));
const excerpt = (value, limit = 120) => {
  const text = String(value || '').replace(/\s+/gu, ' ').replace(/[|｜]/gu, '、').trim();
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
};

// Use the same action parser as animation and storyboard generation. A JSON
// response can be syntactically complete while omitting the last few shots.
export function checkedRhythm(raw, project, {requireExplanation=false,requirePerformance=false,requireVisualStyle=false}={}) {
  if(requireVisualStyle&&hasSelectedVisualReference(project))validateReferenceAppearance(raw?.visualStyle);
  const [text] = validateScienceResult(raw, project, 'rhythm');
  const withScript = {...project, scienceFlow:{...project.scienceFlow, rhythm:text}};
  for (const [index, row] of timeline(project).rows.entries()) {
    if (!actionRequirements(withScript, row.shot.id, row).length)
      throw Error('节奏脚本缺少第 ' + (index + 1) + ' 段的带时间码动作。');
  }
  if(requireExplanation || raw.explanationBeats?.length)validateExplanationBeats(raw.explanationBeats,project);
  const context=timeline(project).rows.map(row=>({shotId:row.shot.id,duration:row.frames/project.fps,
    actions:actionRequirements(withScript,row.shot.id,row),speech:actionTiming(project,row.shot.id,project.voice,row).speech}));
  const performanceRequirements=structuredClone(raw.performanceRequirements||[]);
  for(const r of performanceRequirements) {
    const action=context.find(s=>s.shotId===r.shotId)?.actions.find(a=>a.source===r.actionId);
    if(action)r.actionId=action.id;
  }
  if(requirePerformance||performanceRequirements.length)validatePerformanceRequirements(performanceRequirements,context);
  assertActionContract({...withScript,scienceFlow:{...withScript.scienceFlow,referenceScript:{explanationBeats:raw.explanationBeats||[]}}});
  return {text, libraryVersion:raw.libraryVersion ?? LIBRARY_VERSION, referenceApplications:raw.referenceApplications || [],referenceDecisions:raw.referenceDecisions||[],
    ...(hasSelectedVisualReference(project)&&raw.visualStyle?{visualStyle:raw.visualStyle,visualStyleInputs:visualStyleInputKey(project)}:{}),
    explanationVersion:EXPLANATION_VERSION,explanationBeats:raw.explanationBeats||[],
    ...(performanceRequirements.length?{performanceVersion:PERFORMANCE_VERSION,performanceRequirements}:{})};
}

function shotBeats(row, timing, fps) {
  const start = row.from / fps, end = (row.from + row.frames) / fps;
  const cues = timing.speech.filter(c => c.globalTime >= start && c.globalTime < end);
  const beats = [];
  if (!cues.length || cues[0].globalTime - start >= 0.5) beats.push({time:start, id:'design'});
  for (const cue of cues) {
    if (!beats.length || cue.globalTime - beats.at(-1).time >= 0.5)
      beats.push({time:cue.globalTime, id:cue.id, text:cue.text});
  }
  return beats.flatMap((beat, i) => {
    const gap = (beats[i + 1]?.time ?? end) - beat.time;
    const parts = Math.ceil(gap / 12);
    return [beat, ...Array.from({length:parts - 1}, (_, k) => ({
      time:Math.round((beat.time + gap * (k + 1) / parts) * fps) / fps, id:'design',
    }))];
  });
}

function shotContext(project, shot, plan) {
  const items = (plan?.items || []).filter(item => item.shotIds.includes(shot.id));
  const media = project.assets.filter(a => ['image','video'].includes(a.kind) && a.confirmed &&
    (shot.assetIds.includes(a.id) || items.some(i => i.assetIds.includes(a.id) || a.generation?.planId === plan.id && a.generation.itemId === i.id)));
  const claims = project.claims.filter(c => c.verified && (shot.claimIds.includes(c.id) || items.some(i => i.claimIds.includes(c.id))));
  const subject = excerpt(shot.continuity?.subject || items[0]?.title || media[0]?.name ||
    shot.labels[0] || shot[project.voice]?.split(/[，。！？,.!?]/u)[0] || shot.title || project.topic, 60);
  return {subject, items, media, claims};
}

// Build a usable editorial draft from the submitted version, even while the
// model is still working. Only recorded speech cues carry measured times.
export function localRhythm(project, personalLibrary) {
  const {rows} = timeline(project), plan = currentMaterialPlan(project);
  const references = currentReferenceReports(project).filter(r => r.segments.length);
  const referenceApplications = [];
  const sections = rows.map((row, index) => {
    const shot = row.shot, start = row.from / project.fps, end = (row.from + row.frames) / project.fps;
    const timing = actionTiming(project, shot.id, project.voice, row);
    const beats = shotBeats(row, timing, project.fps);
    const {subject, items, media, claims} = shotContext(project, shot, plan);
    const notes = [`第 ${index + 1} 段　${seconds(start)}–${seconds(end)} 秒　${subject}`];
    const narration = row.cues.map(c => excerpt(c.text, 1600)).filter(Boolean).join(' / ');
    if (narration) notes.push('口播　' + narration);
    const design = shot.visual || items.map(i => i.usage).join(' ');
    if (design) notes.push('画面　' + excerpt(design, 550));
    if (media.length) notes.push('素材　' + media.map(a => excerpt(a.name, 75)).join('、'));
    if (claims.length) notes.push('依据　' + claims.map(c => excerpt(c.title || c.text, 90)).join('、'));
    if (items.length) notes.push('标注与口径　' + excerpt(items.map(i => i.checks).join(' '), 220));
    for (const field of ['path','camera','handoff']) {
      if (shot.continuity?.[field]) notes.push(excerpt(shot.continuity[field], 200));
    }
    const accent = timing.music[0];
    if (accent) notes.push(`音乐　${seconds(accent.globalTime)} 秒（${accent.id}，${accent.precision}），在这一拍强调正在讲解的对象。`);
    const stages = shot.beats?.filter(Boolean).length ? shot.beats.filter(Boolean)
      : design.split(/[。；，;]|再(?=展|显|画)|随后/u).map(s => s.trim()).filter(Boolean);
    beats.forEach((beat, i) => {
      const until = beats[i + 1]?.time ?? end;
      const spoken = beat.text ? '，对应「' + excerpt(beat.text, 55) + '」' : '';
      const stageIndex = Math.floor(i * stages.length / beats.length);
      const planned = i === 0 || stageIndex !== Math.floor((i - 1) * stages.length / beats.length) ? stages[stageIndex] : '';
      const size = i === 0 ? '全景' : i === beats.length - 1 ? '中景' : i % 2 ? '近景' : '特写';
      const drawing = i > 0 && i < beats.length - 1;
      const action = planned || (i === 0 ? '随口播揭示主体及周围的参照物' : drawing ? shot.continuity?.path || '沿当前讲解部分描出轮廓，保留来路与相邻对象' : '保持结果和参照物同框，接入下一段声音');
      const technique = /描|绘|连线/u.test(action) ? 'draw' : /移动|汇[合集入]|穿过|越过|落位|沿.*到/u.test(action) ? 'motion' :
        /保持|保留|停留/u.test(action) ? 'hold' : 'reveal';
      notes.push(`• ${seconds(beat.time)}–${seconds(until)}｜cueId=${beat.id}｜对象=${subject}｜动作=${size}，${excerpt(action, 160)}${spoken}｜形式=${technique}`);
    });
    return {start, end, subject, notes};
  });
  // Timing fallback contains no claim of semantic matching. The final AI script
  // must still supply explanation beats and a checked adaptation decision.
  const referenceDecisions=references.map(ref=>({referenceId:ref.referenceId,status:'not_applicable',reason:'本地时间轴仅整理声音时间，尚未完成语义匹配；正式脚本须另行判断参考是否适用。'}));
  const intro = '本地时间轴稿｜动作行使用全片秒数。speech / voice 表示已有声音入点，design 表示画面设计时刻。字幕沿用已有音轨。';
  return {text:[intro, ...sections.map(s => s.notes.join('\n'))].join('\n\n'), libraryVersion:LIBRARY_VERSION, referenceApplications,referenceDecisions};
}

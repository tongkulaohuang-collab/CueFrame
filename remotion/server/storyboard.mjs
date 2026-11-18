import fs from 'node:fs';
import {timeline} from '../shared/model.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
import {actionTiming} from '../shared/action-timing.mjs';
import {referenceMotionContext} from '../shared/reference-motion.mjs';

// Keep the normal shot format and add the keys needed to match an existing
// shot and verify the script line and analyzed footage used for its design.
export function writeStoryboardSchema(file) {
  const schema = JSON.parse(fs.readFileSync(new URL('./shot.schema.json', import.meta.url), 'utf8'));
  const item = schema.properties.shots.items;
  Object.assign(item.properties, {
    shotId:{type:'string'}, scriptLine:{type:'integer'},
    referenceId:{type:'string'}, segmentNumber:{type:'integer'}, adaptation:{type:'string'},
  });
  item.required = Object.keys(item.properties);
  fs.writeFileSync(file, JSON.stringify(schema));
  return file;
}

export function storyboardContext(p) {
  const rhythmLines = p.scienceFlow.rhythm.split(/\r?\n/).map(text => text.trim()).filter(Boolean);
  const referenceMotion = referenceMotionContext(p);
  const references = referenceMotion.references.map(report => ({...report,
    segments:report.segments.map((segment, i) => ({...segment, segmentNumber:i + 1})),
  }));
  const shotTimeline = timeline(p).rows.map(row => {
    const actions = new Set(actionRequirements(p, row.shot.id, row).map(action => action.source));
    const from = row.from / p.fps, until = (row.from + row.frames) / p.fps;
    const applications = referenceMotion.applications.filter(a => overlaps(a.scriptFrom, a.scriptUntil, from, until));
    const referenceOptions = references.flatMap(report => report.segments.filter(segment =>
      !report.excluded?.some(cut => overlaps(segment.from, segment.until, cut.from, cut.until)) &&
      (!applications.length || applications.some(a => a.referenceId === report.referenceId && overlaps(a.from, a.until, segment.from, segment.until)))
    ).map(segment => ({referenceId:report.referenceId, segmentNumber:segment.segmentNumber, from:segment.from, until:segment.until})));
    return {
      shotId:row.shot.id, from, until, referenceOptions,
      actionLines:rhythmLines.flatMap((text, i) => actions.has(text) ? [i + 1] : []),
      timing:actionTiming(p, row.shot.id, p.voice, row),
    };
  });
  return {rhythmLines, shotTimeline, referenceMotion:{...referenceMotion, references}, style:p.scienceFlow.style, template:p.scienceFlow.template};
}

// Script seconds are serialized to six decimals; rounding at a shared cut is
// not an overlap with the adjacent shot.
const overlaps = (from, until, otherFrom, otherUntil) => Math.min(until, otherUntil) - Math.max(from, otherFrom) > 0.000001;
const sameTime = (a, b) => Math.abs(a - b) <= 0.000001;

// Repair only a misnumbered citation with an explicit, exact source range that
// uniquely matches this shot's existing application. Never choose the nearest
// segment, the first available segment, or rewrite a creative design.
export function checkedStoryboardDraft(raw, p, j, validateShots) {
  const draft = structuredClone(raw), adjustments = [];
  const {shotTimeline} = storyboardContext(p);
  for (const row of Array.isArray(draft?.shots) ? draft.shots : []) {
    const source = typeof row?.adaptation === 'string' && row.adaptation.match(/^(?:对应|借鉴|采用)?参考第\s*(\d+)\s*段\s*(\d+(?:\.\d+)?)\s*[–—~～-]\s*(\d+(?:\.\d+)?)\s*秒/);
    if (!source) continue;
    const options = shotTimeline.find(shot => shot.shotId === row.shotId)?.referenceOptions || [];
    const selected = options.find(option => option.referenceId === row.referenceId && option.segmentNumber === row.segmentNumber);
    const matches = options.filter(option => option.referenceId === row.referenceId &&
      sameTime(option.from, Number(source[2])) && sameTime(option.until, Number(source[3])));
    if (Number(source[1]) !== row.segmentNumber)
      throw Error('参考片段编号与借鉴说明不一致，请核对原片时间段。');
    if (selected) {
      if (!overlaps(selected.from, selected.until, Number(source[2]), Number(source[3])))
        throw Error('参考片段编号与借鉴说明的时间段不一致，不能自动改选。');
      continue;
    }
    if (matches.length !== 1) continue;
    const match = matches[0];
    adjustments.push({shotId:row.shotId, referenceId:row.referenceId, fromSegment:row.segmentNumber,
      toSegment:match.segmentNumber, from:match.from, until:match.until});
    row.segmentNumber = match.segmentNumber;
    row.adaptation = row.adaptation.replace(/参考第\s*\d+\s*段/, '参考第' + match.segmentNumber + '段');
  }
  return {raw:draft, result:storyboardResult(draft, p, j, validateShots), adjustments};
}

export const storyboardInstructions = [
  '在同一次输出中设计分镜与连续镜头。只处理已有镜头，按 shotId 一一对应。shotId 为空的请求须返回 shotTimeline 全部镜头，无论多少段；指定镜头时只返回该镜，并读取相邻镜头以设计交接。',
  '逐行读取 rhythmLines（从1编号）和 referenceMotion.references 中已分析的片段，以及 applications 中原片到本片的对应关系。以每镜实际全片起止时间为准，结合 timing 中的实测口播、音乐起音与估计句界，把脚本动作、停留和运镜落实到 visual、三拍 beats 与 continuity。按已有参考借鉴具体运动、景别、机位或转场，贯穿前后镜，保留原口播、中英文已有译文、音频时间与镜头基础秒数。',
  '每镜 scriptLine 填对应脚本行号，有 actionLines 时从该镜的行号中选。给出选用的 referenceId 与该参考的 segmentNumber（保留的 segments 从1编号），在 adaptation 写清该片段的具体处理如何用于本镜。本镜时间与已有 applications 相交时，从这些对应记录的原片时段内选用片段。其余镜头从其余可用时段选取合适的处理。只引用保留的时段；已排除的区间、未观察到的运动或未分析的音效均不能作为依据。',
  '每镜只能从其 shotTimeline.referenceOptions 中原样复制 referenceId、segmentNumber；该编号已由程序计算，references.segments 也明确标出 segmentNumber，不要自行数段或沿用分析文字里的旧编号。adaptation 以“对应参考第N段A–B秒”开头，N、A、B 原样取自同一选项，再写本片时段和具体适配。编号是索引，原片秒数是时间，不可互相替代。',
].join('\n');

export function storyboardResult(raw, p, j, validateShots) {
  const targets = p.shots.filter(s => !j.shotId || s.id === j.shotId);
  const rows = raw?.shots;
  if (!targets.length || !Array.isArray(rows) || rows.length !== targets.length) throw Error('分镜结果未完整覆盖本次指定的镜头。');
  const byId = new Map(rows.map(r => [r?.shotId, r]));
  const {rhythmLines, shotTimeline} = storyboardContext(p);
  const {references} = referenceMotionContext(p);
  return targets.map(s => {
    const row = byId.get(s.id);
    if (!row) throw Error('分镜结果包含缺失、重复或不属于本次请求的镜头编号。');
    const {actionLines, referenceOptions} = shotTimeline.find(t => t.shotId === s.id);
    const line = row.scriptLine;
    if (!Number.isInteger(line) || line < 1 || line > rhythmLines.length || actionLines.length && !actionLines.includes(line))
      throw Error('「' + s.title + '」引用的节奏脚本行与镜头时段不符。');
    const report = references.find(r => r.referenceId === row.referenceId);
    const segment = Number.isInteger(row.segmentNumber) && report?.segments[row.segmentNumber - 1];
    if (!segment || report.excluded?.some(cut => segment.from < cut.until && segment.until > cut.from) ||
        typeof row.adaptation !== 'string' || !row.adaptation.trim())
      throw Error('「' + s.title + '」缺少可核实的参考视频片段或借鉴说明。');
    if (!referenceOptions.some(option => option.referenceId === row.referenceId && option.segmentNumber === row.segmentNumber))
      throw Error('「' + s.title + '」所选的参考片段与节奏脚本的对应记录不符：选中第' + row.segmentNumber + '段（' +
        segment.from + '–' + segment.until + '秒）；本镜可用：' + referenceOptions.map(option =>
          option.referenceId + ' 第' + option.segmentNumber + '段（' + option.from + '–' + option.until + '秒）').join('、') + '。');
    if (!Array.isArray(row.beats) || !Array.isArray(row.annotations) || !Array.isArray(row.assetIds) ||
        !Array.isArray(row.claimIds) || !row.claimIds.length || row.claimIds.some(id => !p.claims.some(c => c.verified && c.id === id)))
      throw Error('「' + s.title + '」的动作节拍、节点注释、素材或科学依据无效。');
    if (row.assetIds.some(id => !p.assets.some(a => a.id === id))) throw Error('分镜引用了未知素材。');
    const visualAssets = row.assetIds.filter(id => p.assets.find(a => a.id === id).kind !== 'audio');
    const design = {
      ...s, title:row.title, purpose:row.purpose, visual:row.visual, graphic:row.graphic, labels:row.labels,
      beats:row.beats, continuity:row.continuity, annotations:row.annotations, claimIds:row.claimIds,
      zh:s.zh.trim() ? s.zh : row.zh, en:s.en.trim() ? s.en : row.en,
      assetIds:[...new Set([...s.assetIds, ...visualAssets])],
      storyboardBasis:{version:p.version, scriptLine:line, text:rhythmLines[line - 1], referenceId:report.referenceId,
        name:report.name, from:segment.from, until:segment.until, adaptation:row.adaptation.trim()},
    };
    return validateShots({shots:[design]}, p, {shotId:s.id})[0];
  });
}

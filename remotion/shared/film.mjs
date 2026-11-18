import { qualityFor, renderIssues, shotIssues, timeline } from "./model.mjs";
import { processMediaIssues } from './continuous-direction.mjs';
import { sceneProps } from "./scene-props.mjs";
import { scienceGate } from './science-flow.mjs';
import {designReport,usesDirectorDesign} from './director-quality.mjs';
import {displayCaptions} from './overlays.mjs';
import {sceneVarietyIssues} from './scene-design.mjs';
import {filmStyleIssues} from './film-style.mjs';

export function filmIssues(p, variant, final = true) {
  if (!p.shots.length) return ["请先建立全片分镜"];
  const issues = [...sceneVarietyIssues(p)];
  if (p.scienceFlow) issues.push(...scienceGate(p, true));
  const schedule = timeline(p, variant);
  issues.push(...filmStyleIssues(p,schedule.rows,{includeUnmanaged:false}));
  for (const [index, shot] of p.shots.entries()) {
    const prefix =
      String(index + 1).padStart(2, "0") + " " + shot.title + " · ";
    const reasons = final
      ? renderIssues(p, shot.id, variant, schedule)
      : shotIssues(p, shot);
    if(!final) reasons.push(...processMediaIssues(p,shot,schedule.rows.find(r=>r.shot.id===shot.id)?.frames));
    if (final) {
      if(usesDirectorDesign(p))reasons.push(...designReport(p,shot.id).issues);
      if (
        p.language === "bilingual" &&
        !shot.silentOK &&
        !p.assets.some(
          (a) =>
            shot.assetIds.includes(a.id) &&
            a.kind === "audio" &&
            a.role === variant,
        )
      )
        reasons.push("请关联正式旁白，或选择无旁白");
      const missing = qualityFor(p).filter((item) => !shot.filmQA?.includes(item));
      if (missing.length) reasons.push("画面待检：" + missing.join("、"));
      if(p.kind==='science'&&!shot.motionReview?.trim()) reasons.push('缺少正常速度观看连续片段的时间码记录');
    }
    issues.push(...reasons.map((r) => prefix + r));
  }
  if (p.flow === "review" && !p.scienceFlow) {
    const required = final ? p.pauses : p.pauses.filter((s) => s !== "导出前");
    for (const s of required)
      if (!p.passed.includes(s)) issues.push("请在「" + s + "」节点确认继续");
    if (!final && p.look === "directed" && p.pauses.includes("样镜"))
      for (const shot of p.shots)
        if (!shot.approvedLook)
          issues.push(shot.title + " · 请先核对本镜风格帧");
  }
  return issues;
}

export function filmProps(p, variant = p.voice, base = "") {
  const tl = timeline(p, variant);
  const rows = tl.rows.map((r, index) => ({
    id: r.shot.id,
    from: r.from,
    frames: r.frames,
    overlap: r.overlap,
    padding: r.padding,
    scene: sceneProps(p, r.shot.id, variant, base, tl),
    until: tl.rows[index + 1]?.from ?? tl.frames,
  }));
  const captions = [];
  const music = [];
  for (const r of rows) {
    const { scene } = r;
    for (const cue of displayCaptions(scene.captionCues)) {
      const from = r.from + cue.from;
      if (from >= r.until) continue;
      const previous = captions.at(-1);
      if (previous?.from === from) captions.pop();
      else if (previous && previous.until > from) previous.until = from;
      captions.push({ ...cue, from, until: Math.min(r.until, r.from + (cue.until ?? r.frames)), id: r.id });
    }
    if (scene.music) {
      const previous = music.at(-1);
      if (previous?.asset.id === scene.music.id && previous.until === r.from)
        previous.until = r.until;
      else music.push({ asset: scene.music, from: r.from, until: r.until });
    }
  }
  return {
    rows,
    captions,
    music,
    title: p.title || p.topic,
    burnCaptions: p.burnCaptions ?? false,
    captionMode: p.captionMode || 'voice',
    ...(p.filmStyle?{captionBackplate:true}:{}),
    language: p.language,
    variant,
    base,
    canvas: { width: p.width, height: p.height, fps: p.fps, frames: tl.frames },
  };
}

export function noteAt(rows, frame, shotId) {
  const candidates = rows.filter(
    (r) => frame >= r.from && frame < r.from + r.frames,
  );
  const row = shotId
    ? candidates.find((r) => r.id === shotId)
    : candidates.at(-1);
  if (!row) return null;
  return { shotId: row.id, localFrame: frame - row.from };
}
export function locateNote(rows, note, fps) {
  const row = rows.find((r) => r.id === note.shotId);
  const local =
    fps && note.fps
      ? Math.round((note.localFrame * fps) / note.fps)
      : note.localFrame;
  return row && Number.isInteger(local) && local >= 0 && local < row.frames
    ? row.from + local
    : null;
}

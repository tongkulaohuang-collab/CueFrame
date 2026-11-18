import {handoffInputs} from './film-style.mjs';
export const views = ["全图", "左上", "中央", "右上", "左下", "右下"];
export function validStarts(values, count, seconds) {
  return (
    Array.isArray(values) &&
    values.length === count &&
    values[0] === 0 &&
    values.every(
      (v, i) =>
        Number.isFinite(v) &&
        v >= 0 &&
        v < seconds &&
        (!i || v > values[i - 1]),
    )
  );
}
export function linesFor(shot, splitMonolingual = false) {
  const split = (text, re) =>
    (text || "")
      .split(re)
      .map((s) => s.trim())
      .filter(Boolean);
  let zh = split(shot.zh, /(?<=[。！？])/u),
    en = split(shot.en, /(?<=[.!?])\s+/u);
  if (splitMonolingual && !en.length && zh.length)
    return {zh, en: zh.map(() => "")};
  if (splitMonolingual && !zh.length && en.length)
    return {zh: en.map(() => ""), en};
  if (zh.length === 1 && en.length === 1) {
    const a = split(zh[0], /(?<=[，])/u),
      b = split(en[0], /(?<=[,])\s+/u);
    if (a.length === b.length && a.every((x) => x.length > 3)) {
      zh = a;
      en = b;
    }
  }
  if (!zh.length || zh.length !== en.length)
    return { zh: [shot.zh || ""], en: [shot.en || ""] };
  return { zh, en };
}
export function beatLabels(shot, kind) {
  if(kind==='science') return [0,1,2].map(i=>shot.beats?.[i]?.trim() || '');
  const fallback =
    kind === "product"
      ? ["看见问题", "执行操作", "看见结果"]
      : ["提出问题", "观察变化", "解释原因"];
  return fallback.map(
    (s, i) => shot.beats?.[i]?.trim() || shot.labels?.[i]?.trim() || s,
  );
}
// Place changes at the spoken clauses when available. The third image earns a hold at the end.
export function beatsFor({ frames, fps, captionCues, voices, language, pace }) {
  const languages =
    language === "sequential" ? ["zh", "en"] : [captionCues[0]?.lang || "zh"];
  return languages.flatMap((lang, i) => {
    const cues = captionCues.filter((c) => c.lang === lang),
      voice = voices.find((v) => v.asset.role === lang);
    const start =
      voice?.from ??
      cues[0]?.from ??
      Math.floor((frames * i) / languages.length);
    const next = voices.find((v) => v.from > start);
    const end = next?.from ?? frames;
    const span = Math.max(
      1,
      Math.min(end - start, voice?.frames ?? end - start),
    );
    const fraction = pace === "舒展" ? 0.43 : 0.31;
    const middle = cues[1]?.from ?? start + Math.round(span * fraction);
    const payoff =
      cues[2]?.from ?? Math.round(middle + (start + span - middle) * 0.57);
    const last = Math.max(start, end - 1);
    return [
      start,
      Math.min(last, Math.max(start, middle)),
      Math.min(last, Math.max(middle, payoff)),
    ].map((from, phase) => ({ from, phase, lang }));
  });
}
export function approvalKey(p, s) {
  return JSON.stringify([
    p.look,
    p.kind,
    p.productType,
    p.width,
    p.height,
    p.fps,
    p.language,
    p.voice,
    p.target,
    p.burnCaptions,
    p.captionMode,
    s.subtitleTracks,
    s.annotations,
    s.continuity,
    s.processVideoId,
    s.processOffset,
    ...(s.phraseEdits?.length?[s.phraseEdits]:[]),
    ...(handoffInputs(p,s)?[handoffInputs(p,s)]:[]),
    ...(s.motionLibrary||s.libraryTransition?[s.motionPlan,s.libraryTransition]:[]),
    s.seconds,
    s.zh,
    s.en,
    s.visual,
    s.title,
    s.purpose,
    s.labels,
    s.graphic,
    s.beats,
    s.beatSources,
    s.beatViews,
    s.beatOffsets,
    s.manualTiming,
    s.silentOK,
    s.pace,
    ...(s.layout || s.titleEn || s.transition
      ? [s.layout, s.titleEn, s.transition]
      : []),
    s.claimIds,
    p.claims
      .filter((c) => s.claimIds.includes(c.id))
      .map((c) => [c.id, c.revision, c.verified]),
    s.assetIds,
    p.assets
      .filter((a) => s.assetIds.includes(a.id))
      .map((a) => [a.id, a.role, a.confirmed]),
    ...(p.kind==='science' && p.scienceFlow?.bgmId ? [p.scienceFlow.bgmId] : []),
  ]);
}
export function castingChoice(p, shotId, a) {
  const s = p.shots.find((s) => s.id === shotId);
  if (!s || a.scriptText !== s[a.role])
    throw Error("台词已变化，请重新试听当前版本");
  const oldVoiceIds = p.assets
    .filter((x) => x.kind === "audio" && x.role === a.role)
    .map((x) => x.id);
  const subtitleTracks = { ...s.subtitleTracks };
  const manualTiming = { ...s.manualTiming };
  delete subtitleTracks[a.role];
  delete manualTiming[a.role];
  if (a.doubaoRequestId && a.segments?.length) {
    subtitleTracks[a.role] = { assetId: a.id, text: s[a.role], segments: a.segments };
  }
  return {
    ...p,
    assets: [...p.assets.filter((x) => x.id !== a.id), a],
    shots: p.shots.map((v) =>
      v.id === shotId
        ? {
            ...v,
            silentOK: false,
              ...(a.voiceMusic?{seconds:Math.ceil(a.duration*p.fps)/p.fps,transition:'cut'}:{}),
            ...(s.subtitleTracks || Object.keys(subtitleTracks).length ? { subtitleTracks } : {}),
            ...(s.manualTiming ? { manualTiming } : {}),
            assetIds: [
              ...v.assetIds.filter((id) => !oldVoiceIds.includes(id)),
              a.id,
            ],
          }
        : v,
    ),
  };
}
export function proofFrames(scene) {
  const { frames, fps } = scene.canvas;
  if (scene.look !== "directed")
    return [0.15, 0.58, 0.92].map((f) =>
      Math.min(frames - 1, Math.floor(frames * f)),
    );
  const first = scene.beats.slice(0, 3);
  return first.map((b, i) => {
    const end = scene.beats[i + 1]?.from ?? frames;
    if (i === 2)
      return Math.min(
        frames - 1,
        Math.max(b.from, end - Math.max(1, Math.round(fps * 0.35))),
      );
    return Math.min(
      frames - 1,
      b.from +
        Math.min(
          Math.max(0, end - b.from - 1),
          Math.max(1, Math.round(Math.min((end - b.from) * 0.55, fps * 0.65))),
        ),
    );
  });
}
// Probe every shot before encoding a long film, including late shot entrances.
export function filmProofFrames(film) {
  return [...new Set(film.rows.flatMap(r=>[0,...proofFrames(r.scene),r.frames-1].map(local=>Math.max(0,Math.min(film.canvas.frames-1,r.until-1,r.from+local)))))].sort((a,b)=>a-b);
}

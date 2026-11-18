import React from "react";
import {MusicBed} from './MusicBed';
import {MIX} from '../shared/audio-mix.mjs';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { LunarPlate } from "./LunarPlate";
import { EditorialPlate } from "./EditorialPlate";
const clamp = (x) => Math.min(1, Math.max(0, x));
const focusPosition = {
  左上: "0% 0%",
  中央: "50% 50%",
  右上: "100% 0%",
  左下: "0% 100%",
  右下: "100% 100%",
};
function SourceImage({ asset, base, view, trim = 0 }) {
  if (!asset) return null;
  const tight = view && view !== "全图";
  // The crop is static during the read. Size the source once; animate its reveal, never the glyphs.
  const style = {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: tight ? "cover" : "contain",
    objectPosition: focusPosition[view] || "center",
    transform: tight ? "scale(1.5)" : "none",
    transformOrigin: focusPosition[view] || "center",
  };
  return asset.kind === "video" ? (
    <OffthreadVideo
      muted
      trimBefore={trim}
      src={base + asset.src}
      style={style}
    />
  ) : (
    <Img src={base + asset.src} style={style} />
  );
}
function ProductPlate({
  phase,
  asset,
  base,
  view,
  w,
  portrait,
  physical,
  from,
  trim,
  payoff = 0,
}) {
  const dark = phase === 2;
  const side = !portrait && phase !== 1;
  return (
    <div
      style={{
        position: "absolute",
        top: side ? 23 - 9 * payoff + "%" : portrait ? "26%" : "27%",
        height: side ? 47 + 15 * payoff + "%" : portrait ? "44%" : "42%",
        left: side && phase === 0 ? "37%" : "6%",
        right: side && phase === 2 ? 32 - 26 * payoff + "%" : "6%",
        display: "flex",
        alignItems: "stretch",
        gap: w * 0.014,
      }}
    >
      <div
        style={{
          width: Math.max(3, w * 0.004),
          background: dark ? "#aaecb9" : "#aa5340",
        }}
      />
      <div
        style={{
          position: "relative",
          flex: 1,
          overflow: "hidden",
          border: "1px solid " + (dark ? "#5b8271" : "#c4c6b4"),
          background: physical ? "#eae7dc" : "#f1f4ee",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          {asset?.kind === "video" ? (
            <Sequence from={from} layout="none">
              <SourceImage asset={asset} base={base} view={view} trim={trim} />
            </Sequence>
          ) : (
            <SourceImage asset={asset} base={base} view={view} />
          )}
        </div>
      </div>
    </div>
  );
}
function ConceptPlate({ shot, phase, titles }) {
  const words = shot.labels.length ? shot.labels : titles;
  if (shot.graphic === "对照图")
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4%",
          alignItems: "stretch",
        }}
      >
        {words.slice(0, 2).map((v, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              alignContent: "center",
              padding: "8%",
              background: i ? "#29463f" : "#1b303e",
              borderTop: "4px solid " + (i ? "#e9c784" : "#95c5ba"),
              opacity: i && phase === 0 ? 0.16 : 1,
              color: "#f4edda",
              fontSize: "1.18em",
            }}
          >
            <small style={{ fontSize: ".42em", color: "#afd3c9" }}>
              0{i + 1}
            </small>
            {v}
          </div>
        ))}
      </div>
    );
  const current = Math.min(phase, words.length - 1);
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 2fr",
        alignItems: "center",
        gap: "6%",
        padding: "0 5%",
        color: "#dcebe4",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: "0.42em",
          borderLeft: "2px solid #82aa9f",
          paddingLeft: "12%",
        }}
      >
        {words.slice(0, 3).map((v, i) => (
          <div
            key={i}
            style={{
              color: i === current ? "#f3cc89" : "#9fb4af",
              fontSize: ".65em",
            }}
          >
            0{i + 1} &nbsp;{i <= current ? v : ""}
          </div>
        ))}
      </div>
      <strong style={{ fontSize: "1.55em", lineHeight: 1.2 }}>
        {words[current]}
      </strong>
    </div>
  );
}
export function DirectedScene({
  shot,
  assets = [],
  voices = [],
  music,
  audioContext,
  musicOffsetFrames=0,
  captionCues = [],
  kind,
  variant,
  language,
  base = "",
  beats = [],
  beatLabels = [],
  productType,
  index = 1,
  silent = false,
  hideCaptions = false,
  canvas,
}) {
  const frame = useCurrentFrame(),
    { width: w, height: h, durationInFrames: d, fps } = useVideoConfig();
  const portrait = w < h,
    unit = Math.min(w / 1200, h / 675),
    mobile = w / 360;
  const b = [...beats].reverse().find((x) => x.from <= frame) || {
      phase: 0,
      from: 0,
      lang: variant,
    },
    phase = b.phase;
  const mix = b.from === 0 ? 1 : clamp((frame - b.from) / (fps * 0.23));
  const langBeats = beats.filter((x) => x.lang === b.lang);
  const cue =
    [...captionCues].reverse().find((x) => x.from <= frame) || captionCues[0];
  const science = kind === "science",
    dark = science;
  const bg = science ? "#10202a" : "#f4f1e7",
    ink = dark ? "#f4f1df" : "#183c32",
    accent = science ? "#efd294" : phase === 2 ? "#27634d" : "#a44935";
  const refs = assets.filter(
    (a) => a.role === "product" && ["image", "video"].includes(a.kind),
  );
  const assetFor = (i) =>
    refs.find((a) => a.id === shot.beatSources?.[i]) ||
    refs[Math.min(i, refs.length - 1)];
  const previous = beats[beats.indexOf(b) - 1];
  const currentVoice = voices.find((v) => v.asset.role === b.lang);
  const start = currentVoice?.from || langBeats[0]?.from || 0;
  const end = start + (currentVoice?.frames || d);
  const orbitStart = langBeats[1]?.from ?? Math.round(d * 0.35),
    orbitEnd = Math.max(orbitStart + 1, end - fps * 0.85);
  const opening = clamp((frame - start) / Math.max(1, orbitStart - start));
  const progress =
    frame < orbitStart
      ? 0.46 + 0.04 * opening
      : 0.5 + 0.5 * clamp((frame - orbitStart) / (orbitEnd - orbitStart || 1));
  const rangeEnd =
    beats.find((x) => x.lang !== b.lang && x.from > b.from)?.from ?? d;
  const expandAt = Math.max(
    b.from + fps * 0.35,
    Math.min(end - fps * 0.1, rangeEnd - fps * 1.45),
  );
  const t = phase === 2 ? clamp((frame - expandAt) / (fps * 0.7)) : 0,
    payoff = t * t * (3 - 2 * t);
  const plate = (beat) => (
    <ProductPlate
      phase={beat.phase}
      asset={assetFor(beat.phase)}
      base={base}
      view={shot.beatViews?.[beat.phase]}
      w={w}
      portrait={portrait}
      physical={productType === "physical"}
      from={beat.from}
      trim={Math.round((shot.beatOffsets?.[beat.phase] || 0) * fps)}
      payoff={beat === b ? payoff : 0}
    />
  );
  const texture = assets.find(
      (a) => a.role === "surface" && a.kind === "image",
    ),
    illustrations = assets.filter(
      (a) => a.role === "reference" && a.kind === "image",
    );
  const heading = beatLabels[phase] || shot.title;
  const side = !science && !portrait && phase !== 1;
  const navHeight = Math.max(unit * 2, 2);
  const subtitleZH = cue?.zh || shot.zh,
    subtitleEN = cue?.en || shot.en;
  const zh = language === "bilingual" || (cue?.lang || variant) === "zh",
    en = language === "bilingual" || (cue?.lang || variant) === "en";
  return (
    <AbsoluteFill
      style={{
        background: bg,
        color: ink,
        fontFamily: "Microsoft YaHei, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      {shot.layout ? (
        <EditorialPlate
          {...{
            shot,
            assets,
            base,
            index,
            canvas,
            kind,
            variant,
            language,
            beats,
            captionCues,
          }}
        />
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              top: "5%",
              left: "6%",
              right: "6%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: Math.max(14 * unit, w * 0.012),
              letterSpacing: 2,
              color: accent,
              fontWeight: 700,
            }}
          >
            <span>
              {science
                ? "LUNAR / FIELD NOTES".replace(
                    "LUNAR",
                    shot.graphic === "月相示意" ? "LUNAR" : "SCIENCE",
                  )
                : "FRAMEBOARD / PRODUCT STUDY"}
            </span>
            <span>
              0{index} &nbsp; / &nbsp; 0{phase + 1}
            </span>
          </div>
          <div
            style={{
              position: "absolute",
              top: side ? "28%" : "12%",
              left: side && phase === 2 ? "70%" : "6%",
              right: side && phase === 0 ? "65%" : "6%",
              opacity: side && phase === 2 ? 1 - clamp(payoff * 1.7) : 1,
              fontWeight: 700,
              fontSize: side
                ? Math.min(w * 0.078, (w * 0.58) / Math.max(6, heading.length))
                : Math.min(
                    w * 0.078,
                    Math.max(38 * unit, w * 0.047),
                    (w * 0.87) / Math.max(1, heading.length),
                  ),
              lineHeight: 1.17,
              letterSpacing: "-.025em",
            }}
          >
            {heading}
          </div>
          {science ? (
            <div
              style={{
                position: "absolute",
                left: "5%",
                right: "5%",
                top: "24%",
                height: portrait ? "49%" : "48%",
                fontSize: Math.min(w * 0.046, 48 * unit),
              }}
            >
              {shot.graphic === "月相示意" ? (
                <LunarPlate
                  phase={phase}
                  mix={mix}
                  progress={progress}
                  portrait={portrait}
                  surface={texture && base + texture.src}
                  opening={opening}
                />
              ) : illustrations.length ? (
                <SourceImage
                  asset={
                    illustrations[Math.min(phase, illustrations.length - 1)]
                  }
                  base={base}
                  view="全图"
                />
              ) : (
                <ConceptPlate shot={shot} phase={phase} titles={beatLabels} />
              )}
            </div>
          ) : (
            <>
              {previous && mix < 1 && (
                <AbsoluteFill style={{ opacity: 1 - mix }}>
                  {plate(previous)}
                </AbsoluteFill>
              )}
              <AbsoluteFill style={{ opacity: previous ? mix : 1 }}>
                {plate(b)}
              </AbsoluteFill>
            </>
          )}
        </>
      )}
      {!hideCaptions && (
        <div
          style={{
            position: "absolute",
            left: "6%",
            right: "6%",
            bottom: "4%",
            height: portrait ? "20%" : "23%",
            display: "flex",
            justifyContent: "flex-end",
            flexDirection: "column",
          }}
        >
          <div
            style={{ display: "flex", gap: 6 * unit, marginBottom: 5 * unit }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  height: navHeight,
                  width: i === phase ? "10%" : "3%",
                  background:
                    i === phase ? accent : dark ? "#597168" : "#bdc7b8",
                }}
              />
            ))}
          </div>
          {zh && !hideCaptions && (
            <div
              style={{
                fontSize: Math.min(
                  12.8 * mobile,
                  (w * (portrait ? 2.45 : 1.72)) /
                    Math.max(1, subtitleZH.length),
                ),
                fontWeight: 650,
                lineHeight: 1.25,
              }}
            >
              {subtitleZH}
            </div>
          )}
          {en && !hideCaptions && (
            <div
              style={{
                marginTop: 2 * unit,
                fontSize: Math.min(
                  10.6 * mobile,
                  (w * (portrait ? 4.0 : 3.6)) / Math.max(1, subtitleEN.length),
                ),
                color: dark ? "#c4d5cc" : "#425c50",
                lineHeight: 1.18,
              }}
            >
              {subtitleEN}
            </div>
          )}
        </div>
      )}
      {!silent &&
        voices.map((v) => (
          <Sequence
            key={v.asset.id}
            from={v.from}
            durationInFrames={Math.max(1, v.frames)}
          >
            <Audio src={base + v.asset.src} volume={MIX.voice}/>
          </Sequence>
        ))}
      {!silent&&music&&<MusicBed {...{music,voices,base}} captions={captionCues} offset={musicOffsetFrames} context={audioContext}/>}
    </AbsoluteFill>
  );
}

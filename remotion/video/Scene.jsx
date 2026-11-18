import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  Freeze,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PageCam } from "../vendor/shotcraft/PageCam";
import { DirectedScene } from "./DirectedScene";
import { ContinuousScene } from './ContinuousScene';
import { MusicBed } from './MusicBed';
import { MIX } from '../shared/audio-mix.mjs';
import { SmallSubtitles, NodeAnnotations } from './TextOverlays';
import {libraryTransitionStyle} from './LibraryEffects';
const ink = "#f2f4ee",
  muted = "#bbcfca",
  accent = "#acedd5";
const clamped = (t, start, end) =>
  interpolate(t, [start, Math.max(start + 1, end)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
function Moon({ progress }) {
  const theta = progress * Math.PI,
    x = 305 - 145 * Math.cos(theta),
    y = 198 - 102 * Math.sin(theta),
    r = 64;
  const k = Math.cos(theta),
    term = Math.max(0.01, r * Math.abs(k));
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 820 344"
      role="img"
      aria-label="日光从左侧照射月球；右侧展示从地球看到的亮面变化"
    >
      <g fill="none" stroke="#304850">
        <rect x="1" y="1" width="818" height="342" rx="20" />
        <path d="M495 36v270" />
        <ellipse cx="305" cy="198" rx="145" ry="102" strokeDasharray="4 6" />
      </g>
      <g stroke="#eec77c" strokeWidth="2">
        {[140, 170, 200].map((v) => (
          <path key={v} d={"M32 " + v + "h80l-7 -4m7 4l-7 4"} fill="none" />
        ))}
      </g>
      <g style={{ fontFamily: "Microsoft YaHei, sans-serif" }}>
        <text x="30" y="54" fill={muted} fontSize="18">
          俯视轨道
        </text>
        <text x="31" y="238" fill="#ebca85" fontSize="18">
          太阳光
        </text>
        <path
          d={"M305 198 L" + x + " " + y}
          stroke="#94c6bb"
          strokeDasharray="5 5"
          fill="none"
        />
        <circle cx="305" cy="198" r="25" fill="#50a7a6" />
        <text x="305" y="246" textAnchor="middle" fill={muted} fontSize="18">
          地球
        </text>
        <circle cx={x} cy={y} r="16" fill="#495664" />
        <path
          transform={"translate(" + x + " " + y + ")"}
          d="M0 -16 A16 16 0 0 0 0 16 Z"
          fill="#f3dca4"
        />
        <text x="660" y="54" fill={muted} fontSize="18" textAnchor="middle">
          从地球看
        </text>
        <g transform="translate(660 170)">
          <circle r={r} fill="#293746" />
          <path
            d={
              "M0 -64 A64 64 0 0 1 0 64 A" +
              term +
              " 64 0 0 " +
              (k >= 0 ? "0" : "1") +
              " 0 -64 Z"
            }
            fill="#f3dca4"
          />
        </g>
        <text x="660" y="286" textAnchor="middle" fill={ink} fontSize="22">
          {progress < 0.12
            ? "新月附近"
            : progress < 0.43
              ? "娥眉月"
              : progress < 0.57
                ? "上弦月附近"
                : progress < 0.91
                  ? "盈凸月"
                  : "满月附近"}
        </text>
        <text x="28" y="316" fill="#b6c9c8" fontSize="15">
          虚线为观测视线 · 大小、距离与时间未按比例
        </text>
      </g>
    </svg>
  );
}
function Graphic({ shot, progress }) {
  if (shot.graphic === "月相示意") return <Moon progress={progress} />;
  const labels = shot.labels.length ? shot.labels : [shot.visual];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "2%",
        height: "100%",
        padding: "2%",
      }}
    >
      {labels.slice(0, 4).map((s, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderTop: "2px solid " + accent,
            padding: "3% 1%",
            opacity: progress * labels.length + 0.5 > i ? 1 : 0.38,
          }}
        >
          <small style={{ color: accent }}>0{i + 1}</small>
          <div style={{ marginTop: 8 }}>{s}</div>
        </div>
      ))}
    </div>
  );
}
export function ShotScene(props) {
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const transition=props.shot.libraryTransition;
  const scene = props.kind === 'science'||props.shot.motionPlan ? <ContinuousScene {...props} hideCaptions />
    : props.look === 'directed' ? <DirectedScene {...props} hideCaptions /> : <ClassicScene {...props} hideCaptions />;
  return <AbsoluteFill style={{background:'#02070e'}}>
    {transition&&props.previousScene&&frame/fps<transition.params.duration&&<Freeze frame={props.previousScene.canvas.frames-1}><ShotScene {...props.previousScene} silent hideCaptions /></Freeze>}
    <AbsoluteFill style={libraryTransitionStyle(transition,frame/fps)}>
    <AbsoluteFill>
      {scene}<NodeAnnotations annotations={props.shot.annotations}/>
    </AbsoluteFill>
    </AbsoluteFill>
    {props.burnCaptions && !props.hideCaptions && <SmallSubtitles cues={props.captionCues}
      language={props.language} variant={props.variant} captionMode={props.captionMode} backplate={props.captionBackplate}/>}
  </AbsoluteFill>;
}
function ClassicScene({
  shot,
  assets = [],
  cues = [],
  captionCues = [],
  voices = [],
  music,
  audioContext,
  musicOffsetFrames=0,
  language = "bilingual",
  variant = "zh",
  kind = "science",
  silent = false,
  hideCaptions = false,
  base = "",
  index = 1,
}) {
  const frame = useCurrentFrame(),
    { width: w, height: h, fps, durationInFrames: d } = useVideoConfig();
  const unit = Math.min(w / 960, h / 540),
    portrait = w < h;
  const speech =
    language === "sequential"
      ? [...voices].reverse().find((v) => v.from <= frame)
      : voices[0];
  const span = speech?.frames || d,
    localFrame = frame - (speech?.from || 0);
  const progress = clamped(localFrame, span * 0.14, span * 0.85);
  const file = (a) => base + a.src,
    references = assets.filter(
      (a) => a.role === "product" && ["image", "video"].includes(a.kind),
    ),
    ref = references[0];
  const cue =
    [...(captionCues.length ? captionCues : cues)]
      .reverse()
      .find((c) => frame >= c.from) || cues[0];
  const zh = language === "bilingual" || (cue?.lang || variant) === "zh",
    en = language === "bilingual" || (cue?.lang || variant) === "en";
  const stageW = Math.round(w * 0.88),
    stageH = Math.round(h * (portrait ? 0.43 : 0.5)),
    pageH = ref?.height && ref?.width ? (w * ref.height) / ref.width : h;
  const scale = stageW / w,
    fitZoom = Math.min(1, stageH / scale / pageH);
  const switchFrame = Math.round((voices[0]?.frames || d) * 0.48);
  const blend = clamped(frame, switchFrame, switchFrame + fps * 0.24);
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 76% 32%,#19333d 0%,#101e2b 52%,#0b1521 100%)",
        color: ink,
        fontFamily: "Microsoft YaHei, Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "6%",
          left: "6%",
          right: "6%",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14 * unit,
          color: accent,
          letterSpacing: 2,
        }}
      >
        {" "}
        <span>
          FRAMEBOARD &nbsp;/&nbsp;{" "}
          {kind === "science" ? "SCIENCE NOTES" : "PRODUCT FILM"}
        </span>
        <span>SHOT {String(index).padStart(2, "0")}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          top: "12%",
          fontWeight: 700,
          fontSize: Math.min(
            42 * unit,
            (w / Math.max(8, shot.title.length)) * 0.87,
          ),
          lineHeight: 1.18,
        }}
      >
        {shot.title}
      </div>
      <div
        style={{
          position: "absolute",
          left: "6%",
          top: portrait ? "27%" : "26%",
          width: stageW,
          height: stageH,
          overflow: "hidden",
          borderRadius: 16 * unit,
          fontSize: 22 * unit,
          background: "#152936",
        }}
      >
        {kind === "product" && ref ? (
          ref.kind === "video" ? (
            <OffthreadVideo
              src={file(ref)}
              muted
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : shot.graphic === "产品特写" && ref.width >= ref.height ? (
            <div
              style={{
                position: "absolute",
                width: w,
                height: h,
                left: 0,
                top: (stageH - h * scale) / 2,
                transformOrigin: "top left",
                transform: "scale(" + scale + ")",
              }}
            >
              <PageCam
                src={file(ref)}
                pageW={w}
                pageH={pageH}
                keys={[
                  {
                    frame: 0,
                    cx: w / 2,
                    cy: pageH * 0.52,
                    zoom: fitZoom * 1.35,
                  },
                  {
                    frame: Math.max(1, switchFrame),
                    cx: w * 0.46,
                    cy: pageH * 0.59,
                    zoom: fitZoom * 1.78,
                  },
                ]}
              />
              {references[1]?.kind === "image" && (
                <AbsoluteFill style={{ opacity: blend }}>
                  <PageCam
                    src={file(references[1])}
                    pageW={w}
                    pageH={(w * references[1].height) / references[1].width}
                    keys={[
                      {
                        frame: 0,
                        cx: w * 0.63,
                        cy: pageH * 0.28,
                        zoom: fitZoom * 1.68,
                      },
                    ]}
                  />
                </AbsoluteFill>
              )}
            </div>
          ) : (
            <Img
              src={file(ref)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "scale(1.18)",
              }}
            />
          )
        ) : (
          <Graphic shot={shot} progress={progress} />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          bottom: "5%",
          height: "14%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderLeft: "3px solid " + accent,
          paddingLeft: "2%",
          gap: 2 * unit,
        }}
      >
        {zh && !hideCaptions && (
          <div
            style={{
              fontSize: Math.min(
                23 * unit,
                (w * 1.55) / Math.max(20, (cue?.zh || shot.zh).length),
              ),
              lineHeight: 1.35,
              fontWeight: 600,
            }}
          >
            {cue?.zh || shot.zh}
          </div>
        )}
        {en && !hideCaptions && (
          <div
            style={{
              fontSize: Math.min(
                17 * unit,
                (w * 2.45) / Math.max(32, (cue?.en || shot.en).length),
              ),
              color: muted,
              lineHeight: 1.3,
            }}
          >
            {cue?.en || shot.en}
          </div>
        )}
      </div>
      {!silent &&
        voices.map((v) => (
          <Sequence
            key={v.asset.id}
            from={v.from}
            durationInFrames={Math.max(1, v.frames)}
          >
            <Audio src={file(v.asset)} volume={MIX.voice}/>
          </Sequence>
        ))}
      {!silent&&music&&<MusicBed {...{music,voices,base}} captions={captionCues} offset={musicOffsetFrames} context={audioContext}/>}
    </AbsoluteFill>
  );
}

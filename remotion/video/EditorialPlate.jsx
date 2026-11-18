import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MoonDisk } from "./LunarPlate";

const ink = "#edf2eb",
  gold = "#f2cc82",
  teal = "#92dbc5";
const clamp = (n) => Math.min(1, Math.max(0, n));
const ease = (t) => t * t * (3 - 2 * t);
function Label({ x, y, children, color = ink, size = 36, anchor = "middle" }) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      textAnchor={anchor}
      fontSize={size}
      fontWeight="600"
    >
      {children}
    </text>
  );
}
function Orbit({ x, y, r, angle, label, wide }) {
  const mx = x - r * Math.cos(angle),
    my = y + r * 0.59 * Math.sin(angle);
  return (
    <g>
      <ellipse
        cx={x}
        cy={y}
        rx={r}
        ry={r * 0.59}
        stroke="#527582"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 7"
      />
      <path
        d={`M${x} ${y}L${mx} ${my}`}
        stroke={teal}
        strokeWidth="3"
        strokeDasharray="8 6"
      />
      <circle cx={x} cy={y} r={20} fill={teal} />
      <circle cx={mx} cy={my} r={17} fill="#334b58" stroke="#809593" />
      <path d={`M${mx} ${my - 17}a17 17 0 0 0 0 34Z`} fill={gold} />
      <Label x={x} y={y - 39} color={teal} size={wide ? 34 : 30}>
        {label}
      </Label>
    </g>
  );
}
function Sun({ x, y, w }) {
  return (
    <g stroke={gold} strokeWidth="3.5" fill="none">
      {[-1, 0, 1].map((i) => (
        <path key={i} d={`M${x} ${y + i * 19}h${w}m-9 -6l9 6-9 6`} />
      ))}
    </g>
  );
}
function LunarDrawing({
  layout,
  progress,
  texture,
  english,
  portrait,
  labels = [],
}) {
  const word = (zh, en) => (english ? en : zh);
  const w = portrait ? 760 : 1200,
    h = portrait ? 620 : 438;
  const disk = (x, y, r, angle) => (
    <MoonDisk x={x} y={y} r={r} angle={angle} texture surface={texture} />
  );
  const angle =
    (layout === "compare"
      ? 0.5 + 0.49 * ease(progress)
      : 0.13 + 0.37 * ease(progress)) * Math.PI;
  const compare = layout === "compare";
  // In the two-view shot both drawings use angle, including at the edit points.
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={word("月相机制示意", "Diagram of lunar phases")}
    >
      {Array.from({ length: 38 }, (_, i) => (
        <circle
          key={i}
          cx={(i * 179 + 47) % w}
          cy={(i * 113 + 41) % h}
          r={i % 6 ? 1 : 1.6}
          fill="#b5d3da"
          opacity={0.16 + (i % 5) * 0.06}
        />
      ))}
      {layout === "observe" && (
        <>
          {[0.22, 0.5, 0.96].map((q, i) => {
            const x = w * (0.17 + i * 0.33),
              y = h * 0.47,
              r = w * 0.124;
            return (
              <g
                key={q}
                opacity={
                  i === 0
                    ? 1
                    : 0.16 + 0.84 * ease(clamp((progress - 0.08 * i) * 4))
                }
              >
                {disk(x, y, r, Math.PI * q)}
                <Label
                  x={x}
                  y={y + r + 51}
                  size={portrait ? 32 : 41}
                  color={i === 0 ? gold : ink}
                >
                  {
                    (english
                      ? ["Crescent", "Quarter", "Near full"]
                      : labels.length >= 3
                        ? labels
                        : ["月牙", "上弦", "近满月"])[i]
                  }
                </Label>
              </g>
            );
          })}
        </>
      )}
      {layout === "light" && (
        <>
          <g opacity={0.25 + 0.75 * ease(clamp(progress * 3))}>
            <Sun x={w * 0.09} y={h * 0.44} w={w * 0.24} />
          </g>
          <Label x={w * 0.2} y={h * 0.44 + 82} color={gold}>
            {word("日光", "Sunlight")}
          </Label>
          <g transform={`translate(${w * 0.6} ${h * 0.45})`}>
            <circle
              r={h * 0.345}
              fill="#203643"
              stroke="#69838a"
              strokeWidth="2"
            />
            <path
              d={`M0 ${-h * 0.345}a${h * 0.345} ${h * 0.345} 0 0 0 0 ${h * 0.69}Z`}
              fill={gold}
            />
            <path
              d={`M0 ${-h * 0.345}v${h * 0.69}`}
              stroke="#fff3d7"
              strokeWidth="3"
              strokeDasharray="5 7"
            />
          </g>
          <g opacity={ease(clamp((progress - 0.16) * 4))}>
            <Label x={w * 0.6} y={h * 0.945} color={ink}>
              {word("受光半球   /   背光半球", "Day side   /   Night side")}
            </Label>
          </g>
        </>
      )}
      {(layout === "orbit" || compare) && (
        <>
          <Sun x={w * 0.015} y={h * (portrait ? 0.24 : 0.45)} w={w * 0.095} />
          <Label
            x={w * 0.077}
            y={h * (portrait ? 0.24 : 0.45) + 68}
            color={gold}
            size={30}
          >
            {word("日光", "Sunlight")}
          </Label>
          <Orbit
            x={w * (compare ? 0.36 : 0.49)}
            y={h * (portrait && compare ? 0.27 : 0.48)}
            r={w * (compare ? 0.175 : 0.27)}
            angle={angle}
            label={word("地球", "Earth")}
            wide={!portrait}
          />
          {compare ? (
            <>
              {disk(
                w * (portrait ? 0.67 : 0.76),
                h * (portrait ? 0.65 : 0.44),
                h * (portrait ? 0.19 : 0.315),
                angle,
              )}
              <Label
                x={w * (portrait ? 0.67 : 0.76)}
                y={h * (portrait ? 0.93 : 0.92)}
                size={portrait ? 35 : 43}
                color={gold}
              >
                {progress < 0.12
                  ? word("上弦", "First quarter")
                  : progress > 0.92
                    ? word("接近满月", "Near full")
                    : word("亮面渐多", "Waxing")}
              </Label>
            </>
          ) : (
            <Label
              x={w * 0.76}
              y={h * 0.91}
              size={portrait ? 30 : 39}
              color={teal}
            >
              {word("虚线 · 地球视线", "Dashed line · line of sight")}
            </Label>
          )}
        </>
      )}
      {layout === "answer" && (
        <>
          {[0.24, 0.5, 1].map((q, i) => {
            const x = w * (0.16 + i * 0.33);
            return (
              <g
                key={q}
                opacity={
                  0.32 + 0.68 * ease(clamp((progress + 0.15 - i * 0.1) * 4))
                }
              >
                {disk(x, h * 0.42, w * 0.108, Math.PI * q)}
                <Label
                  x={x}
                  y={h * 0.42 + w * 0.108 + 48}
                  size={portrait ? 32 : 38}
                >
                  {
                    (english
                      ? ["Crescent", "Quarter", "Full"]
                      : ["蛾眉月", "上弦月", "满月"])[i]
                  }
                </Label>
              </g>
            );
          })}
          <Label
            x={w * 0.5}
            y={h * 0.95}
            size={portrait ? 26 : 32}
            color={teal}
          >
            {word(
              "科学依据 · NASA / Moon Phases",
              "Source · NASA / Moon Phases",
            )}
          </Label>
        </>
      )}
    </svg>
  );
}

export function EditorialPlate({
  shot,
  assets,
  base,
  index,
  canvas,
  kind,
  variant,
  language,
  beats,
  captionCues = [],
  holdBeat,
}) {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig(),
    { width: w, height: h, frames } = canvas;
  const portrait = w < h,
    science = kind === "science";
  const active = holdBeat || [...beats].reverse().find((b) => b.from <= frame) || {
    phase: 0,
    from: 0,
  };
  const english =
    (language === "separate" && variant === "en") ||
    (language === "sequential" && active.lang === "en");
  const phase = active.phase,
    ref = assets.filter((a) => a.role === "product");
  const asset =
    ref.find((a) => a.id === shot.beatSources?.[phase]) ||
    ref[Math.min(phase, ref.length - 1)];
  const langCues = captionCues.filter(
    (c) => c.lang === (active.lang || variant),
  );
  const start = langCues[0]?.from || 0,
    nextLanguage =
      beats.find((b) => b.from > start && b.lang !== active.lang)?.from ??
      frames;
  const actionAt =
    shot.layout === "compare"
      ? (langCues[2]?.from ?? start + (nextLanguage - start) * 0.39)
      : start;
  const progress = clamp(
    (frame - actionAt) / Math.max(1, nextLanguage - actionAt - fps * 0.5),
  );
  const texture = assets.find((a) => a.role === "surface");
  const title = english ? shot.titleEn || shot.title : shot.title;
  const cover = !science && asset?.kind === "video" && phase >= 1;
  const dark = science || cover;
  const bg = dark ? "#101e2a" : "#f4f2e8",
    fg = dark ? ink : "#173c33",
    accent = dark ? gold : "#a24732";
  const chapter = science
    ? "SELENE   /   FIELD NOTES"
    : "FRAMEBOARD   /   PRODUCT FILM";
  if (cover) {
    const firstVideo=beats.find(b=>b.lang===active.lang && b.phase>=1 && ref.some(a=>a.id===shot.beatSources?.[b.phase] && a.kind==="video")) || active;
    const previous=beats[beats.indexOf(firstVideo)-1];
    const opacity=previous?clamp((frame-firstVideo.from)/(fps*.55)):1;
    return (
      <AbsoluteFill>
        {opacity<1 && previous && <EditorialPlate {...{shot,assets,base,index,canvas,kind,variant,language,beats,captionCues}} holdBeat={previous}/>}
        <AbsoluteFill style={{ background: "#101e2a", opacity }}>
        <Sequence from={active.from} layout="none">
          <OffthreadVideo
            muted
            src={base + asset.src}
            trimBefore={Math.round((shot.beatOffsets?.[phase] || 0) * fps)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </Sequence>
        <div
          style={{
            position: "absolute",
            top: "3.8%",
            right: "4%",
            border: "1px solid #658b80",
            background: "#142e2b",
            color: teal,
            padding: ".35em .65em",
            fontSize: w * 0.019,
            fontFamily: "Microsoft YaHei, sans-serif",
            fontWeight: 650,
          }}
        >
          {english ? "EXPORTED FILM" : "实际导出"}　·　{asset.width} ×{" "}
          {asset.height}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "21%",
            background: "#101e2a",
            borderTop: "2px solid #638077",
          }}
        />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        background: science
          ? "radial-gradient(ellipse at 57% 55%, #243848, #101d29 72%)"
          : bg,
        color: fg,
        fontFamily: "Microsoft YaHei, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "5%",
          left: "6%",
          right: "6%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: accent,
          fontSize: w * 0.019,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        <span>{chapter}</span>
        <span>
          {String(index).padStart(2, "0")}{" "}
          <span style={{ opacity: 0.65 }}>
            {" "}
            / {science ? "LUNA" : "STUDIO"}
          </span>
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: "11.5%",
          left: "6%",
          right: "6%",
          lineHeight: 1.12,
          fontWeight: 750,
          fontSize: Math.min(
            w * (portrait ? 0.068 : 0.052),
            (w * (english ? 1.49 : 0.86)) / Math.max(1, title.length),
          ),
          letterSpacing: "-.025em",
        }}
      >
        {title}
      </div>
      {science ? (
        <>
          <div
            style={{
              position: "absolute",
              left: "4%",
              right: "4%",
              top: "23%",
              bottom: portrait ? "28%" : "25%",
            }}
          >
            <LunarDrawing
              layout={shot.layout}
              progress={progress}
              texture={texture && base + texture.src}
              english={english}
              portrait={portrait}
              labels={shot.labels}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: "6%",
              bottom: "23%",
              fontSize: w * 0.019,
              color: "#b0c7c1",
              letterSpacing: 1.4,
            }}
          >
            {english
              ? "SCHEMATIC   /   NOT TO SCALE"
              : "轨道与月面示意　/　非等比"}
          </div>
        </>
      ) : (
        asset && (
          <div
            style={{
              position: "absolute",
              left: cover ? "4%" : "6%",
              right: cover ? "4%" : "6%",
              top: "24%",
              bottom: "24%",
              overflow: "hidden",
              borderLeft: `solid ${w * 0.004}px ${cover ? teal : accent}`,
              background: cover ? "#101e2a" : "#e8ebe3",
              boxShadow: "0 12px 36px #10272012",
            }}
          >
            {asset.kind === "video" ? (
              <Sequence from={active.from} layout="none">
                <OffthreadVideo
                  muted
                  src={base + asset.src}
                  trimBefore={Math.round(
                    (shot.beatOffsets?.[phase] || 0) * fps,
                  )}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </Sequence>
            ) : (
              <Img
                src={base + asset.src}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: `scale(${1 + 0.025 * ease(clamp(frame / (fps * 0.65)))})`,
                }}
              />
            )}
          </div>
        )
      )}
      <div
        style={{
          position: "absolute",
          bottom: "21%",
          left: "6%",
          right: "6%",
          height: 2,
          background: dark ? "#506773" : "#b4c1b7",
        }}
      />
    </AbsoluteFill>
  );
}

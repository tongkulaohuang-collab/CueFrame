import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";
import { ShotScene } from "./Scene";
import { SmallSubtitles } from './TextOverlays';
import {MIX,musicGain,speechWindows} from '../shared/audio-mix.mjs';

const clamp = (x) => Math.min(1, Math.max(0, x));
function ShotLayer({ row }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ opacity: row.overlap ? clamp((frame + 1) / row.overlap) : 1 }}
    >
      <ShotScene {...row.scene} silent hideCaptions />
    </AbsoluteFill>
  );
}
export function Film({
  rows,
  captions,
  music,
  canvas,
  variant,
  language,
  burnCaptions = false,
  captionMode = 'voice',
  captionBackplate = false,
  base = "",
}) {
  const frame = useCurrentFrame();
  const { width: w, height: h, frames, fps } = canvas;
  const voices = rows.flatMap((r) =>
    r.scene.voices.map((v) => ({ ...v, from: r.from + v.from, shotId: r.id })),
  );
  const windows=speechWindows(voices,fps,captions);
  const level=f=>musicGain(f/fps,windows,frames/fps);
  return (
    <AbsoluteFill style={{ background: "#101e2a" }}>
      {rows.map((r) => (
        <Sequence key={r.id} from={r.from} durationInFrames={r.frames}>
          <ShotLayer row={r} />
        </Sequence>
      ))}
      {voices.map((v) => (
        <Sequence
          key={v.shotId + v.asset.id}
          from={v.from}
          durationInFrames={v.frames}
        >
          <Audio src={base + v.asset.src} volume={MIX.voice}/>
        </Sequence>
      ))}
      {music.map((m) => (
        <Sequence
          key={m.from}
          from={m.from}
          durationInFrames={m.until - m.from}
        >
          <Audio
            loop
            src={base + m.asset.src}
            volume={(f) => level(f + m.from)}
            loopVolumeCurveBehavior="extend"
          />
        </Sequence>
      ))}
      {burnCaptions && <SmallSubtitles cues={captions} language={language} variant={variant} captionMode={captionMode} backplate={captionBackplate}/>}
    </AbsoluteFill>
  );
}

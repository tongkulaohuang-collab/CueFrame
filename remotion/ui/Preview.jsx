import React, { useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { ShotScene } from "../video/Scene";
import { Film } from "../video/Film";
export function Preview({ scene, whole = false, seek }) {
  const ref = useRef(null),
    [frame, F] = useState(0),
    [playing, P] = useState(false);
  const { width, height, fps, frames } = scene.canvas;
  useEffect(() => {
    if (seek) ref.current?.seekTo(Math.min(frames - 1, seek.frame));
  }, [seek, frames]);
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const tick = (e) => F(e.detail.frame),
      play = () => P(true),
      pause = () => P(false);
    player.addEventListener("frameupdate", tick);
    player.addEventListener("play", play);
    player.addEventListener("pause", pause);
    player.addEventListener("ended", pause);
    return () => {
      player.removeEventListener("frameupdate", tick);
      player.removeEventListener("play", play);
      player.removeEventListener("pause", pause);
      player.removeEventListener("ended", pause);
    };
  }, []);
  return (
    <div className="screen">
      <Player
        ref={ref}
        component={whole ? Film : ShotScene}
        inputProps={scene}
        compositionWidth={width}
        compositionHeight={height}
        fps={fps}
        durationInFrames={frames}
        controls={false}
        style={{ width: "100%", maxHeight: 450, background: "#101b22" }}
      />
      <div className="transport">
        <button
          onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}
        >
          {playing
            ? whole
              ? "暂停整片"
              : "暂停样镜"
            : whole
              ? "播放整片"
              : "播放样镜"}
        </button>
        <input
          aria-label="预览定位（帧）"
          type="range"
          min={0}
          max={frames - 1}
          value={frame}
          onChange={(e) => ref.current?.seekTo(Number(e.target.value))}
        />
        <output>
          {(frame / fps).toFixed(1)} / {(frames / fps).toFixed(1)} 秒
        </output>
        <button type="button" onClick={() => ref.current?.requestFullscreen()}>
          全屏
        </button>
      </div>
    </div>
  );
}

import { createHash } from "node:crypto";
import { upload } from "./media.mjs";
import { wave } from "./wave.mjs";
import { sceneProps } from "../shared/scene-props.mjs";
import { filmProps } from "../shared/film.mjs";
export function makeScore(p, id, lang) {
  const scene = id ? sceneProps(p, id, lang) : filmProps(p, lang),
    { frames, fps } = scene.canvas,
    sec = frames / fps;
  if (sec > 180)
    throw Error("本地配乐面向三分钟以内的样镜，可以上传更长的音轨");
  const rate = 24000,
    s = new Float32Array(Math.ceil(sec * rate)),
    tau = 2 * Math.PI;
  const science = p.kind === "science",
    palette = science
      ? [
          [146.83, 220],
          [174.61, 261.63],
          [196, 293.66],
        ]
      : [
          [196, 293.66],
          [246.94, 369.99],
          [261.63, 392],
        ];
  const beats =
    scene.beats ||
    scene.rows.flatMap((r) =>
      r.scene.beats
        .filter((b) => r.from + b.from < r.until)
        .map((b) => ({ ...b, from: r.from + b.from })),
    );
  for (const [i, beat] of beats.entries()) {
    const start = beat.from / fps,
      end = (beats[i + 1]?.from ?? frames) / fps,
      tones = palette[beat.phase];
    for (
      let n = Math.round(start * rate);
      n < Math.min(s.length, Math.ceil(end * rate));
      n++
    ) {
      const t = n / rate - start,
        left = end - n / rate;
      const envelope = Math.min(
        1,
        t / (science ? 0.45 : 0.06),
        Math.max(0, left) / 0.3,
      );
      const pad =
        (Math.sin(tau * tones[0] * t) + 0.5 * Math.sin(tau * tones[1] * t)) *
        0.13;
      const attack = science
        ? 0
        : 0.16 *
          Math.exp(-9 * t) *
          Math.sin(tau * (56 * t + 0.43 * (1 - Math.exp(-12 * t))));
      const chime =
        0.17 *
        Math.exp(-(science ? 1.8 : 3.3) * t) *
        Math.sin(tau * tones[1] * 2 * t);
      s[n] += Math.max(0, envelope) * (pad + chime) + attack;
    }
  }
  const plan = beats.map((b) => b.from),
    tag = createHash("sha256")
      .update(JSON.stringify([p.kind, plan, frames, fps]))
      .digest("hex")
      .slice(0, 8);
  return {
    ...upload("frameboard-score-" + tag + ".wav", wave(s, rate), {
      scoreFrames: plan,
    }),
    role: "music",
    source:
      "本工作台按" + (id ? "本镜 " : "全片 ") + plan.join(" / ") + " 帧合成",
    license: "本项目原创波形，无外部采样",
    credit: "Frameboard",
    confirmed: true,
  };
}

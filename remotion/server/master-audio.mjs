import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
const run = promisify(execFile);
const target = "loudnorm=I=-16:TP=-1.5:LRA=9";
async function measure(file) {
  const { stderr } = await run(
    ffmpeg.path,
    [
      "-hide_banner",
      "-i",
      file,
      "-vn",
      "-af",
      target + ":print_format=json",
      "-f",
      "null",
      "-",
    ],
    { windowsHide: true, maxBuffer: 2 ** 20 },
  );
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw Error("无法测量成片响度");
  return JSON.parse(match[0]);
}
export async function masterAudio(file, durationSeconds, {audioFile} = {}) {
  // Render the timeline mix as PCM first: encoding AAC inside the renderer's
  // intermediate container adds priming samples before the final MP4 mux.
  const before = await measure(audioFile || file);
  const silent = !Number.isFinite(Number(before.input_i));
  if (silent && !audioFile) return { mode: "silent" };
  const values = [
    ["measured_I", "input_i"],
    ["measured_TP", "input_tp"],
    ["measured_LRA", "input_lra"],
    ["measured_thresh", "input_thresh"],
    ["offset", "target_offset"],
  ]
    .map(([k, v]) => k + "=" + before[v])
    .join(":");
  const temp = path.join(path.dirname(file), "audio-master.mp4");
  await run(
    ffmpeg.path,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      ...(audioFile ? ["-i", audioFile] : []),
      "-map",
      "0:v:0",
      "-map",
      audioFile ? "1:a:0" : "0:a:0",
      "-c:v",
      "copy",
      ...(silent ? [] : ["-af", target + ":" + values + ":linear=true"]),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? ["-t", String(durationSeconds)] : []),
      "-movflags",
      "+faststart",
      temp,
    ],
    { windowsHide: true, maxBuffer: 2 ** 20 },
  );
  const after = await measure(temp);
  fs.renameSync(temp, file);
  return {
    mode: silent ? "silent" : "normalized",
    input: audioFile ? "lossless-timeline-mix" : "existing-audio-track",
    targetLUFS: -16,
    beforeLUFS: silent ? null : Number(before.input_i),
    finalLUFS: silent ? null : Number(after.input_i),
    truePeakDB: silent ? null : Number(after.input_tp),
    ...(Number.isFinite(durationSeconds) && durationSeconds > 0 ? {durationSeconds} : {}),
  };
}

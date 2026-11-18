import fs from "node:fs";
import {renderConcurrency} from './shared/render-settings.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  renderStill,
} from "@remotion/renderer";
import { masterAudio } from "./master-audio.mjs";
import {filmProofFrames} from './shared/direction.mjs';
const dir = fileURLToPath(new URL("./", import.meta.url));
const chrome = [
  process.env.FRAMEBOARD_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((f) => f && fs.existsSync(f));
const serveUrl = await bundle({
  entryPoint: path.join(dir, "entry.jsx"),
  publicDir: path.join(dir, "public"),
  enableCaching: false,
});
const options = {
  serveUrl,
  browserExecutable: chrome,
  logLevel: "error",
  timeoutInMilliseconds: 90000,
};
const composition = await selectComposition({ ...options, id: "FullFilm" });
if (process.argv.includes("--still")) {
  await renderStill({
    ...options,
    composition,
    frame: Math.min(
      composition.durationInFrames - 1,
      Math.floor(composition.fps * 1.5),
    ),
    output: path.join(dir, "proof.png"),
  });
} else {
  const preflightDir=path.join(dir,'preflight');fs.mkdirSync(preflightDir,{recursive:true});
  const frames=filmProofFrames(composition.props);
  for(const frame of frames)await renderStill({...options,composition,frame,output:path.join(preflightDir,frame+'.png')});
  fs.writeFileSync(path.join(preflightDir,'checked.json'),JSON.stringify({frames,checked:frames.length},null,2));
  const file = path.join(dir, "film.mp4");
  const hasAudio = composition.props.rows.some(r => r.scene.voices.length || r.scene.music);
  const audioFile = path.join(dir, 'timeline-mix.wav');
  await renderMedia({
    ...options,
    composition,
    outputLocation: file,
    codec: "h264",
    ...(hasAudio ? {audioCodec:'pcm-16', separateAudioTo:audioFile, sampleRate:48000} : {}),
    pixelFormat:
      composition.width % 2 || composition.height % 2 ? "yuv444p" : "yuv420p",
    crf: 16,
    imageFormat: "png",
    concurrency: renderConcurrency(process.env.FRAMEBOARD_RENDER_CONCURRENCY),
    overwrite: true,
  });
  if (hasAudio)
    await masterAudio(file, composition.durationInFrames / composition.fps, {audioFile});
}

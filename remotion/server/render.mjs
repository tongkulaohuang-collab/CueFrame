import fs from "node:fs";
import {renderConcurrency} from '../shared/render-settings.mjs';
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderMedia,
  renderStill,
} from "@remotion/renderer";
import { root, data, persistJob, jobs } from "./store.mjs";
import { probe, browserPath } from "./media.mjs";
export {browserPath} from './media.mjs';
import { uid, renderIssues } from "../shared/model.mjs";
import { sceneProps, RENDER_PIPELINE_VERSION } from "../shared/scene-props.mjs";
import { proofFrames, filmProofFrames } from "../shared/direction.mjs";
import { masterAudio } from "./master-audio.mjs";
import {inspectAudioContinuity} from './audio-continuity.mjs';
import { filmIssues, filmProps } from "../shared/film.mjs";
import { packageFilm, srt } from "./film-package.mjs";
import { scienceGate } from '../shared/science-flow.mjs';
import {designReport} from '../shared/director-quality.mjs';
import {shotVisualAssetIds} from '../shared/image-text-layers.mjs';
function renderSourceRevision(){
  const digest=createHash('sha256');
  for(const sub of ['shared','video','vendor/shotcraft','vendor/onda','portable'])
    for(const entry of fs.readdirSync(path.join(root,sub),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)))
      if(entry.isFile())digest.update(sub+'/'+entry.name+'\0').update(fs.readFileSync(path.join(root,sub,entry.name)));
  for(const file of ['server/render.mjs','server/film-package.mjs','server/master-audio.mjs'])digest.update(file+'\0').update(fs.readFileSync(path.join(root,file)));
  return digest.digest('hex');
}
const loadedRevision=renderSourceRevision();
export const rendererSourceCurrent=()=>renderSourceRevision()===loadedRevision;
function assertCurrentRenderer(){
  if(!rendererSourceCurrent())throw Object.assign(Error('工作台渲染器已更新，请从新版工作台入口继续本地渲染。原项目、素材和配音均已保留。'),{code:'WORKBENCH_RUNTIME_STALE',status:409});
}
let queue = Promise.resolve();
export function render(p, id, variant, base, scope = "shot", {preserveVisuals=false}={}) {
  assertCurrentRenderer();
  const gate = scienceGate(p, scope !== 'shot', {preserveVisuals:scope==='shot'&&preserveVisuals});
  if (gate.length) throw Error(gate.join('；'));
  if (!["zh", "en"].includes(variant)) throw Error("未知语言版本");
  const issues =
    scope === "shot"
      ? renderIssues(p, id, variant, undefined, {preserveVisuals})
      : filmIssues(p, variant, scope === "film");
  if (issues.length) throw Error(issues.join("；"));
  if (scope !== "shot") {
    const used = new Set(p.shots.flatMap(shotVisualAssetIds));
    for (const a of p.assets.filter((a) => used.has(a.id)))
      if (!fs.existsSync(path.join(data, "uploads", path.basename(a.src))))
        throw Error("素材文件缺失，请补齐：" + a.name);
  }
  const j = persistJob({
    id: uid(),
    type: "render",
    pipelineVersion: RENDER_PIPELINE_VERSION,
    owner: process.pid,
    project: p.id,
    version: p.version,
    shotId: id,
    scope,
    ...(preserveVisuals?{preservedVisuals:true}:{}),
    variant,
    status: "queued",
    created: new Date().toISOString(),
  });
  queue = queue
    .then(() => perform(p, j, base))
    .catch((e) => {
      persistJob({ ...j, status: "failed", error: e.message });
    });
  return j;
}
async function perform(p, j, base) {
  assertCurrentRenderer();
  const folder = path.join(data, "exports", j.id);
  fs.mkdirSync(folder, { recursive: true });
  const whole = j.scope !== "shot";
  const props = whole
      ? filmProps(p, j.variant, base)
      : sceneProps(p, j.shotId, j.variant, base),
    { frames, fps } = props.canvas;
  const revision = loadedRevision;
  const digest = createHash("sha256").update(revision);
  if (whole)
    digest.update(
      JSON.stringify(props, (k, v) =>
        ["filmQA", "reviewed", "approvedLook", "base"].includes(k)
          ? undefined
          : v,
      ),
    );
  const fingerprint = whole ? digest.digest("hex") : null;
  // Keep the exact compiler output used by preflight and encoding, so a
  // portable-package comparison can identify stale workers or changed timing.
  fs.writeFileSync(path.join(folder,'render-input.json'),JSON.stringify(props,null,2));
  const reusable =
    j.scope === "film" &&
    jobs(p.id).find(
      (x) =>
        x.scope === "rough" &&
        x.status === "done" &&
        x.evidence?.fingerprint === fingerprint,
    );
  const mp4 = path.join(folder, whole ? "film.mp4" : "sample.mp4");
  let audioMix, checks;
  j.status = "running";
  j.step = "关键帧与画面渲染";
  persistJob(j);
  if (
    reusable &&
    fs.existsSync(path.join(data, "exports", reusable.id, "film.mp4"))
  ) {
    for (const file of ["film.mp4", "entry.png", "peak.png", "settled.png"])
      fs.copyFileSync(
        path.join(data, "exports", reusable.id, file),
        path.join(folder, file),
      );
    ({ audioMix, checks } = reusable.evidence);
    j.fromRough = reusable.id;
  } else {
    // Each job gets an isolated bundle. The output must not depend on which
    // project the worker rendered previously, or a persistent webpack cache.
    const serveUrl = await bundle({
      entryPoint: path.join(root, "video/entry.jsx"),
      publicDir: null,
      enableCaching: false,
    }),
      browserExecutable = browserPath(),
      browser = await openBrowser("chrome", {
        browserExecutable,
        logLevel: "error",
      });
    assertCurrentRenderer();
    const options = {
      serveUrl,
      inputProps: props,
      puppeteerInstance: browser,
      browserExecutable,
      logLevel: "error",
      timeoutInMilliseconds: 60000,
    };
    let composition;
    try {
      composition = await selectComposition({
        ...options,
        id: whole ? "FullFilm" : "SampleShot",
      });
      fs.writeFileSync(path.join(folder,'render-composition.json'),JSON.stringify(composition.props,null,2));
      const keyframes = whole
        ? [
            Math.min(frames - 1, fps),
            props.rows[Math.floor(props.rows.length / 2)].from +
              Math.min(
                fps,
                props.rows[Math.floor(props.rows.length / 2)].frames - 1,
              ),
            frames - 1,
          ]
        : proofFrames(props);
      for (const [index, label] of ["entry", "peak", "settled"].entries()) {
        await renderStill({
          ...options,
          composition,
          frame: keyframes[index],
          output: path.join(folder, label + ".png"),
        });
      }
      if(whole){
        j.step='逐镜排版预检';j.preflight={frames:filmProofFrames(props),checked:0};persistJob(j);
        for(const frame of j.preflight.frames){
          await renderStill({...options,composition,frame,output:path.join(folder,'preflight-'+frame+'.png')});
          j.preflight.checked++;
        }
        persistJob(j);
      }
    } finally {
      await browser.close({ silent: true });
    }
    const hasAudio = whole
      ? props.rows.some(r => r.scene.voices.length || r.scene.music)
      : Boolean(props.voices.length || props.music);
    const audioFile = path.join(folder, 'timeline-mix.wav');
    const encode = (concurrency) =>
      renderMedia({
        ...options,
        puppeteerInstance: undefined,
        composition,
        outputLocation: mp4,
        overwrite: true,
        codec: "h264",
        ...(hasAudio ? {audioCodec:'pcm-16', separateAudioTo:audioFile, sampleRate:48000} : {}),
        imageFormat: "png",
        crf: 16,
        pixelFormat: p.width % 2 || p.height % 2 ? "yuv444p" : "yuv420p",
        concurrency,
        onProgress: ({ progress }) => {
          const n = Math.floor(progress * 10);
          if (n !== j.progress) {
            j.progress = n;
            persistJob(j);
          }
        },
      });
    j.renderAttempts = 1;
    j.step='完整画面编码';persistJob(j);
    j.renderConcurrency=renderConcurrency(process.env.FRAMEBOARD_RENDER_CONCURRENCY);
    try {
      await encode(j.renderConcurrency);
    } catch (e) {
      if (!/but got no response|ERR_CONNECTION_RESET/.test(e.message)) throw e;
      j.renderAttempts = 2;
      j.localRetryReason = e.message;
      persistJob(j);
      await encode(1);
    }
    audioMix = hasAudio
      ? await masterAudio(mp4, composition.durationInFrames / composition.fps, {audioFile})
      : null;
    j.step = "音画检测";
    persistJob(j);
    checks = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          path.join(root, "vendor/frame-check/check-frames.mjs"),
          mp4,
          "--standalone",
        ],
        {
          env: { ...process.env, FRAMEBOARD_FFMPEG: ffmpeg.path },
          windowsHide: true,
        },
      );
      let log = "";
      child.stdout.on("data", (b) => (log += b));
      child.stderr.on("data", (b) => (log += b));
      child.on("error", (e) => resolve({ code: 2, log: e.message }));
      child.on("close", (code) => resolve({ code, log: log.slice(-4000) }));
    });
  }
  const inspected = probe(mp4),
    v = inspected.streams.find((s) => s.codec_type === "video");
  if (
    Number(v.nb_frames) !== frames ||
    v.width !== p.width ||
    v.height !== p.height
  )
    throw Error("导出画幅或帧数与帧表不符");
  const audioContinuity=inspected.streams.some(s=>s.codec_type==='audio')?await inspectAudioContinuity(mp4,frames/fps):{mode:'no-audio',silences:[]};
  assertCurrentRenderer();
  const evidence = {
    sourceRevision: revision,
    audioContinuity,
    project: p.id,
    version: p.version,
    shotId: j.shotId,
    title: whole ? p.title : props.shot.title,
    scope: j.scope,
    width: v.width,
    height: v.height,
    fps,
    frames: Number(v.nb_frames),
    audio: inspected.streams.some((s) => s.codec_type === "audio"),
    duration: Number(inspected.format.duration),
    variant: j.variant,
    checks,
    ...(j.preflight?{preflight:j.preflight}:{}),
    direction: p.kind==='science'? (whole?p.shots:[props.shot]).map(s=>({shotId:s.id,...designReport(p,s.id)})):undefined,
    claims: p.claims.filter((c) =>
      whole
        ? p.shots.some((s) => s.claimIds.includes(c.id))
        : props.shot.claimIds.includes(c.id),
    ),
    assets: (whole
      ? p.assets.filter((a) => p.shots.some((s) => shotVisualAssetIds(s).includes(a.id)))
      : props.assets
    ).map(
      ({
        id,
        name,
        source,
        license,
        credit,
        role,
        width,
        height,
        voiceLabel,
        segments,
      }) => ({
        id,
        name,
        source,
        license,
        credit,
        role,
        width,
        height,
        voiceLabel,
        segments,
      }),
    ),
    cues: props.cues,
    captionCues: props.captionCues,
    voiceTracks: whole
      ? props.rows.reduce((n, r) => n + r.scene.voices.length, 0)
      : props.voices.length,
    audioMix,
    look: props.look,
    beats: props.beats,
    beatLabels: props.beatLabels,
    ...(whole
      ? {
          fingerprint,
          sha256: createHash("sha256")
            .update(fs.readFileSync(mp4))
            .digest("hex"),
          rows: props.rows.map((r) => ({
            id: r.id,
            title: r.scene.shot.title,
            from: r.from,
            frames: r.frames,
            overlap: r.overlap,
            padding: r.padding,
            quality: r.scene.shot.filmQA,
          })),
          captions: props.captions,
        }
      : {}),
  };
  if (j.scope === "film") {
    assertCurrentRenderer();
    j.step = "独立工程与交付包";
    persistJob(j);
    await packageFilm(p, props, folder);
  }
  if(j.scope==='rough')fs.writeFileSync(path.join(folder,'subtitles.srt'),srt(props));
  if(!whole)fs.writeFileSync(path.join(folder,'subtitles.srt'),srt({
    ...props,captions:props.captionCues.map(c=>({...c,until:c.until??frames})),
  }));
  fs.writeFileSync(
    path.join(folder, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  const cut =
    p.id.slice(0, 8) +
    "-v" +
    p.version +
    "-" +
    (whole ? j.scope : j.shotId.slice(0, 8)) +
    "-" +
    j.variant +
    "-" +
    j.id.slice(0, 6) +
    ".mp4";
  fs.copyFileSync(mp4, path.join(data, "reviews", cut));
  fs.writeFileSync(
    path.join(data, "reviews", cut + ".json"),
    JSON.stringify(evidence),
  );
  Object.assign(j, {
    status: "done",
    finished: new Date().toISOString(),
    cut,
    output: "/exports/" + j.id + "/",
    evidence,
  });
  persistJob(j);
}

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { build, createServer as viteServer } from "vite";
import {
  data,
  runtime,
  root,
  list,
  get,
  write,
  save,
  job,
  jobs,
  persistJob,
  recover,
  conflict,
} from "./store.mjs";
import { upload, sendFile } from "./media.mjs";
import { review, screening, renderIssues, uid } from "../shared/model.mjs";
import { prepare, approve, applyJob, reconcile, jobHelp, recoverRhythmJob, recoverMotionJob, recoverSavedRhythm } from "./codex.mjs";
import { render,rendererSourceCurrent } from "./render.mjs";
import {voiceManagerUi} from './voice-manager-ui.mjs';
import {segmentStatus,startSegments,cancelSegments,reviseSegment} from './segments.mjs';
import {joinVideos} from './joined-video.mjs';
import {archivedRoughSubtitles} from './film-package.mjs';
import { audition } from "./casting.mjs";
import { doubaoCasting } from "./doubao-casting.mjs";
import { makeScore } from "./score.mjs";
import {library as keynata,trackAudio} from './keynata-library.mjs';
import {lemoStyles} from '../shared/lemo.mjs';
import {adoptKeynata} from './keynata-project.mjs';
import {analyzeBgm, listenMix, approveScience} from './science-production.mjs';
import {assembleVoices,voiceAssemblyStatus} from './voice-assembly.mjs';
import { filmIssues } from "../shared/film.mjs";
import { videoWorkflowPolicy } from '../shared/workflow-policy.mjs';
import {VISUAL_SCOPE_VERSION} from '../shared/visual-continuity.mjs';
import {MOTION_DESIGN_VERSION} from '../shared/motion-dynamics.mjs';
import {DIRECTOR_REVIEW_VERSION} from '../shared/director-quality.mjs';
import {CAMERA_PLAN_VERSION} from '../shared/camera-plan.mjs';
import {GRAPHICS_VERSION} from '../shared/graphics-state.mjs';
import {recordSampleDecision} from './sample-decision.mjs';
import {applyShotImage,importShotImage} from './shot-images.mjs';
import {materialFrames} from './material-frames.mjs';
import {readReference} from './reference-reader.mjs';
import {reviewMedia,decideReferenceSegment} from './reference-review.mjs';
import { scienceStatus, checkEngine, startDemo, openBlender, importOutput, resolveOutput } from "./science-tools.mjs";
import {localJobs,localStatus,startLocal} from './local-process.mjs';
import {voicePreviews} from './voice-previews.mjs';
import {libraryState,saveLibrary,applyLibrary} from './motion-library.mjs';
import {alignmentStatus,startAlignment,applyAlignment,calibrateAlignment,assertAlignmentReceipts} from './voice-alignment.mjs';
import {WORKBENCH_CAPABILITIES} from '../shared/workbench-version.mjs';
import {generationRuntime} from './generation-runtime.mjs';
import {workbenchRouting} from './workbench-routing.mjs';
const port = Number(
    process.argv.find((a) => a.startsWith("--port="))?.slice(7) ||
      process.env.PORT ||
      4173,
  ),
  address = "127.0.0.1",
  base = "http://" + address + ":" + port;
const reviewPort = Number(
  process.env.FRAMEBOARD_REVIEW_PORT || (port === 4183 ? 4410 : 4400),
);
const dev = process.argv.includes("--dev");
if(runtime.environment==='test'&&[4173,4183].includes(port))throw Error('测试服务不得占用正式工作台端口，请设置独立 PORT。');
const uiDist = path.join(root, "dist");
const routing=workbenchRouting({root,data,port,fingerprint:generationRuntime.fingerprint});
const speech = doubaoCasting();
const previews = voicePreviews();
if (!dev && !fs.existsSync(path.join(uiDist, "index.html")))
  await build({ root, logLevel: "warn" });
const vite = dev
  ? await viteServer({
      root,
      server: {
        middlewareMode: true,
        hmr: false,
        fs: {
          strict: true,
          allow: [root],
          deny: ["**/data/**", "**/.*/**", "**/server/**", "**/examples/**"],
        },
      },
      appType: "spa",
    })
  : null;
let room;
const read = async (req, limit) => {
  const parts = [];
  let n = 0;
  for await (const buf of req) {
    n += buf.length;
    if (n > limit) throw Error("文件过大，请使用小于 64 MB 的素材");
    parts.push(buf);
  }
  return Buffer.concat(parts);
};
const json = (res, x, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(x));
};
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, base),
      pathname = u.pathname;
    if (
      !["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)
    ) {
      res.writeHead(403);
      return res.end();
    }
    if (
      req.method === "POST" &&
      req.headers.origin &&
      !(
        req.headers.origin === base ||
        req.headers.origin === "http://localhost:" + port
      )
    ) {
      res.writeHead(403);
      return res.end();
    }
    const managesVoice = ["/voice", "/voice.js", "/voice.css"].includes(pathname) || pathname.startsWith("/api/speech/");
    const projectSpeech = /^\/api\/projects\/([\w-]+)\/doubao$/.exec(pathname);
    if ((managesVoice || projectSpeech || pathname === "/api/doubao/voices") && req.headers.origin &&
        req.headers.origin !== base && req.headers.origin !== "http://localhost:" + port) {
      return json(res, { error: "配音只允许同源访问" }, 403);
    }
    if (req.headers.origin && local.test(req.headers.origin))
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    // A previous address for this exact data directory follows the current
    // instance, including POSTs from pages that were already open during update.
    if(!(pathname==='/api/runtime'&&u.searchParams.get('instance')==='1')&&await routing.forward(req,res))return;
    if(await voiceManagerUi(req,res,u))return;
    if (managesVoice) {
      if (pathname.startsWith("/api/speech/") && ![
        "status", "history", "upload", "voices/register", "voices/query", "prepare", "execute", "config",
      ].includes(pathname.slice("/api/speech/".length))) return json(res, { error: "入口不存在" }, 404);
      const { handleVoiceManager } = await import("../../video-workflow/mcp/voice-manager.mjs");
      return await handleVoiceManager(req, res, u);
    }
    if (
      /^\/media\/[a-f0-9-]+\.(png|jpe?g|webp|mp4|webm|wav|mp3|m4a|ogg|txt|pdf)$/.test(
        pathname,
      )
    )
      return sendFile(
        req,
        res,
        path.join(data, "uploads", path.basename(pathname)),
      );
    if (
      /^\/exports\/[\da-f-]+\/((sample|film)\.mp4|(entry|peak|settled)\.png|(sources|evidence)\.json|editable-project\.zip|storyboard\.csv|subtitles\.srt)$/.test(
        pathname,
      )
    ) {
      const file=path.join(data,pathname.slice(1));
      if(path.basename(file)==='subtitles.srt'&&!fs.existsSync(file)){
        const renderJob=job(path.basename(path.dirname(file)));
        if(renderJob?.scope==='rough'&&renderJob.status==='done'){
          const subtitles=archivedRoughSubtitles(path.dirname(file),renderJob,get(renderJob.project,renderJob.version));
          if(subtitles!==null){
            res.writeHead(200,{'Content-Type':'application/x-subrip; charset=utf-8','Content-Length':Buffer.byteLength(subtitles)});
            return res.end(req.method==='HEAD'?undefined:subtitles);
          }
        }
      }
      return sendFile(req,res,file);
    }
    if (!pathname.startsWith("/api/")) {
      if (vite) return vite.middlewares(req, res);
      if (pathname === "/" || pathname === "/index.html")
        return sendFile(
          req,
          res,
          path.join(uiDist, "index.html"),
          "text/html; charset=utf-8",
        );
      const match = /^\/assets\/([\w.-]+)\.(js|css)$/.exec(pathname);
      const cover = /^\/lemo\/([a-z0-9-]+\.jpg)$/.exec(pathname);
      if (cover) return sendFile(req,res,path.join(uiDist,'lemo',cover[1]),'image/jpeg');
      if (match)
        return sendFile(
          req,
          res,
          path.join(uiDist, "assets", match[1] + "." + match[2]),
          match[2] === "js"
            ? "text/javascript; charset=utf-8"
            : "text/css; charset=utf-8",
        );
      res.writeHead(404);
      return res.end();
    }
    if (pathname === "/api/health" && req.method === "GET")
      return json(res, { app: "frameboard", phase: 2, scienceTools: 1, doubaoCasting: 1, scienceFlow: 1, automaticScience: 1, voiceDraftSync: 1, musicVoiceBatch: 1, voiceRecovery: 1, rhythmRecovery:1, motionRecovery:1, qualityFoundations:1, graphicsMotion:GRAPHICS_VERSION, motionComparison:1, materialPlanner: 1, allShotImageAnalysis:1, materialSupplement: 1, materialDrawing: 1, sampleReview: 1, sampleCreation: 1, shotVisualScope:VISUAL_SCOPE_VERSION, cameraPlan:CAMERA_PLAN_VERSION, motionDesign:MOTION_DESIGN_VERSION, directorReview:DIRECTOR_REVIEW_VERSION, topicResearch: 1, referenceReader: 1, referenceMotion: 1, storyboard:1, keynataTracks: keynata.tracks.length,lemoStyles:lemoStyles.length });
    const reviewVideo=/^\/api\/projects\/([\w-]+)\/reference-review\/([\w-]+)\/video$/.exec(pathname);
    if(reviewVideo&&['GET','HEAD'].includes(req.method)){
      const {file,mime}=reviewMedia(reviewVideo[1],reviewVideo[2]);
      return sendFile(req,res,file,mime);
    }
    if (pathname==='/api/music/keynata' && req.method==='GET') return json(res,keynata);
    const keynataMedia=/^\/api\/music\/keynata\/([a-z0-9_]+)\/audio$/.exec(pathname);
    if(keynataMedia && ['GET','HEAD'].includes(req.method))
      return sendFile(req,res,await trackAudio(keynataMedia[1]),'audio/mpeg');
    if (req.method === "GET" && pathname === "/api/doubao/voices")
      return json(res, await speech.voices());
    const previewAudio=/^\/api\/doubao\/previews\/([a-f0-9-]{36})\/audio$/.exec(pathname);
    if(previewAudio&&['GET','HEAD'].includes(req.method))return sendFile(req,res,await previews.audio(previewAudio[1]),'audio/mpeg');
    if (pathname === '/api/runtime' && req.method === 'GET') return json(res,{environment:runtime.environment,policyVersion:4,capabilities:WORKBENCH_CAPABILITIES,researchRecommendation:true,
      workspaceId:routing.own.workspaceId,instanceId:routing.own.instanceId,generationFingerprint:generationRuntime.fingerprint,sourceCurrent:generationRuntime.current(),rendererSourceCurrent:rendererSourceCurrent()});
    if (pathname === '/api/workflow-policy' && req.method === 'GET')
      return json(res, videoWorkflowPolicy);
    if (pathname === "/api/science/status" && req.method === "GET")
      return json(res, await scienceStatus());
    if (pathname === "/api/science/output" && ["GET", "HEAD"].includes(req.method))
      return sendFile(req, res, resolveOutput(u.searchParams.get("id")));
    if (req.method === "POST" && pathname === "/api/upload")
      return json(
        res,
        upload(
          u.searchParams.get("name") || "",
          await read(req, 64 * 1024 * 1024),
        ),
      );
    const b =
      req.method === "POST"
        ? JSON.parse((await read(req, 2 * 1024 * 1024)).toString() || "{}")
        : {};
    const referenceDecision=/^\/api\/projects\/([\w-]+)\/reference-review$/.exec(pathname);
    if(referenceDecision&&req.method==='POST')return json(res,decideReferenceSegment(referenceDecision[1],b));
    if (pathname === '/api/references/read' && req.method === 'POST')
      return json(res, await readReference(String(b.url || ''), {force: b.force === true}));
    if(pathname==='/api/motion-library')return json(res,req.method==='POST'?saveLibrary(b):libraryState());
    const motionLibraryRoute=/^\/api\/projects\/([\w-]+)\/motion-library$/.exec(pathname);
    if(motionLibraryRoute&&req.method==='POST')return json(res,applyLibrary(motionLibraryRoute[1],b));
    if(pathname==='/api/doubao/previews'&&req.method==='POST'){
      if(!['prepare','execute','check'].includes(b.action))return json(res,{error:'无效的试听操作'},400);
      return json(res,await previews[b.action](b));
    }
    if (projectSpeech) {
      const p = get(projectSpeech[1]);
      if (!p) return json(res, { error: "草稿不存在" }, 404);
      if (req.method === "GET") return json(res, speech.history(p, Object.fromEntries(u.searchParams)));
      if (req.method !== "POST" || !["prepare", "execute", "check", "adopt", "authorizeRetry", "restoreOriginal"].includes(b.action))
        return json(res, { error: "无效的试听操作" }, 400);
      if (b.action !== "check" && b.version !== p.version) throw conflict("草稿已更新，请重新打开后再操作");
      return json(res, await speech[b.action](p, b));
    }
    if (pathname === '/api/science/local' && req.method === 'GET') return json(res,localStatus(u.searchParams.get('project')));
    if (pathname === '/api/science/local' && req.method === 'POST') return json(res,startLocal(b));
    if (req.method === "POST" && pathname === "/api/science/check")
      return json(res, await checkEngine(b.engine));
    if (req.method === "POST" && pathname === "/api/science/demo")
      return json(res, await startDemo());
    if (req.method === "POST" && pathname === "/api/science/blender")
      return json(res, await openBlender());
    if (req.method === "POST" && pathname === "/api/science/import")
      return json(res, importOutput(b.id));
    if (pathname === "/api/projects")
      return json(
        res,
        req.method === "POST"
          ? (assertAlignmentReceipts(b),save(b))
          : list().map(({ id, title, topic, kind, version, updated }) => ({
              id,
              title,
              topic,
              kind,
              version,
              updated,
            })),
      );
    if (pathname === "/api/room" && req.method === "POST") {
      if (!room || room.exitCode !== null) {
        room = spawn(
          process.execPath,
          [
            path.join(root, "vendor/take-one/server.mjs"),
            path.join(data, "reviews"),
            String(reviewPort),
          ],
          { windowsHide: true, stdio: "ignore" },
        );
      }
      const url = "http://127.0.0.1:" + reviewPort;
      for (let i = 0; i < 25; i++) {
        try {
          const r = await fetch(url + "/api/cuts");
          if (r.ok) return json(res, { url });
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("审片室没有启动，请检查审片端口");
    }
    if (pathname === "/api/search" && req.method === "POST") {
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.set(
        "query.bibliographic",
        String(b.query || "").slice(0, 300),
      );
      url.searchParams.set("filter", "type:journal-article");
      url.searchParams.set("rows", "5");
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw Error("Crossref 暂不可用，可手动填写出处");
      const d = await r.json();
      return json(
        res,
        d.message.items.map((i) => ({
          title: i.title?.[0],
          url: i.URL,
          venue: i["container-title"]?.[0],
        })),
      );
    }
    const m =
      /^\/api\/projects\/([\w-]+)(?:\/(review|jobs|codex|render|render-pair|audition|score|film|rough|segments|join|notes|copy|bgm|mix|voice-assembly|voice-alignment|science-review|keynata|shot-image|source-image|image-frames))?$/.exec(
        pathname,
      );
    if (m) {
      const p = get(
        m[1],
        req.method === "GET" ? u.searchParams.get("version") : undefined,
      );
      if (!p) throw Error("草稿不存在");
      if(req.method==='GET'&&m[2]==='voice-alignment')return json(res,alignmentStatus(p,u.searchParams.get('shotId'),u.searchParams.get('lang')));
      if(req.method==='GET'&&m[2]==='image-frames') {
        const key=u.searchParams.get('frame');
        const focus=u.searchParams.get('scope')==='all'?p.shots.map(s=>s.id):u.searchParams.get('shotId');
        const frames=materialFrames(p,focus,!key);
        if(key){const frame=frames.find(f=>f.key===key);if(!frame)throw Error('当前参考画面已变化');return sendFile(req,res,frame.file,'image/jpeg');}
        return json(res,frames.map(({file,key,...f})=>({...f,url:f.url||'/api/projects/'+p.id+'/image-frames?frame='+encodeURIComponent(key)+'&version='+p.version})));
      }
      if (req.method === "GET" && m[2] === "notes") {
        const file = path.join(data, "reviews", "review-notes", "notes.json");
        return json(
          res,
          fs.existsSync(file)
            ? JSON.parse(fs.readFileSync(file)).notes.filter(
                (n) => n.project === p.id,
              )
            : [],
        );
      }
      if(req.method==='GET'&&m[2]==='voice-assembly')return json(res,voiceAssemblyStatus(p));
      if(req.method==='GET'&&m[2]==='segments')return json(res,segmentStatus(p,u.searchParams.get('variant')||p.voice));
      if(req.method==='GET'&&m[2]==='jobs'&&p.kind==='science'&&u.searchParams.get('workbench')==='1'){
        const production=speech.workbenchStatus(p);
        for(const j of localJobs(p.id))production.push({id:j.id,type:'local-render',project:j.project,shotId:j.shotId,status:j.status,created:j.created,error:j.error});
        return json(res,{jobs:jobs(p.id).map(jobHelp),production});
      }
      if (req.method === "GET")
        return json(res, m[2] === "jobs" ? jobs(p.id).map(jobHelp) : p);
      if (b.version !== p.version) throw conflict("请刷新到最新版本后再操作");
      if(m[2]==='voice-alignment')return json(res,b.action==='apply'?applyAlignment(p,b):b.action==='calibrate'?calibrateAlignment(p,b):startAlignment(p,b));
      if(m[2]==='shot-image')return json(res,applyShotImage(p,b));
      if(m[2]==='source-image')return json(res,await importShotImage(p,b));
      if(m[2]==='segments')return json(res,startSegments(p,b,base));
      if(m[2]==='join') {
        const variant=b.variant||p.voice;
        return json(res,joinVideos(p,segmentStatus(p,variant).rows,variant,{final:b.final===true}));
      }
      if(m[2]==='voice-assembly')return json(res,await assembleVoices(p,b));
      if(m[2]==='keynata') return json(res,await adoptKeynata(p,b.trackId));
      if (m[2] === "copy")
        return json(
          res,
          write(
            {
              ...p,
              ...(p.kind==='science'?{scienceFlow:{...p.scienceFlow,scriptVersion:null,proofs:null,proofVersion:null,sampleJob:null}}:{}),
              id: uid(),
              version: 0,
              title: (p.title || p.topic) + " · 副本",
              origin: { project: p.id, version: p.version },
            },
            0,
          ),
        );
      if (m[2] === "audition")
        return json(res, await audition(p, b.shotId, b.lang));
      if (m[2] === "score")
        return json(res, makeScore(p, b.shotId, b.lang || p.voice));
      if (m[2] === "review") {
        review(p, b.kind, b.id, b.check, b.pass);
        return json(res, write(p, b.version));
      }
      if (['bgm','mix','science-review'].includes(m[2])) {
        if(p.kind!=='science') throw Error('请打开科普项目');
        return json(res,m[2]==='bgm'?await analyzeBgm(p,b):m[2]==='mix'?await listenMix(p,b.shotId):approveScience(p,b.action,b.id));
      }
      if (m[2] === "codex") {
        const prepared = prepare(p, b.shotId, b.task, {materialId:b.materialId,researchScope:b.researchScope,researchJobId:b.researchJobId,variant:b.variant,issue:b.issue,repairOf:b.repairOf,captionTranslation:b.captionTranslation===true,force:b.force===true});
        return json(res, ['rhythm','research-recommendation'].includes(b.task) && b.submit === true ? approve(prepared.id) : prepared);
      }
      if (["film", "rough"].includes(m[2])) {
        const final = m[2] === "film";
        const variants =
          final && p.language === "separate"
            ? ["zh", "en"]
            : [p.language === "separate" ? b.variant || p.voice : p.voice];
        const issues = variants.flatMap((lang) => filmIssues(p, lang, final));
        if (issues.length) throw Error([...new Set(issues)].join("；"));
        return json(
          res,
          variants.map((lang) => render(p, null, lang, base, m[2])),
        );
      }
      if (m[2] === "render")
        return json(res, render(p, b.shotId, b.variant || p.voice, base));
      if (m[2] === "render-pair") {
        if (p.language !== "separate") throw Error("请选择分别导出中英文");
        const both = ["zh", "en"];
        const issues = both.flatMap((lang) => renderIssues(p, b.shotId, lang));
        if (issues.length) throw Error([...new Set(issues)].join("；"));
        return json(
          res,
          both.map((lang) => render(p, b.shotId, lang, base)),
        );
      }
    }
    const j =
      /^\/api\/jobs\/([\w-]+)(?:\/(approve|apply|reconcile|qa|retry|sample-review|revise|cancel|recover-rhythm))?$/.exec(
        pathname,
      );
    if (j) {
      if (req.method === "GET") return json(res, jobHelp(job(j[1])));
      if(j[2]==='recover-rhythm')return json(res,jobHelp(recoverSavedRhythm(j[1],b.version)));
      if(j[2]==='cancel')return json(res,cancelSegments(j[1]));
      if(j[2]==='revise') {
        const source=job(j[1]),latest=get(source.project);
        if(b.version!==latest.version)throw conflict('请保存并刷新到当前版本后执行修改');
        return json(res,reviseSegment(latest,source,b.scope,base));
      }
      if (j[2] === 'sample-review') return json(res,recordSampleDecision(j[1],b));
      if (j[2] === "approve" && b.confirm === j[1])
        return json(res, approve(j[1]));
      if (j[2] === "apply") return json(res, applyJob(j[1],b.picks));
      if (j[2] === "reconcile") return json(res, reconcile(j[1], b.note));
      if (j[2] === "retry") {
        const old = job(j[1]);
        if (old.type !== "render" || old.status !== "failed")
          throw Error("只有失败的本地渲染可重试");
        if (
          old.retryId &&
          ["queued", "running", "done"].includes(job(old.retryId).status)
        )
          return json(res, job(old.retryId));
        const next = render(
          get(old.project, old.version),
          old.shotId,
          old.variant,
          base,
          old.scope || "shot",
        );
        persistJob({ ...old, retryId: next.id });
        return json(res, next);
      }
      if (j[2] === "qa") {
        const current = job(j[1]);
        if (
          current.type !== "render" ||
          current.status !== "done" ||
          !screening.includes(b.check) ||
          typeof b.pass !== "boolean"
        )
          throw Error("无效的审片记录");
        return json(
          res,
          persistJob({ ...current, qa: { ...current.qa, [b.check]: b.pass } }),
        );
      }
    }
    return json(res, { error: "入口不存在" }, 404);
  } catch (e) {
    json(res, { error: e.message, code:e.code||undefined }, e.status || 400);
  }
});
server.listen(port, address, () => {
  generationRuntime.assertCurrent();
  routing.publish();
  recover(recoverRhythmJob, recoverMotionJob);
  console.log("Frameboard  " + base);
  if (process.argv.includes("--open")) {
    const opener = spawn("explorer.exe", [base], {
      windowsHide: true,
      stdio: "ignore",
    });
    opener.on("error", () => console.log(base));
    opener.unref();
  }
});
const stop = () => {
  room?.kill();
  server.close();
  Promise.resolve(vite?.close()).then(() => process.exit());
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

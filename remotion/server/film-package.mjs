import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { root, data } from "./store.mjs";
import { subtitleLines, displayCaptions } from '../shared/overlays.mjs';
const exec = promisify(execFile);
const json = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const csv = (s) => '"' + String(s ?? "").replaceAll('"', '""') + '"';
function time(frame, fps) {
  const ms = Math.round((frame * 1000) / fps);
  return (
    [
      Math.floor(ms / 3600000),
      Math.floor(ms / 60000) % 60,
      Math.floor(ms / 1000) % 60,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":") +
    "," +
    String(ms % 1000).padStart(3, "0")
  );
}
export function srt(film) {
  return (
    displayCaptions(film.captions)
      .map((c, i) => {
        const lines = subtitleLines(c, film.language, film.variant, film.captionMode);
        return [
          i + 1,
          time(c.from, film.canvas.fps) +
            " --> " +
            time(c.until, film.canvas.fps),
          ...lines,
        ].join("\n");
      })
      .join("\n\n") + "\n"
  );
}
export function archivedRoughSubtitles(folder,render,project) {
  if(render?.scope!=='rough'||render.status!=='done')return null;
  const snapshot=path.join(folder,'render-input.json');
  if(fs.existsSync(snapshot))return srt(JSON.parse(fs.readFileSync(snapshot,'utf8')));
  const evidence=render.evidence;
  if(!project||project.version!==render.version||!Number.isFinite(evidence?.fps)||!Array.isArray(evidence.captions))return null;
  return srt({canvas:{fps:evidence.fps},captions:evidence.captions,language:project.language,variant:render.variant,captionMode:project.captionMode});
}
export async function packageFilm(p, film, folder) {
  const dir = path.join(folder, "project");
  fs.mkdirSync(path.join(dir, "public", "media"), { recursive: true });
  const rows = film.rows,
    variant = film.variant;
  const used = new Set(rows.flatMap((r) => r.scene.assets.map(a=>a.id)));
  for (const r of rows) if(r.scene.music) used.add(r.scene.music.id);
  const claims = p.claims.filter((c) =>
    rows.some((r) => r.scene.shot.claimIds.includes(c.id)),
  );
  const docs = new Set(
    claims
      .flatMap((c) => [c.url, c.original])
      .filter((x) => x?.startsWith("/media/")),
  );
  const all = p.assets.filter((a) => used.has(a.id) || docs.has(a.src));
  const assets = all.map((a) => {
    const file = path.basename(a.src);
    fs.copyFileSync(
      path.join(data, "uploads", file),
      path.join(dir, "public", "media", file),
    );
    if(a.poster){const poster=path.basename(a.poster);fs.copyFileSync(path.join(data,'uploads',poster),path.join(dir,'public','media',poster));return {...a,src:'media/'+file,poster:'media/'+poster};}
    return { ...a, src: "media/" + file };
  });
  const portableClaims = claims.map((c) => ({
    ...c,
    url: c.url?.replace(/^\/media\//, "media/"),
    original: c.original?.replace(/^\/media\//, "media/"),
  }));
  const project = {
    ...p,
    exportVariant: variant,
    assets,
    claims: portableClaims,
  };
  json(path.join(dir, "project.json"), project);
  for (const name of ["video", "shared"])
    fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
  fs.cpSync(path.join(root,'vendor/onda'),path.join(dir,'vendor/onda'),{recursive:true});
  for (const name of ["timeline", "shotcraft"]) {
    fs.mkdirSync(path.join(dir, "vendor", name), { recursive: true });
    for (const file of [
      name === "timeline" ? "core.mjs" : "PageCam.tsx",
      "LICENSE",
    ])
      fs.copyFileSync(
        path.join(root, "vendor", name, file),
        path.join(dir, "vendor", name, file),
      );
  }
  for (const file of ["entry.jsx", "preview.jsx", "render.mjs"])
    fs.copyFileSync(path.join(root, "portable", file), path.join(dir, file));
  fs.copyFileSync(
    path.join(root, "server/master-audio.mjs"),
    path.join(dir, "master-audio.mjs"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, "package-lock.json")),
  );
  const deps = Object.fromEntries(
    Object.entries(lock.packages[""].dependencies).filter(
      ([name]) => !["sherpa-onnx-node","onnxruntime-node","pinyin-pro"].includes(name),
    ),
  );
  const pkg = {
    name: "frameboard-film",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: { preview: "vite --host 127.0.0.1", render: "node render.mjs" },
    dependencies: deps,
  };
  lock.name = pkg.name;
  lock.version = pkg.version;
  lock.packages[""] = {
    name: pkg.name,
    version: pkg.version,
    dependencies: deps,
  };
  json(path.join(dir, "package-lock.json"), lock);
  json(path.join(dir, "package.json"), pkg);
  fs.writeFileSync(
    path.join(dir, "index.html"),
    '<!doctype html><html lang="zh"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#101e2a;margin:0"><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>',
  );
  fs.writeFileSync(
    path.join(dir, "README.md"),
    "# " +
      p.title +
      "\n\nNode.js 24，桌面 Chrome 或 Edge。进入此目录执行 npm ci，再用 npm run preview 预览，或 npm run render 输出 film.mp4。自定义浏览器路径可设置 FRAMEBOARD_CHROME。\n\n在 project.json 修改 shots 的中英文字幕、标题、labels 图形标注、构图和秒数，或在 video 修改对应图形。声音文件是本版本的实录或合成音轨，修改台词时需同时替换配音与语句入点。图形中文字体优先 Microsoft YaHei，可安装合法字体或使用系统无衬线字体。public/media 内含本次素材。依赖、许可及来源随工程提供。\n",
  );
  fs.writeFileSync(path.join(folder, "subtitles.srt"), srt(film));
  const columns = [
    "镜头编号",
    "顺序",
    "目的",
    "起帧",
    "出点帧（不含）",
    "画面与动作",
    "中文",
    "English",
    "素材",
    "结论",
  ];
  const records = rows.map((r, i) => {
    const s = r.scene.shot;
    return [
      r.id,
      i + 1,
      s.purpose,
      r.from,
      r.from + r.frames,
      s.visual,
      s.zh,
      s.en,
      s.assetIds.join("|"),
      s.claimIds.join("|"),
    ];
  });
  fs.writeFileSync(
    path.join(folder, "storyboard.csv"),
    "\uFEFF" +
      [columns, ...records].map((row) => row.map(csv).join(",")).join("\r\n"),
  );
  const manifest = {
    project: p.id,
    version: p.version,
    language: p.language,
    variant,
    assets: assets.map((a) => ({
      ...a,
      category:
        a.kind === "audio"
          ? a.voiceLabel
            ? "本地合成旁白"
            : a.scoreFrames
              ? "本地生成配乐"
              : "已授权音频"
          : a.kind === "document"
            ? "资料"
            : a.originType === "generated"
              ? "AI 生成素材"
              : "真实素材或自有作品",
      shots: rows
        .filter(
          (r) =>
            r.scene.assets.some(x=>x.id===a.id) ||
            r.scene.music?.id===a.id ||
            claims.some(
              (c) =>
                r.scene.shot.claimIds.includes(c.id) &&
                [c.url, c.original].includes("/" + a.src),
            ),
        )
        .map((r) => r.id),
    })),
    claims: portableClaims.map((c) => ({
      ...c,
      shots: rows
        .filter((r) => r.scene.shot.claimIds.includes(c.id))
        .map((r) => ({
          id: r.id,
          zh: r.scene.shot.zh,
          en: r.scene.shot.en,
          graphic: r.scene.shot.visual,
        })),
    })),
  };
  json(path.join(folder, "sources.json"), manifest);
  for (const file of ["sources.json", "storyboard.csv", "subtitles.srt"])
    fs.copyFileSync(path.join(folder, file), path.join(dir, file));
  const archive = path.join(folder, "editable-project.zip");
  if (process.platform === "win32")
    await exec("tar.exe", ["-a", "-cf", archive, "-C", dir, "."], {
      windowsHide: true,
    });
  else await exec("zip", ["-qr", archive, "."], { cwd: dir });
}

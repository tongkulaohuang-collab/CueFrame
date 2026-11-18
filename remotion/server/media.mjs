import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { data, db } from "./store.mjs";
const require = createRequire(import.meta.url);
export function browserPath() {
  return [
    process.env.FRAMEBOARD_CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find(p=>p&&fs.existsSync(p));
}
export function mediaTool(name) {
  const pkg =
    process.platform === "win32" ? "@remotion/compositor-win32-x64-msvc" : null;
  return pkg
    ? path.join(path.dirname(require.resolve(pkg)), name + ".exe")
    : name;
}
export function probe(file) {
  const r = spawnSync(
    mediaTool("ffprobe"),
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  if (r.status !== 0) throw Error("无法识别该媒体文件");
  return JSON.parse(r.stdout);
}
export const mime = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};
export function upload(name, bytes, generated = {}) {
  const ext = path.extname(name).toLowerCase();
  if (!mime[ext] || ext === ".json")
    throw Error("支持图片、MP4/WebM、音频、PDF 或文本");
  const id = randomUUID(),
    file = path.join(data, "uploads", id + ext),
    kind = mime[ext].split("/")[0];
  fs.writeFileSync(file, bytes);
  try {
    let info = {};
    if (["image", "video", "audio"].includes(kind)) {
      const m = probe(file),
        stream = m.streams.find(
          (s) => s.codec_type === (kind === "image" ? "video" : kind),
        );
      if (!stream) throw Error("扩展名与媒体内容不一致");
      info = {
        width: stream.width || 0,
        height: stream.height || 0,
        duration: Number(m.format.duration) || 0,
      };
      if (kind === "audio" && (!info.duration || info.duration > 3600))
        throw Error("音频须有可测的时长且不超过一小时");
    }
    const asset = {
      ...generated,
      id,
      name: path.basename(name),
      src: "/media/" + id + ext,
      kind: ["application", "text"].includes(kind) ? "document" : kind,
      ...info,
    };
    db.prepare("INSERT INTO uploads VALUES (?,?)").run(
      id,
      JSON.stringify(asset),
    );
    return {
      ...asset,
      role: kind === "audio" ? "zh" : "reference",
      confirmed: false,
      source: "",
      license: "",
      credit: "",
      checks: [],
    };
  } catch (e) {
    fs.unlinkSync(file);
    throw e;
  }
}
export function sendFile(req, res, file, contentType) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end();
  }
  const size = fs.statSync(file).size,
    range = req.headers.range;
  const headers = {
    "Content-Type":
      contentType ||
      mime[path.extname(file).toLowerCase()] ||
      "application/octet-stream",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start =
        m && m[1] ? Number(m[1]) : Math.max(0, size - Number(m?.[2] || 0)),
      end = m && m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (!m || start > end || start >= size) {
      res.writeHead(416, { "Content-Range": "bytes */" + size });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
    });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

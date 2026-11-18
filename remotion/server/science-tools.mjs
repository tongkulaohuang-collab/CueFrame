import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { root, data } from "./store.mjs";
import { upload, mediaTool } from "./media.mjs";

export const toolRoot = path.resolve(root, "../视频制作/工具/science-mcp");
const python = path.join(toolRoot, ".venv/Scripts/python.exe");
const outputRoot = path.join(toolRoot, "outputs");
const jobRoot = path.join(data, "science-jobs");
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(jobRoot, { recursive: true });
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const checksFile = path.join(jobRoot, "checks.json");
const checks = readJson(checksFile, {});

export function bridge(input, timeout = 40000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(python)) return reject(Error("Python 运行环境尚未安装，请运行工具目录的「继续安装.cmd」"));
    const child = spawn(python, [path.join(toolRoot, "bridge.py")], {
      cwd: toolRoot, windowsHide: true, env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", DISABLE_TELEMETRY: "true" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", error = "", expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeout);
    child.stdout.on("data", b => { out = (out + b).slice(-200000); });
    child.stderr.on("data", b => { error = (error + b).slice(-2000); });
    child.stdin.on("error", () => {});
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", () => {
      clearTimeout(timer);
      if (expired) return reject(Error("连接检查超时，请检查工具进程后重试"));
      try {
        const result = JSON.parse(out);
        if (!result.ok) throw Error(result.error);
        resolve(result.result);
      } catch (e) { reject(Error(e.message + (out ? "" : ": " + error))); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function blenderPath() {
  const runtime = path.join(toolRoot, "runtime");
  if (!fs.existsSync(runtime)) return null;
  return fs.readdirSync(runtime).filter(n => n.startsWith("blender-")).map(n => path.join(runtime, n, "blender.exe")).find(p => fs.existsSync(p)) || null;
}

export function availableOutputs(base = outputRoot) {
  if (!fs.existsSync(base)) return [];
  const rootReal = fs.realpathSync(base), found = [];
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name === "partial_movie_files") continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(mp4|webm|png)$/i.test(entry.name)) {
        const stat = fs.statSync(file);
        found.push({ id: path.relative(rootReal, file).split(path.sep).join("/"), name: entry.name, bytes: stat.size, updated: stat.mtime.toISOString() });
      }
    }
  };
  walk(rootReal);
  return found.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 80);
}

export function resolveOutput(id, base = outputRoot) {
  if (typeof id !== "string" || !/\.(mp4|webm|png)$/i.test(id) || id.includes("partial_movie_files")) throw Error("无效的结果文件");
  const realRoot = fs.realpathSync(base), file = fs.realpathSync(path.resolve(base, id));
  const relative = path.relative(realRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw Error("只能导入科普工具输出目录内的媒体");
  if (fs.statSync(file).size > 64 * 1024 * 1024) throw Error("素材超过 64 MB，请先导出较小的预览版本");
  return file;
}

export function importOutput(id) {
  const file = resolveOutput(id);
  const generated = { source: "本地科普动画：" + id, license: "本地生成；外部模型、字体与素材需逐项核对", scienceEngine: id.split("/")[0] };
  return { ...upload(path.basename(file), fs.readFileSync(file), generated), ...generated };
}

export async function scienceStatus() {
  const env = await bridge({ action: "environment" }, 15000).catch(e => ({ modules: {}, error: e.message }));
  const registration = readJson(path.join(toolRoot, "registration.json"), {});
  return {
    root: toolRoot, installCommand: path.join(toolRoot, "继续安装.cmd"),
    registered: !!registration.configured, modules: env.modules, environmentError: env.error,
    blenderInstalled: !!blenderPath(), checks,
    texInstalled: fs.existsSync(path.join(toolRoot, "tex-runtime.json")),
    voiceInstalled: fs.existsSync(path.join(data, "models/kokoro-int8-multi-lang-v1_1")),
    ffmpegInstalled: fs.existsSync(mediaTool("ffmpeg")), outputs: availableOutputs(), jobs: scienceJobs(),
  };
}

export async function checkEngine(engine) {
  if (!["manim", "blender"].includes(engine)) throw Error("未知科普工具");
  try {
    const result = await bridge({ action: "check", engine });
    checks[engine] = { ok: true, checkedAt: new Date().toISOString(), tools: result.tools, message: result.message || "MCP 握手通过" };
  } catch (error) {
    checks[engine] = { ok: false, checkedAt: new Date().toISOString(), message: error.message };
  }
  fs.writeFileSync(checksFile, JSON.stringify(checks, null, 2));
  return checks[engine];
}

export async function openBlender() {
  const exe = blenderPath();
  if (!exe) throw Error("Blender 程序尚未安装，请先运行「继续安装.cmd」");
  const inUse = await new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port: 9876 });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
  if (inUse) return { message: "已有程序监听 Blender 连接端口，请先检查连接或切换到已打开的 Blender 窗口" };
  const profile = path.join(toolRoot, "runtime/blender-profile/config");
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(exe, ["--python", path.join(toolRoot, "blender_startup.py")], { cwd: toolRoot, detached: true, windowsHide: false, stdio: "ignore", env: { ...process.env, DISABLE_TELEMETRY: "true", BLENDER_USER_CONFIG: profile } });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  return { message: "已启动 Blender；等窗口加载后点击检查连接" };
}

const writeJob = job => fs.writeFileSync(path.join(jobRoot, job.id + ".json"), JSON.stringify(job, null, 2));
export function scienceJobs() {
  return fs.readdirSync(jobRoot).filter(n => /^[a-f0-9-]+\.json$/.test(n)).map(n => {
    const job = readJson(path.join(jobRoot, n), null);
    if (job?.status === "running") {
      try { process.kill(job.owner, 0); } catch { job.status = "interrupted"; job.error = "上次工作台已退出，请检查已有结果后重新运行"; }
    }
    return job;
  }).filter(Boolean).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 20);
}
export async function startDemo() {
  const environment = await bridge({ action: "environment" });
  if (!environment.modules.manim || !environment.modules.mcp) throw Error("Manim 依赖尚未安装，暂时不能渲染");
  if (scienceJobs().some(j => j.status === "running")) throw Error("已有本地样片正在渲染");
  const job = { id: randomUUID(), title: "圆周运动与简谐运动 · 6.5 秒", status: "running", created: new Date().toISOString(), owner: process.pid };
  writeJob(job);
  bridge({ action: "demo" }, 670000).then(result => { job.status = "done"; job.result = result; }).catch(error => { job.status = "failed"; job.error = error.message; }).finally(() => { job.finished = new Date().toISOString(); writeJob(job); });
  return job;
}

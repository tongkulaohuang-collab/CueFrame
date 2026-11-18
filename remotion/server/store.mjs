import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { update } from "../shared/model.mjs";
import {storageRuntime} from './runtime.mjs';
import {repairPlan} from '../shared/content-contract.mjs';
export const root = fileURLToPath(new URL("../", import.meta.url));
export const runtime = storageRuntime(root);
export const data = runtime.data;
for (const dir of ["uploads", "jobs", "exports", "reviews"])
  fs.mkdirSync(path.join(data, dir), { recursive: true });
export const db = new DatabaseSync(path.join(data, "workbench.sqlite"));
// The two local entry points share this database; allow short schema/write locks.
db.exec('PRAGMA busy_timeout=5000');
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS versions(id TEXT, v INTEGER, body TEXT, PRIMARY KEY(id,v)); CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, body TEXT); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project TEXT, body TEXT);",
);
export function list() {
  return db
    .prepare(
      "SELECT body FROM versions v WHERE v.v=(SELECT max(v2.v) FROM versions v2 WHERE v2.id=v.id) ORDER BY rowid DESC",
    )
    .all()
    .map((r) => JSON.parse(r.body));
}
export function get(id, ver) {
  const row = ver
    ? db
        .prepare("SELECT body FROM versions WHERE id=? AND v=?")
        .get(id, Number(ver))
    : db
        .prepare("SELECT body FROM versions WHERE id=? ORDER BY v DESC LIMIT 1")
        .get(id);
  return row ? JSON.parse(row.body) : null;
}
export function conflict(message) {
  return Object.assign(Error(message), { status: 409 });
}
export function write(p, expected) {
  const previous=get(p.id),v = previous?.version || 0;
  if (expected !== v) throw conflict("草稿已有新版本，请重新打开后再修改");
  const next = { ...p, version: v + 1, updated: new Date().toISOString(),ruleVersion:4,
    changeImpact:previous?repairPlan(previous,p):[] };
  db.prepare("INSERT INTO versions VALUES (?,?,?)").run(
    p.id,
    next.version,
    JSON.stringify(next),
  );
  return next;
}
export function save(input) {
  if (!/^[\w-]{1,90}$/.test(input.id) || !Array.isArray(input.assets))
    throw Error("工程编号或素材列表无效");
  const prev = get(input.id);
  for (const a of input.assets) {
    const row = db.prepare("SELECT body FROM uploads WHERE id=?").get(a.id);
    if (!row) throw Error("素材尚未上传");
    // Measured timing comes from our audio worker. Imported recordings use manualTiming instead.
    for (const field of [
      "segments",
      "scriptText",
      "voiceLang",
      "voiceLabel",
      "doubaoRequestId",
      "speakerId",
      "voiceMusic",
      "scoreFrames",
      "keynataId","keynataHash","keynataRevision",
      "generation","imageSource",
    ])
      delete a[field];
    Object.assign(a, JSON.parse(row.body));
    if (a.voiceLang && a.role !== a.voiceLang)
      throw Error("本机配音的语种应与原始台词一致");
  }
  return write(update(prev, input), input.version);
}
export function persistJob(j) {
  db.prepare("INSERT OR REPLACE INTO jobs VALUES (?,?,?)").run(
    j.id,
    j.project,
    JSON.stringify(j),
  );
  return j;
}
export function job(id) {
  const r = db.prepare("SELECT body FROM jobs WHERE id=?").get(id);
  if (!r) throw Error("任务不存在");
  return JSON.parse(r.body);
}
export function jobs(id) {
  return db
    .prepare("SELECT body FROM jobs WHERE project=? ORDER BY rowid DESC")
    .all(id)
    .map((i) => JSON.parse(i.body));
}
function ownerAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}
export function recover(recoverRhythmJob, recoverMotionJob) {
  for (const r of db.prepare("SELECT body FROM jobs").all()) {
    const j = JSON.parse(r.body);
    if (['running','queued'].includes(j.status) && ownerAlive(j.owner)) continue;
    if (recoverMotionJob && j.type==='codex' && j.task==='motion' && ['unknown','running'].includes(j.status)) {
      if (ownerAlive(j.workerPid) || recoverMotionJob(j)) continue;
    }
    if (recoverRhythmJob && j.type === 'codex' && j.task === 'rhythm' && ['unknown','running'].includes(j.status)) {
      try {
        recoverRhythmJob(j);
      } catch (error) {
        persistJob({...j, status:'failed', error:'恢复原节奏脚本失败：' + error.message});
      }
      continue;
    }
    if (["running", "queued"].includes(j.status))
      persistJob({
        ...j,
        status: j.type === "codex" ? "unknown" : "failed",
        error: "上次进程中断。已保留版本与任务记录。",
      });
  }
}

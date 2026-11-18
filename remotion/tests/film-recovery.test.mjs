import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  draft,
  emptyShot,
  quality,
  locks,
  shotIssues,
} from "../shared/model.mjs";
process.env.FRAMEBOARD_DATA = fs.mkdtempSync(
  path.join(os.tmpdir(), "frameboard-recovery-test-"),
);
const { persistJob, job, recover, write, get, jobs } =
  await import("../server/store.mjs");
const { render } = await import("../server/render.mjs");
function seeded() {
  const p = { ...draft("product"), topic: "实拍测试", flow: "direct" };
  const a = {
    id: "real",
    src: "/media/real.png",
    name: "真实样本",
    kind: "image",
    role: "product",
    source: "自有截屏",
    license: "项目使用",
    checks: locks,
    confirmed: true,
  };
  const s = {
    ...emptyShot(),
    title: "核对",
    purpose: "展示状态",
    zh: "核对。",
    en: "Review.",
    visual: "显示真实素材",
    reviewed: true,
    silentOK: true,
    filmQA: [...quality],
    assetIds: [a.id],
  };
  p.assets = [a];
  p.shots = [s];
  return p;
}
test("缺失素材文件在创建整片渲染任务前精确拦截", () => {
  const p = seeded();
  assert.throws(
    () => render(p, null, "zh", "http://localhost", "film"),
    /素材文件缺失.*真实样本/,
  );
  assert.equal(jobs(p.id).length, 0);
});
test("已提交任务冻结原版本，中断本地任务可重试，收费提交状态不明先核对", () => {
  const p = write(seeded(), 0);
  const j = {
    id: "render-one",
    type: "render",
    scope: "film",
    project: p.id,
    version: p.version,
    status: "running",
    step: "独立工程与交付包",
  };
  persistJob(j);
  persistJob({ ...j, id: "paid", type: "codex" });
  persistJob({ ...j, id: "live", owner: process.ppid });
  write({ ...p, title: "新版本" }, p.version);
  recover();
  assert.equal(job(j.id).status, "failed");
  assert.equal(job(j.id).step, j.step);
  assert.equal(get(j.project, job(j.id).version).version, 1);
  assert.equal(get(j.project).version, 2);
  assert.equal(job("paid").status, "unknown");
  assert.equal(job("live").status, "running");
});
test("生成的产品素材须与其真实参考同镜关联", () => {
  const p = seeded(),
    s = p.shots[0],
    real = p.assets[0];
  const generated = {
    ...real,
    id: "ai",
    originType: "generated",
    referenceId: real.id,
  };
  p.assets.push(generated);
  s.assetIds = [generated.id];
  assert.match(shotIssues(p, s).join(" "), /真实参考/);
  s.assetIds.push(real.id);
  assert.deepEqual(shotIssues(p, s), []);
  generated.referenceId = "elsewhere";
  assert.match(shotIssues(p, s).join(" "), /真实参考/);
});

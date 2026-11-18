import assert from "node:assert/strict";
import {continuity,processVideo} from './fixtures/continuous.mjs';
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { videoWorkflowPolicy } from '../shared/workflow-policy.mjs';
import { sceneProps } from '../shared/scene-props.mjs';
import {
  draft,
  emptyClaim,
  emptyShot,
  update,
  review,
  renderIssues,
  timeline,
  resizeShots,
} from "../shared/model.mjs";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frameboard-test-"));
process.env.FRAMEBOARD_DATA = tmp;
const store = await import("../server/store.mjs");
const broker = await import("../server/codex.mjs");
const seeded = (kind) => ({
  ...draft(kind),
  topic: "验收草稿",
  flow: "direct",
});
const textShot = () => ({
  ...emptyShot(),
  title: "测试镜头",
  purpose: "检验画面",
  zh: "可能",
  en: "May",
  visual: "箭头从左向右",
});
const evidence = () => ({
  ...emptyClaim(),
  text: "示意结论",
  title: "高校资料",
  url: "https://example.edu/research",
  locator: "第 2 段",
});
test("单输入可存，旧写入被拒，原版本可重开", () => {
  const p = store.save(seeded("science"));
  assert.equal(store.get(p.id).topic, p.topic);
  const newer = store.save({ ...p, title: "v2" });
  assert.throws(() => store.save(p), /新版本/);
  assert.equal(store.get(p.id, 1).title, "");
  assert.equal(newer.version, 2);
});

test("未定时长可保存重开，取得及替换口播后按实际音频计算且不报超时", () => {
  for (const kind of ["science", "product"]) {
    let p = store.save({...draft(kind), topic:"音频定时测试"});
    assert.equal(store.get(p.id).target, null);
    assert.equal(timeline(p).narrationReady, false);
    p = store.save({...p, target:0});
    assert.equal(p.target, null);
    p.shots = [{...textShot(), seconds:2, assetIds:["zh", "en"]}];
    assert.equal(timeline(p).narrationReady, false);
    p.assets = [{id:"zh", kind:"audio", role:"zh", duration:7.25}];
    let t = timeline(p);
    assert.equal(t.narrationReady, true);
    assert.equal(t.frames, 174);
    assert.equal(t.extra, 0);
    assert.equal(t.blocked, false);
    assert.equal(t.rows[0].padding, 0);
    p.language = "sequential";
    assert.equal(timeline(p).narrationReady, false);
    p.assets.push({id:"en", kind:"audio", role:"en", duration:5});
    t = timeline(p);
    assert.equal(t.narrationReady, true);
    assert.equal(t.frames, 294);
    assert.equal(t.rows[0].voices[1].from, 174);
    p.assets[0].duration = 8;
    assert.equal(timeline(p).frames, 312);
    p.language = "separate";
    assert.equal(timeline(p, "en").frames, 120);
    p.assets = [];
    assert.equal(timeline(p).narrationReady, false);
  }
});
test("实体或软件只有文字不能生成；分镜阶段暂停先于样镜，直接模式也核验素材", () => {
  for (const k of ["software", "physical"]) {
    const p = seeded("product");
    p.productType = k;
    p.shots = [textShot()];
    p.flow = "review";
    assert.match(renderIssues(p, p.shots[0].id).join(" "), /真实产品/);
    assert.match(renderIssues(p, p.shots[0].id).join(" "), /分镜/);
    p.flow = "direct";
    assert.match(renderIssues(p, p.shots[0].id).join(" "), /真实产品/);
  }
});
test("科普证据、译文或图形变化只重新审核关联项，删掉最后出处继续拦住制作", () => {
  let p = seeded("science");
  p.assets=[processVideo];
  p.claims = [evidence(), evidence()];
  p.shots = p.claims.map((c) => ({ ...textShot(), continuity:{...continuity},processVideoId:processVideo.id,assetIds:[processVideo.id],claimIds: [c.id] }));
  p = update(null, p);
  for (const c of p.claims) review(p, "claim", c.id);
  for (const s of p.shots) review(p, "shot", s.id);
  assert.deepEqual(renderIssues(p, p.shots[0].id), []);
  for (const patch of [{ en: "Always" }, { visual: "箭头反向" }]) {
    const changed = structuredClone(p);
    Object.assign(changed.shots[0], patch);
    const next = update(p, changed);
    assert.equal(next.claims[0].verified, false);
    assert.equal(next.shots[0].reviewed, false);
    assert.equal(next.shots[1].reviewed, true);
    assert.equal(next.claims[1].verified, true);
  }
  const n = structuredClone(p);
  n.claims.shift();
  assert.match(renderIssues(update(p, n), p.shots[0].id).join(" "), /出处/);
  const m = structuredClone(p);
  m.claims[0].locator = "第 3 页";
  assert.equal(update(p, m).shots[0].reviewed, false);
});
test("30 秒目标＋22/24 秒旁白按语言编排；分阶段可保留或缩稿；双语同屏不冲突", () => {
  const p = seeded("science"),
    s = textShot();
  p.target = 30;
  p.language = "sequential";
  p.fps = 24;
  s.seconds = 30;
  p.shots = [s];
  p.assets = ["zh", "en"].map((role, i) => ({
    id: role,
    kind: "audio",
    role,
    duration: i ? 24 : 22,
  }));
  s.assetIds = ["zh", "en"];
  let t = timeline(p);
  assert.equal(t.frames, 46 * 24);
  assert.equal(t.extra, 16);
  assert.equal(t.rows[0].voices[1].from, 22 * 24);
  assert.equal(t.rows[0].cues[1].from, 22 * 24);
  assert.equal(t.blocked, false);
  p.flow = "review";
  assert.equal(timeline(p).blocked, true);
  p.overflow = "extend";
  assert.equal(timeline(p).blocked, false);
  p.language = "separate";
  assert.equal(timeline(p, "en").rows[0].voices[0].frames, 24 * 24);
  p.language = "bilingual";
  t = timeline(p, "zh");
  assert.equal(t.rows[0].cues.length, 1);
  assert.equal(t.rows[0].cues[0].en, s.en);
});
test("逐镜调时可撤销，既有镜头编号不变", () => {
  const p = seeded("science");
  p.shots = [textShot(), textShot()];
  const r = resizeShots(p, p.shots[0].id, 4);
  assert.equal(r.shots[0].seconds, 4);
  assert.equal(r.shots[1].id, p.shots[1].id);
  assert.equal(r.undo[0].seconds, 6);
});
test("任一类输入可建立草稿，空白不可保存", () => {
  for (const input of [
    { topic: "主题" },
    { script: "已有稿" },
    { references: "https://example.edu" },
    { assets: [{ id: "a" }] },
  ])
    assert.doesNotThrow(() => update(null, { ...draft(), ...input }));
  assert.throws(() => update(null, { ...draft(), topic: "  " }), /至少一项/);
});
test("双语字幕按句共用出入点，依次播报在第二段实测起点切换英文", () => {
  const p = seeded("science");
  const s = {
    ...textShot(),
    zh: "先看日光。再看月球。",
    en: "Look at the light. Look at the Moon.",
    assetIds: ["zh", "en"],
  };
  p.shots = [s];
  p.assets = ["zh", "en"].map((role) => ({
    id: role,
    role,
    kind: "audio",
    duration: 2,
  }));
  let t = timeline(p);
  assert.equal(t.rows[0].captionCues.length, 2);
  assert.ok(t.rows[0].captionCues[1].from > 0);
  assert.equal(t.rows[0].captionCues[0].en, "Look at the light.");
  p.language = "sequential";
  t = timeline(p);
  assert.equal(t.rows[0].captionCues.find((c) => c.lang === "en").from, 48);
});
const until = async (id) => {
  for (let n = 0; n < 100; n++) {
    const j = store.job(id);
    if (j.status !== "running") return j;
    await new Promise((r) => setTimeout(r, 4));
  }
  throw Error("任务超时");
};
test('仅输入主题，生成与改单镜仍自动带上全部默认导演规则', () => {
  for (const kind of ['science', 'product']) {
    const p = { ...draft(kind), topic: '月球', script: '' };
    for (const shotId of [null, 'existing-shot']) {
      const input = broker.prompt(p, { id: 'policy-test', shotId });
      assert.match(input, /所有视频任务默认执行，无需在提示词里重复/);
      assert.match(input, /允许标题页、知识卡片、总结页、局部漂动、转场和整体缩放/);
      assert.doesNotMatch(input, /禁止“开场页|不做大标题|不能只做静帧缩放/);
      for (const rule of videoWorkflowPolicy.rules) assert.ok(input.includes(rule));
      assert.equal(p.script, '');
    }
  }
});

test('不含限制提示的科普生成，返回旧式无连续设计分镜仍被拒绝', async () => {
  const p = store.save({ ...draft('science'), topic: '月球', flow: 'direct' });
  const request = broker.prepare(p);
  broker.approve(request.id, () => ({ shots: [textShot()] }));
  const result = await until(request.id);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /连续镜头设计/);
  assert.equal(store.get(p.id).shots.length, 0);
});

test('仅给主题时默认小字幕，AI 节点注释可进入实际画面，非法时段被拒绝', async () => {
  const p = store.save({ ...draft('science'), topic: '水流', script: '' });
  const annotations = [{ text: '通过', from: 1, until: 3, x: .45, y: .4 }];
  const shot = { ...textShot(), continuity, annotations };
  const request = broker.prepare(p);
  broker.approve(request.id, input => {
    assert.match(input, /默认.*小号同步字幕/);
    assert.match(input, /写入 annotations/);
    return { shots: [shot] };
  });
  assert.equal((await until(request.id)).status, 'ready');
  const adopted = broker.applyJob(request.id);
  const scene = sceneProps(adopted, adopted.shots[0].id);
  assert.equal(scene.burnCaptions, true);
  assert.equal(scene.captionMode, 'voice');
  assert.deepEqual(scene.shot.annotations, annotations);
  assert.equal(adopted.shots[0].reviewed, false);
  assert.throws(() => broker.validateResult({ shots: [{ ...shot, annotations: [{ ...annotations[0], until: 100 }] }] }, p, {}), /起止时间/);
});

test("逐次确认、成功、旧回执、失败、未知提交与重新授权", async () => {
  let p = store.save(seeded("product")),
    calls = 0,
    release;
  const answer = { shots: [textShot()] };
  const run = () => {
    calls++;
    return new Promise((r) => {
      release = r;
    });
  };
  const j = broker.prepare(p);
  assert.equal(j.status, "awaiting");
  assert.equal(calls, 0);
  assert.equal(broker.prepare(p).id, j.id);
  broker.approve(j.id, run);
  assert.throws(() => broker.approve(j.id, run), /再次/);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  p = store.save({ ...p, title: "newer" });
  release(answer);
  assert.equal((await until(j.id)).status, "ready");
  assert.throws(() => broker.applyJob(j.id), /旧版本/);
  let k = broker.prepare(p);
  broker.approve(k.id, () => {
    calls++;
    throw Error("模拟已知失败");
  });
  assert.equal((await until(k.id)).status, "failed");
  k = broker.prepare(p);
  assert.equal(k.status, "awaiting");
  broker.approve(k.id, () => {
    calls++;
    throw Object.assign(Error("结果不明"), { uncertain: true });
  });
  assert.equal((await until(k.id)).status, "unknown");
  assert.throws(() => broker.prepare(p), /核对/);
  broker.reconcile(k.id, "测试供应方记录号 001，本次未完成");
  const retry = broker.prepare(p);
  assert.equal(retry.status, "awaiting");
  assert.equal(calls, 3);
  broker.approve(retry.id, () => answer);
  await until(retry.id);
  const next = broker.applyJob(retry.id);
  assert.equal(next.shots.length, 1);
  assert.equal(store.job(retry.id).status, "applied");
  assert.equal(next.shots[0].reviewed, false);
});

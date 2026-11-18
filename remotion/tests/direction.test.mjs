import test from "node:test";
import {continuity,processVideo} from './fixtures/continuous.mjs';
import assert from "node:assert/strict";
import {
  draft,
  emptyShot,
  emptyClaim,
  update,
  review,
  renderIssues,
  timeline,
} from "../shared/model.mjs";
import { castingChoice, proofFrames, linesFor } from "../shared/direction.mjs";
import { sceneProps } from "../shared/scene-props.mjs";
const shot = () => ({
  ...emptyShot(),
  continuity:{...continuity},processVideoId:processVideo.id,
  seconds: 5,
  title: "同一轮月亮",
  purpose: "解释常规月相",
  visual: "按顺序揭示光照与观察位置",
  zh: "先看日光。再看月球。看见结果。",
  en: "Look at the light. Follow the Moon. See the result.",
  beats: ["观察", "运动", "结果"],
  graphic: "月相示意",
});
const voice = (s, id, role, duration, starts) => ({
  id,
  kind: "audio",
  role,
  duration,
  scriptText: s[role],
  segments: linesFor(s)[role].map((text, i) => ({
    text,
    from: starts[i],
    until: starts[i + 1] ?? duration,
  })),
  source: "试录",
  license: "自制",
  confirmed: true,
});
function project() {
  const p = {
      ...draft("science"),
      topic: "月相",
      fps: 24,
      target: 5,
      pauses: ["样镜"],
    },
    s = shot(),
    c = {
      ...emptyClaim(),
      title: "机构资料",
      text: "光照示意",
      url: "https://example.edu/moon",
      locator: "第 2 段",
    };
  p.claims = [c];
  s.claimIds = [c.id];
  p.shots = [s];
  p.assets = [voice(s, "nzh", "zh", 5, [0, 2, 3.5]),processVideo];
  s.assetIds = [processVideo.id,"nzh"];
  return update(null, p);
}
function reviewed() {
  const p = project();
  review(p, "claim", p.claims[0].id);
  review(p, "shot", p.shots[0].id);
  return p;
}
test("添加句数不同的译文保留录音句界和停顿",()=>{
  const p=reviewed(),s=p.shots[0];
  p.captionMode='voice';
  s.zh='去程用两小时。回程用一小时。';
  s.en='';
  p.assets.find(a=>a.id==='nzh').segments=[
    {text:'去程用两小时。',from:0,until:1.5},
    {text:'回程用一小时。',from:2,until:3.5},
  ];
  const cues=()=>timeline(p).rows[0].captionCues.map(c=>[c.from,c.until,c.timing,c.zh]);
  const original=cues();
  assert.deepEqual(original,[[0,36,'实测','去程用两小时。'],[48,84,'实测','回程用一小时。']]);
  s.en='The outward and return journeys take two hours and one hour respectively.';
  assert.deepEqual(cues(),original);
});
test("新项目使用 1080p，已有无风格字段的草稿仍走经典画面、自定义画布有效", () => {
  const p = project();
  assert.deepEqual([p.width, p.height], [1920, 1080]);
  delete p.look;
  p.width = 640;
  p.height = 800;
  const s = sceneProps(p, p.shots[0].id);
  assert.equal(s.look, "classic");
  assert.equal(s.canvas.width, 640);
});
test("画面节拍和双语字幕使用实际音频样本边界，开场及结果校样均位于相应拍内", () => {
  const p = reviewed(),
    s = p.shots[0],
    props = sceneProps(p, s.id);
  assert.deepEqual(
    props.captionCues.map((c) => [c.from, c.timing]),
    [
      [0, "实测"],
      [48, "实测"],
      [84, "实测"],
    ],
  );
  assert.deepEqual(
    props.beats.map((b) => b.from),
    [0, 48, 84],
  );
  const frames = proofFrames(props);
  assert.ok(
    frames[0] < 48 &&
      frames[1] >= 48 &&
      frames[1] < 84 &&
      frames[2] >= 84 &&
      frames[2] < 120,
  );
});
test("选声只替换当前镜头同语种轨道；原台词已改则不采用旧音轨", () => {
  const p = reviewed(),
    s = p.shots[0],
    other = { ...s, id: "other" };
  p.shots.push(other);
  const a = voice(s, "alt", "zh", 5, [0, 1.5, 4]);
  let n = castingChoice(p, s.id, a);
  assert.deepEqual(n.shots[0].assetIds, [processVideo.id,"alt"]);
  assert.deepEqual(n.shots[1].assetIds, [processVideo.id,"nzh"]);
  n = update(p, n);
  assert.equal(n.claims[0].verified, true);
  assert.equal(n.shots[0].reviewed, false);
  n.shots[0].zh = "改词";
  assert.throws(() => castingChoice(n, s.id, a), /台词/);
});
test("风格审核随画布、图形与配音失效；直接模式继续执行科学和素材检查", () => {
  const p = reviewed(),
    s = p.shots[0];
  assert.match(renderIssues(p, s.id).join(" "), /风格帧/);
  review(p, "look", s.id);
  assert.deepEqual(renderIssues(p, s.id), []);
  const n = update(p, { ...p, width: 1280 });
  assert.match(renderIssues(n, s.id).join(" "), /风格帧/);
  n.flow = "direct";
  assert.deepEqual(renderIssues(n, s.id), []);
  n.claims[0].verified = false;
  assert.match(renderIssues(n, s.id).join(" "), /科学结论/);
});
test("上传旁白可使用人工入点；越界、倒序会被拒绝，换轨时不沿用旧标记", () => {
  const p = reviewed(),
    s = p.shots[0];
  delete p.assets[0].segments;
  delete p.assets[0].scriptText;
  s.manualTiming = { zh: { assetId: "nzh", text: s.zh, starts: [0, 0.5, 3] } };
  assert.deepEqual(
    timeline(p).rows[0].captionCues.map((x) => [x.from, x.timing]),
    [
      [0, "人工标记"],
      [12, "人工标记"],
      [72, "人工标记"],
    ],
  );
  s.manualTiming.zh.starts = [0, 3, 2];
  assert.throws(() => update(null, p), /入点/);
  s.manualTiming.zh.assetId = "old";
  assert.equal(timeline(p).rows[0].captionCues[0].timing, "估算");
});
test("中英依次播报中，第二语言起点包含整条中文音轨，三拍与测时一起移动", () => {
  const p = reviewed(),
    s = p.shots[0];
  p.assets.push(voice(s, "nen", "en", 4, [0, 1, 3]));
  s.assetIds.push("nen");
  p.language = "sequential";
  p.flow = "direct";
  const props = sceneProps(p, s.id);
  assert.deepEqual(
    props.beats.map((x) => x.from),
    [0, 48, 84, 120, 144, 192],
  );
  assert.equal(props.canvas.frames, 216);
});
test("分阶段模式可以显式制作无旁白样镜；视频入点和关联证据仍被校验", () => {
  const p = reviewed(),
    s = p.shots[0];
  s.assetIds = [processVideo.id];
  review(p, "look", s.id);
  assert.match(renderIssues(p, s.id).join(" "), /无旁白/);
  s.silentOK = true;
  review(p, "look", s.id);
  assert.deepEqual(renderIssues(p, s.id), []);
  s.beatSources = ["", "", "missing"];
  assert.match(renderIssues(p, s.id).join(" "), /解除关联/);
});

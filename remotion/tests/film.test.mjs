import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {continuity,processVideo} from './fixtures/continuous.mjs';
import assert from "node:assert/strict";
import {
  draft,
  emptyClaim,
  emptyShot,
  qualityFor,
  update,
  timeline,
  review,
} from "../shared/model.mjs";
import { filmProps, filmIssues, noteAt, locateNote } from "../shared/film.mjs";
import { archivedRoughSubtitles, srt } from "../server/film-package.mjs";
const quality=qualityFor({kind:'science'});

function project() {
  const p = { ...draft("science"), flow: "direct", topic: "月相", target: 6 };
  p.assets=[processVideo];
  for (const [i, s] of ["前", "中", "后"].entries()) {
    const claim = {
      ...emptyClaim(),
      text: "依据" + s,
      title: "NASA",
      locator: "第" + i + "段",
      url: "https://science.nasa.gov/moon/moon-phases/",
      verified: true,
    };
    const shot = {
      ...emptyShot(),
      continuity:{...continuity},processVideoId:processVideo.id,assetIds:[processVideo.id],motionReview:'v1 00:00–00:06 完整路径连续，正常速度检查',
      title: s,
      purpose: s,
      visual: s,
      seconds: 2,
      zh: "中文。",
      en: "English.",
      claimIds: [claim.id],
      reviewed: true,
      silentOK: true,
      filmQA: [...quality],
    };
    p.claims.push(claim);
    p.shots.push(shot);
  }
  return p;
}
test("目标余量按镜头分配，入镜短叠化只占前镜无语音的帧", () => {
  const p = project();
  p.target = 9;
  assert.deepEqual(
    timeline(p).rows.map((r) => r.padding),
    [24, 24, 24],
  );
  p.target = 1;
  p.shots[1].transition = "dissolve";
  let tl = timeline(p);
  assert.equal(tl.rows[1].overlap, 8);
  assert.equal(tl.frames, 136);
  p.assets = [{ id: "voice", kind: "audio", role: "zh", duration: 2 }];
  p.shots[0].assetIds = ["voice"];
  tl = timeline(p);
  assert.equal(tl.rows[1].overlap, 0);
  assert.equal(tl.frames, 144);
});
test("修改叠化只要求重新检查接缝两侧的画面", () => {
  const p = project();
  p.target = 1;
  const edited = structuredClone(p);
  edited.shots[1].transition = "dissolve";
  const result = update(p, edited);
  assert.deepEqual(result.shots[0].filmQA, []);
  assert.deepEqual(result.shots[1].filmQA, []);
  assert.deepEqual(result.shots[2].filmQA, quality);
  assert.ok(result.shots.every((s) => s.reviewed));
});
test("一份帧表映射字幕、转场所属镜头、批注和替换后的相对位置", () => {
  const p = project();
  p.target = 1;
  p.shots[1].transition = "dissolve";
  const a = filmProps(p),
    f = a.rows[1].from;
  assert.equal(noteAt(a.rows, f).shotId, p.shots[1].id);
  assert.equal(noteAt(a.rows, f, p.shots[0].id).localFrame, f);
  const note = { ...noteAt(a.rows, f + 15), fps: 24, x: 0.4, y: 0.6 };
  assert.equal(a.captions[0].until, f);
  assert.equal(a.captions[1].from, f);
  assert.match(srt(a), /00:00:01,667/);
  p.shots[0].seconds += 2;
  assert.equal(locateNote(filmProps(p).rows, note, 24), f + 15 + 48);
  p.shots[1].seconds = 0.25;
  assert.equal(locateNote(filmProps(p).rows, note, 24), null);
  p.shots.splice(1, 1);
  assert.equal(locateNote(filmProps(p).rows, note, 24), null);
});
test('旧粗剪可按原快照下载 SRT，早期证据仅在项目版本匹配时使用',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-captions-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const p={...project(),version:3},film=filmProps(p,'zh');
  const j={scope:'rough',status:'done',version:3,variant:'zh',evidence:{fps:p.fps,captions:film.captions}};
  assert.equal(archivedRoughSubtitles(folder,j,p),srt(film));
  assert.equal(archivedRoughSubtitles(folder,j,{...p,version:4}),null);
  fs.writeFileSync(path.join(folder,'render-input.json'),JSON.stringify(film));
  assert.equal(archivedRoughSubtitles(folder,j,null),srt(film));
  assert.equal(archivedRoughSubtitles(folder,{...j,status:'running'},p),null);
});
test("逐镜核对五项才能成片，修改一处保留不相关镜的审核", () => {
  const p = project();
  assert.deepEqual(filmIssues(p, "zh"), []);
  const changed = structuredClone(p);
  changed.shots[1].en = "A revised line.";
  const next = update(p, changed);
  assert.equal(next.shots[0].reviewed, true);
  assert.deepEqual(next.shots[0].filmQA, quality);
  assert.equal(next.shots[1].reviewed, false);
  assert.deepEqual(next.shots[1].filmQA, []);
  assert.ok(filmIssues(next, "zh", false).some((m) => m.includes("出处")));
  review(next, "claim", next.claims[1].id);
  review(next, "shot", next.shots[1].id);
  assert.deepEqual(filmIssues(next, "zh", false), []);
  assert.match(filmIssues(next, "zh").join(" "), /画面待检/);
  for (const check of quality)
    review(next, "visual", next.shots[1].id, check, true);
  review(next,'motion',next.shots[1].id,'v2 00:02–00:04 正常速度检查，持续运动');
  assert.deepEqual(filmIssues(next, "zh"), []);
  next.flow = "review";
  next.pauses = ["导出前"];
  assert.match(filmIssues(next, "zh").join(" "), /导出前/);
});
test("全片逐镜中文再英文，目标30秒保持46秒完整旁白，分开导出独立计时", () => {
  const p = project();
  p.shots.pop();
  p.target = 30;
  p.language = "sequential";
  for (const [i, s] of p.shots.entries()) {
    const tracks = ["zh", "en"].map((lang, k) => ({
      id: lang + i,
      kind: "audio",
      role: lang,
      duration: k ? 12 : 11,
    }));
    p.assets.push(...tracks);
    s.assetIds = tracks.map((a) => a.id);
  }
  const f = filmProps(p);
  assert.equal(f.canvas.frames, 1104);
  assert.deepEqual(
    f.captions.map((c) => c.from),
    [0, 264, 552, 816],
  );
  assert.equal(timeline(p).extra, 16);
  p.flow = "review";
  assert.equal(timeline(p).blocked, true);
  p.flow = "direct";
  p.language = "separate";
  p.target = 1;
  assert.equal(filmProps(p, "en").canvas.frames, 24 * 24);
  assert.equal(filmProps(p, "zh").canvas.frames, 22 * 24);
});

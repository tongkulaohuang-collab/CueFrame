import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { draft } from "../shared/model.mjs";
process.env.FRAMEBOARD_DATA = fs.mkdtempSync(
  path.join(os.tmpdir(), "frameboard-source-test-"),
);
const { db, save } = await import("../server/store.mjs");
test("上传录音不能自报为实测合成；工作台合成的语言与语句边界来自原始记录", () => {
  const raw = {
    id: "upload",
    src: "/media/upload.wav",
    kind: "audio",
    duration: 2,
    name: "upload.wav",
  };
  const enroll = (a) =>
    db.prepare("INSERT INTO uploads VALUES (?,?)").run(a.id, JSON.stringify(a));
  enroll(raw);
  const p = {
    ...draft(),
    topic: "验收",
    assets: [
      {
        ...raw,
        role: "zh",
        segments: [{ text: "不应标为实测", from: 0 }],
        voiceLabel: "伪造",
      },
    ],
  };
  const original = save(p);
  assert.equal(original.assets[0].segments, undefined);
  assert.equal(original.assets[0].voiceLabel, undefined);
  const generated = {
    ...raw,
    id: "synth",
    voiceLang: "zh",
    scriptText: "原句",
    segments: [{ text: "原句", from: 0, until: 2 }],
  };
  enroll(generated);
  const next = { ...original, assets: [{ id: "synth", role: "en" }] };
  assert.throws(() => save(next), /语种/);
  next.assets[0].role = "zh";
  next.assets[0].segments = [{ text: "篡改", from: 1 }];
  assert.deepEqual(save(next).assets[0].segments, generated.segments);
});

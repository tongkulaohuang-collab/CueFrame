import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "science-tools-test-"));
process.env.FRAMEBOARD_DATA = path.join(scratch, "data");
const { availableOutputs, resolveOutput } = await import("../server/science-tools.mjs");
const output = path.join(scratch, "outputs");
fs.mkdirSync(path.join(output, "manim", "partial_movie_files"), { recursive: true });
fs.writeFileSync(path.join(output, "manim", "clip.mp4"), "fixture");
fs.writeFileSync(path.join(output, "manim", "partial_movie_files", "fragment.mp4"), "fixture");
fs.writeFileSync(path.join(scratch, "private.mp4"), "private");

test("素材列表只列出完整媒体，排除 Manim 中间片段", () => {
  assert.deepEqual(availableOutputs(output).map(x => x.id), ["manim/clip.mp4"]);
});
test("结果导入阻止输出目录外的相对路径和绝对路径", () => {
  assert.equal(resolveOutput("manim/clip.mp4", output), path.join(output, "manim", "clip.mp4"));
  assert.throws(() => resolveOutput("../private.mp4", output), /输出目录/);
  assert.throws(() => resolveOutput(path.join(scratch, "private.mp4"), output), /输出目录/);
  assert.throws(() => resolveOutput("manim/partial_movie_files/fragment.mp4", output), /无效/);
});
test("结果导入执行与普通上传相同的 64 MB 限制", () => {
  const big = path.join(output, "oversize.mp4");
  fs.closeSync(fs.openSync(big, "w")); fs.truncateSync(big, 64 * 1024 * 1024 + 1);
  assert.throws(() => resolveOutput("oversize.mp4", output), /64 MB/);
});

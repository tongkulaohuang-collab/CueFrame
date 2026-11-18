import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {CHINESE_SPEECH_RULES} from '../shared/local-speech.mjs';
const base = fileURLToPath(new URL("../data/models/", import.meta.url)),
  dirname = "kokoro-int8-multi-lang-v1_1";
const url =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" +
  dirname +
  ".tar.bz2";
const digest =
  "259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c";
fs.mkdirSync(base, { recursive: true });
if (
  [
    "model.int8.onnx",
    "voices.bin",
    "tokens.txt",
    "lexicon-us-en.txt",
    "lexicon-zh.txt",
    ...CHINESE_SPEECH_RULES,
    "LICENSE",
  ].every((f) => fs.existsSync(path.join(base, dirname, f)))
)
  console.log("本地 Kokoro 配音模型已就绪。");
else {
  const archive = path.join(base, "kokoro-v1_1.tar.bz2");
  if (!fs.existsSync(archive))
    execFileSync("curl", ["-fLS", "--retry", "1", url, "-o", archive], {
      stdio: "inherit",
    });
  const calc = createHash("sha256");
  for await (const chunk of fs.createReadStream(archive)) calc.update(chunk);
  if (calc.digest("hex") !== digest)
    throw Error("官方模型归档哈希不匹配，请移出该下载文件后重试");
  execFileSync("tar", ["-xjf", archive, "-C", base], { stdio: "inherit" });
  console.log("本地 Kokoro 配音模型已安装。");
}

import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { db, root } from "./store.mjs";
import { upload } from "./media.mjs";
import {CHINESE_SPEECH_RULES, LOCAL_SPEECH_VERSION, localSpeechLines} from '../shared/local-speech.mjs';
import {voiceMusicPlan} from '../shared/voice-music.mjs';
import {alignVoiceToMusic} from './voice-music.mjs';
const model = "data/models/kokoro-int8-multi-lang-v1_1";
const names = {
  zh: [
    { sid: 3, label: "女声 · zf_001" },
    { sid: 58, label: "男声 · zm_009" },
  ],
  en: [
    { sid: 0, label: "美式 · Maple" },
    { sid: 2, label: "英式 · Vale" },
  ],
};
const tasks = new Map();
let queue = Promise.resolve();
db.exec(
  "CREATE TABLE IF NOT EXISTS voice_casts (key TEXT PRIMARY KEY, candidates TEXT NOT NULL)",
);
function synthesize(input) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, "server/voice-worker.mjs"), [], {
      cwd: root,
      execArgv: [],
      windowsHide: true,
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let err = "";
    child.stderr.on("data", (x) => {
      err = (err + x).slice(-500);
    });
    const timeout = setTimeout(() => child.kill(), 180000);
    child.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.once("message", (r) => {
      clearTimeout(timeout);
      r.error ? reject(Error(r.error)) : resolve(r.audio);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(Error("配音进程已退出（" + code + "） " + err));
    });
    child.send(input);
  });
}
export async function audition(p, id, lang) {
  const s = p.shots.find((x) => x.id === id);
  if (!s || !names[lang]) throw Error("请选择有效镜头和试听语种");
  if (!s[lang]?.trim() || s[lang].length > 800)
    throw Error("请填写不超过 800 字符的本镜台词");
  const musicPlan=voiceMusicPlan(p,id,lang);
  const lines = localSpeechLines(s[lang], lang),
    voices = names[lang].map((v, i) => ({
      ...v,
      speed: (musicPlan?1+musicPlan.speechRate/100:p.kind === "science" ? 0.97 : 1.04) + (i === 1 ? 0.015 : 0),
    }));
  const gap = musicPlan?.gap ?? (p.kind === "science" ? 0.27 : 0.15);
  const key = createHash("sha256")
    .update(JSON.stringify([model, LOCAL_SPEECH_VERSION, lang, lines, voices, gap,musicPlan?.key]))
    .digest("hex");
  const cached = db
    .prepare("SELECT candidates FROM voice_casts WHERE key=?")
    .get(key);
  if (cached) return JSON.parse(cached.candidates);
  if (tasks.has(key)) return tasks.get(key);
  if (!fs.existsSync(path.join(root, model, "model.int8.onnx")))
    throw Error(
      "尚未安装本机语音模型，请运行 npm run setup:voice，或上传自己的旁白",
    );
  if (lang === 'zh' && CHINESE_SPEECH_RULES.some(file => !fs.existsSync(path.join(root, model, file))))
    throw Error('本机中文配音缺少数字读法规则，请运行 npm run setup:voice 修复；未提交合成。');
  const task = queue.then(async () => {
    const all = await synthesize({ dir: model, lines, voices, gap, lang });
    const candidates = await Promise.all(all.map(async ({ wave, segments }, i) => {
      const aligned=await alignVoiceToMusic(Buffer.from(wave),segments,musicPlan);
      const v = voices[i],
        a = upload(
          "kokoro-" + lang + "-" + v.sid + "-" + key.slice(0, 8) + ".wav",
          aligned.bytes,
          {
            ...(aligned.segments?{segments:aligned.segments}:{}),
            ...(aligned.voiceMusic?{voiceMusic:aligned.voiceMusic}:{}),
            speakerId:'local:'+lang+':'+v.sid,
            scriptText: s[lang],
            voiceLang: lang,
            voiceLabel: v.label,
            speechNormalizationVersion: LOCAL_SPEECH_VERSION,
          },
        );
      return {
        ...a,
        role: lang,
        source: "Kokoro-82M v1.1-zh · 本机离线生成 · speaker " + v.sid,
        license: "Apache-2.0 模型；本项目台词本机生成",
        credit: "hexgrad · sherpa-onnx",
        confirmed: true,
      };
    }));
    db.prepare("INSERT OR REPLACE INTO voice_casts VALUES (?,?)").run(
      key,
      JSON.stringify(candidates),
    );
    return candidates;
  });
  tasks.set(key, task);
  queue = task.catch(() => {});
  try {
    return await task;
  } finally {
    tasks.delete(key);
  }
}

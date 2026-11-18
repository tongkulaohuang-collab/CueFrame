import { createRequire } from "node:module";
import { wave } from "./wave.mjs";
import {CHINESE_SPEECH_RULES, localSpeechText} from '../shared/local-speech.mjs';
const require = createRequire(import.meta.url);
process.once("message", ({ lines, voices, dir, gap, lang }) => {
  try {
    const { OfflineTts } = require("sherpa-onnx-node"),
      file = (n) => dir + "/" + n;
    const tts = new OfflineTts({
      model: {
        kokoro: {
          model: file("model.int8.onnx"),
          voices: file("voices.bin"),
          tokens: file("tokens.txt"),
          lexicon: file("lexicon-us-en.txt") + "," + file("lexicon-zh.txt"),
        },
        numThreads: 3,
        provider: "cpu",
        debug: 0,
      },
      maxNumSentences: 1,
      ...(lang === 'zh' ? {ruleFsts: CHINESE_SPEECH_RULES.map(file).join(',')} : {}),
    });
    const rate = tts.sampleRate,
      audio = [];
    for (const voice of voices) {
      const pieces = [],
        segments = [];
      let offset = 0;
      for (const text of lines) {
        const { samples } = tts.generate({
          text: localSpeechText(text, lang),
          generationConfig: { sid: voice.sid, speed: voice.speed },
        });
        let first = 0,
          last = samples.length;
        while (first < last && Math.abs(samples[first]) < 0.003) first++;
        while (last > first && Math.abs(samples[last - 1]) < 0.003) last--;
        if (first === last) throw Error("该句没有可用的语音信号");
        const start = Math.max(0, first - Math.round(0.035 * rate)),
          end = Math.min(samples.length, last + Math.round(0.08 * rate));
        const piece = samples.subarray(start, end);
        segments.push({
          text,
          from: offset / rate,
          until: (offset + piece.length) / rate,
        });
        pieces.push(piece);
        offset += piece.length + Math.round(gap * rate);
      }
      const sum = new Float32Array(Math.round(segments.at(-1).until * rate));
      let peak = 0;
      pieces.forEach((p, i) => {
        sum.set(p, Math.round(segments[i].from * rate));
        for (const x of p) peak = Math.max(peak, Math.abs(x));
      });
      const gain = Math.min(2, 0.88 / Math.max(peak, 0.01));
      for (let i = 0; i < sum.length; i++) sum[i] *= gain;
      audio.push({ wave: wave(sum, rate), segments });
    }
    process.send({ audio }, () => process.disconnect());
  } catch (e) {
    process.send({ error: e.message }, () => process.disconnect());
  }
});

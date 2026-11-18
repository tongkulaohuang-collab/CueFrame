import {readNumber} from './spoken-reading.mjs';

// Included in synthesis cache keys: old recordings without numeric reading
// must never be returned when the user explicitly regenerates them.
export const LOCAL_SPEECH_VERSION = 2;
export const CHINESE_SPEECH_RULES = ['date-zh.fst', 'phone-zh.fst', 'number-zh.fst'];

export function localSpeechText(text, lang) {
  if (lang !== 'zh') return text;
  // The official number FST reads the digits but leaves % as an unknown token.
  // Keep punctuation and the written script; normalize only the TTS input.
  return String(text).replace(/[０-９．％]/gu, char => char.normalize('NFKC')).replace(/\d+(?:\.\d+)?\s*%/gu,
    value => readNumber(value.replace(/\s/gu, '')));
}

export function localSpeechLines(text, lang) {
  // Sentence timing must not depend on whether a translation happens to exist.
  const boundary = lang === 'zh' ? /(?<=[。！？])/u : /(?<=[.!?])\s+/u;
  return String(text || '').split(boundary).map(line => line.trim()).filter(Boolean);
}

// Use the catalogue's declared language, not the display name or nationality.
// This deliberately handles the confirmed English-voice / Chinese-text mismatch;
// clone languages and cross-language capabilities not stated in the catalogue stay unknown.
export function voiceTextIssue(voice, text) {
  if(!voice || voice.kind==='clone')return '';
  const languages=voice.languages||'';
  const englishOnly=/英语|英文/.test(languages)&&!/中文|日文|日语|多语种|\d+\+?语种/.test(languages);
  if(englishOnly && /\p{Script=Han}/u.test(text||''))
    return `${voice.name} 的官方标注语种为${languages}，当前台词含中文。请选择中文音色，或改用英文台词。`;
  return '';
}

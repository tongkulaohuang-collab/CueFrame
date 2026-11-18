// Chinese remains the source draft; each English paragraph stays attached to its shot.
export const translationInput = p => JSON.stringify(p.shots.map(s => [s.id,s.zh,s.en]));
export function invalidateTranslations(previous,p) {
  if(!previous)return p;
  const ids=new Set(p.assets.filter(a=>a.kind==='audio'&&a.role==='en').map(a=>a.id));
  return {...p,shots:p.shots.map(s=>{
    const old=previous.shots.find(o=>o.id===s.id);
    if(!old || old.zh===s.zh || old.en!==s.en)return s;
    const withoutEnglish=tracks=>Object.fromEntries(Object.entries(tracks||{}).filter(([lang])=>lang!=='en'));
    return {...s,en:'',translationSourceZh:undefined,assetIds:s.assetIds.filter(id=>!ids.has(id)),
      subtitleTracks:withoutEnglish(s.subtitleTracks),manualTiming:withoutEnglish(s.manualTiming)};
  })};
}
export function translationSegments(p) {
  return p.shots.filter(s => s.zh?.trim() && (!s.en?.trim() ||
    s.translationSourceZh && s.translationSourceZh !== s.zh)).map(s => ({id:s.id,zh:s.zh}));
}
export function validateTranslation(raw,p) {
  const expected=translationSegments(p), rows=raw?.segments;
  if(!expected.length || !Array.isArray(rows) || rows.length!==expected.length ||
    new Set(rows.map(s=>s?.id)).size!==rows.length || rows.some(s=>!s ||
      !expected.some(e=>e.id===s.id) || typeof s.en!=='string' || !s.en.trim() ||
      s.en.length>12000 || /\p{Script=Han}/u.test(s.en) || !/[a-z]/i.test(s.en)))
    throw Error('英文翻译未完整对应原口播段落，原稿已保留，请重新翻译。');
  return expected.map(s=>({id:s.id,en:rows.find(r=>r.id===s.id).en.trim()}));
}
export function applyTranslation(p,rows,{captionsOnly=false}={}) {
  const translations=validateTranslation({segments:rows},p);
  const englishAudio=new Set(p.assets.filter(a=>a.kind==='audio'&&a.role==='en').map(a=>a.id));
  return {...p,shots:p.shots.map(s=>{
    const row=translations.find(r=>r.id===s.id);
    if(!row)return s;
    const withoutEnglish=tracks=>Object.fromEntries(Object.entries(tracks||{}).filter(([lang])=>lang!=='en'));
    return {...s,en:row.en,translationSourceZh:s.zh,assetIds:s.assetIds.filter(id=>!englishAudio.has(id)),
      subtitleTracks:withoutEnglish(s.subtitleTracks),manualTiming:withoutEnglish(s.manualTiming),
      motionPlan:captionsOnly?s.motionPlan:null,reviewed:false,approvedLook:null,filmQA:[],motionReview:''};
  })};
}
export function voiceNarrationLanguage(voice,current='zh') {
  if(!voice || voice.kind==='clone')return current;
  if(voice.languages?.includes('中文'))return 'zh';
  if(/英语|英文/.test(voice.languages||''))return 'en';
  return current;
}
export function preferredNarrationVoice(voices,lang,...ids) {
  const usable=v=>v && (v.kind==='clone'||voiceNarrationLanguage(v,'')===lang);
  return ids.map(id=>voices.find(v=>v.speaker_id===id)).find(usable)?.speaker_id ||
    voices.find(v=>usable(v))?.speaker_id || '';
}

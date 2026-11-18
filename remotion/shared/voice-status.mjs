// Availability describes adopted audio, independently of the next provider/voice.
export function currentVoice(p, shot, lang) {
  return p.assets.find(a => shot.assetIds.includes(a.id) && a.kind === 'audio' && a.role === lang &&
    a.duration > 0 && (!a.scriptText || a.scriptText.trim() === (shot[lang] || '').trim())) || null;
}
export function voiceStatus(p, lang = p.voice) {
  const rows = p.shots.map(s => ({id:s.id, asset:currentVoice(p,s,lang)}));
  return {rows, total:rows.length, done:rows.filter(r=>r.asset).length, missing:rows.filter(r=>!r.asset).map(r=>r.id)};
}
export function voiceProvider(p, remembered) {
  if (['local','doubao'].includes(remembered)) return remembered;
  const take=voiceStatus(p).rows.find(r=>r.asset)?.asset;
  return take?.speakerId?.startsWith('local:') || p.productionMode==='local-process' ? 'local' : 'doubao';
}

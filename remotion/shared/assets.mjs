// Remove only this project's use of an upload. Files and older versions stay intact.
import {shotVisualAssetIds} from './image-text-layers.mjs';
export function removeNarration(p, shotIds, languages = ['zh', 'en']) {
  if (!Array.isArray(shotIds) || !shotIds.length || shotIds.some(id => !p.shots.some(s => s.id === id)) ||
      !Array.isArray(languages) || !languages.length || languages.some(lang => !['zh', 'en'].includes(lang)))
    throw Error('请选择当前项目中的配音段落和语言');
  const voiceIds = new Set(p.assets.filter(a => a.kind === 'audio' && languages.includes(a.role)).map(a => a.id));
  const shots = p.shots.map(s => {
    if (!shotIds.includes(s.id) || !s.assetIds.some(id => voiceIds.has(id))) return s;
    const withoutVoice = tracks => Object.fromEntries(Object.entries(tracks || {}).filter(([lang, t]) =>
      !languages.includes(lang) && !voiceIds.has(t?.assetId)));
    return {...s, assetIds:s.assetIds.filter(id => !voiceIds.has(id)),
      subtitleTracks:withoutVoice(s.subtitleTracks), manualTiming:withoutVoice(s.manualTiming),
      silentOK:false, motionPlan:null, reviewed:false, approvedLook:null, filmQA:[], motionReview:''};
  });
  // Keep the recordings available in the asset library and historical takes for recovery.
  return {...p, shots, ...(p.scienceFlow ? {scienceFlow:{...p.scienceFlow,
    scriptVersion:null, proofVersion:null, proofs:null, sampleJob:null}} : {})};
}

export function removeAsset(p, id) {
  const dependentIds = new Set(p.assets.filter(a => a.referenceId === id).map(a => a.id));
  const f = p.scienceFlow;
  const removesBgm = f && [f.bgmId, f.analysis?.sourceId, f.analysis?.clipId].includes(id);
  const tracksWithout = tracks => Object.fromEntries(Object.entries(tracks).filter(([, track]) => track?.assetId !== id));
  return {
    assets: p.assets.filter(a => a.id !== id).map(a => dependentIds.has(a.id) ? {...a, referenceId:'', confirmed:false} : a),
    shots: p.shots.map(s => {
      const affected = removesBgm || shotVisualAssetIds(s).includes(id) || s.assetIds.some(value => dependentIds.has(value)) ||
        s.processVideoId === id || Object.values(s.subtitleTracks || {}).some(t => t?.assetId === id) ||
        Object.values(s.manualTiming || {}).some(t => t?.assetId === id);
      if (!affected) return s;
      return {...s, assetIds:s.assetIds.filter(value => value !== id),
        ...(s.imageBindings ? {imageBindings:s.imageBindings.filter(b=>b.assetId!==id)} : {}),
        ...(s.processVideoId === id ? {processVideoId:'', processOffset:0} : {}),
        ...(s.subtitleTracks ? {subtitleTracks:tracksWithout(s.subtitleTracks)} : {}),
        ...(s.manualTiming ? {manualTiming:tracksWithout(s.manualTiming)} : {}),
        reviewed:false, approvedLook:null, filmQA:[], motionReview:''};
    }),
    ...(f ? {scienceFlow:{...f, sampleJob:null, ...(removesBgm ? {bgmId:'', analysis:null} : {})}} : {}),
  };
}

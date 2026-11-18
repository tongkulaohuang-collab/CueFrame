// A generated design for existing narration belongs to that paragraph. Keep its
// identity, measured voice timing and subtitles instead of appending it again.
export function mergeShotDesigns(shots, designs) {
  const result=structuredClone(shots);
  for(const design of designs) {
    const matches=shots.filter(s=>s.zh.trim() && s.zh.trim()===design.zh.trim());
    if(matches.length!==1 || designs.filter(s=>s.zh.trim()===design.zh.trim()).length!==1) {
      result.push(design);
      continue;
    }
    const old=matches[0],i=result.findIndex(s=>s.id===old.id);
    result[i]={...old,...design,id:old.id,seconds:old.seconds,
      assetIds:[...new Set([...old.assetIds,...design.assetIds])],
      subtitleTracks:old.subtitleTracks,manualTiming:old.manualTiming,
      reviewed:false,approvedLook:null,filmQA:[],motionReview:''};
  }
  return result;
}

export const playbackKey=(id,duration)=>'frameboard:watched:'+id+':'+Number(duration).toFixed(6);
export function mergeWatched(...groups) {
  const out=[];
  for(const r of groups.flat().filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[0]>=0&&r[1]>r[0]).sort((a,b)=>a[0]-b[0])) {
    const last=out.at(-1);
    if(last&&r[0]<=last[1]+.08)last[1]=Math.max(last[1],r[1]);else out.push([...r]);
  }
  return out;
}
export function readWatched(storage,id,duration) {
  try {const r=JSON.parse(storage.getItem(playbackKey(id,duration))||'[]');return Array.isArray(r)?mergeWatched(r).filter(v=>v[1]<=duration+.05):[];}catch{return [];}
}
export function saveWatched(storage,id,duration,ranges) {
  const merged=mergeWatched(readWatched(storage,id,duration),ranges).map(r=>[r[0],Math.min(r[1],duration)]).filter(r=>r[1]>r[0]);
  try {storage.setItem(playbackKey(id,duration),JSON.stringify(merged));}catch{}
  return merged;
}
// The joined file identifies the exact source jobs. Coverage maps only to them,
// never to a newer replacement clip or to human approval checkboxes.
export function joinedCoverage(segments,fps,ranges) {
  let offset=0;
  return segments.map(s=>{
    const duration=s.frames/fps,start=offset;offset+=duration;
    return {id:s.jobId,duration,ranges:ranges.map(r=>[Math.max(start,r[0])-start,Math.min(offset,r[1])-start]).filter(r=>r[1]>r[0])};
  });
}

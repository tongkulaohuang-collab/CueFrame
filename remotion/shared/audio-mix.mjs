// One envelope for audition, Remotion preview/render and FFmpeg audio exports.
export const MIX_VERSION = 'speech-envelope-v2';
export const MIX = Object.freeze({voice:.88, bed:.24, speech:.085, attack:.14, release:.28, fadeIn:.25, fadeOut:.4});
const clamp = x => Math.max(0, Math.min(1, x));

export function speechWindows(voices, fps, captions=[]) {
  const windows=[];
  for(const v of voices) {
    const offset=v.from/fps, duration=v.asset.duration || v.frames/fps;
    const precise=captions.filter(c=>c.lang===v.asset.role && c.timing==='精确起止' &&
      c.from>=v.from && c.until<=v.from+v.frames && c.until>c.from);
    const segments=v.asset.segments;
    // Missing/partial end times must not be mistaken for measured silence.
    const measured=Array.isArray(segments)&&segments.length&&segments.every(s=>
      Number.isFinite(s.from)&&Number.isFinite(s.until)&&s.from>=0&&s.until>s.from&&s.until<=duration+.02);
    if(precise.length)windows.push(...precise.map(c=>({from:c.from/fps,until:c.until/fps})));
    else if(measured)windows.push(...segments.map(s=>({from:offset+s.from,until:offset+s.until})));
    else windows.push({from:offset,until:offset+duration});
  }
  return windows.filter(w=>Number.isFinite(w.from)&&Number.isFinite(w.until)&&w.until>w.from)
    .sort((a,b)=>a.from-b.from).reduce((out,w)=>{
      const last=out.at(-1);
      if(last&&w.from<=last.until)last.until=Math.max(last.until,w.until);
      else out.push({...w});
      return out;
    },[]);
}

export function musicGain(time, windows, duration, {edges=true}={}) {
  const speech=windows.reduce((value,w)=>Math.max(value, Math.min(
    clamp((time-w.from+MIX.attack)/MIX.attack),clamp((w.until+MIX.release-time)/MIX.release))),0);
  const fade=edges?Math.min(clamp(time/MIX.fadeIn),clamp((duration-time)/MIX.fadeOut)):1;
  return (MIX.bed-(MIX.bed-MIX.speech)*speech)*fade;
}

// eval=frame uses the same seconds clock as the player, independent of BGM loops.
export function musicVolumeExpression(windows,duration,origin=0) {
  const n=v=>Number(v.toFixed(6));
  const c=s=>`clip(${s},0,1)`;
  const terms=windows.map(w=>`min(${c(`(t-${n(w.from)}+${MIX.attack})/${MIX.attack}`)},${c(`(${n(w.until)}+${MIX.release}-t)/${MIX.release}`)})`);
  // Balanced nesting avoids excessive expression depth for long narrations.
  const maximum=items=>items.length<2?(items[0]||'0'):`max(${maximum(items.slice(0,Math.ceil(items.length/2)))},${maximum(items.slice(Math.ceil(items.length/2)))})`;
  const expression=`(${MIX.bed}-${n(MIX.bed-MIX.speech)}*${maximum(terms)})*min(${c(`t/${MIX.fadeIn}`)},${c(`(${n(duration)}-t)/${MIX.fadeOut}`)})`;
  return origin?expression.replace(/\bt\b/g,`(t+${n(origin)})`):expression;
}
export function voiceMusicFilter(windows,duration,{origin=0,wholeDuration=duration}={}) {
  if(!Number.isFinite(duration)||duration<=0)throw Error('混音时长无效');
  return `[0:a]aresample=24000,asetpts=PTS-STARTPTS,volume=${MIX.voice},apad,atrim=duration=${duration}[v];`+
    `[1:a]aresample=24000,asetpts=PTS-STARTPTS,volume='${musicVolumeExpression(windows,wholeDuration,origin)}':eval=frame,atrim=duration=${duration}[m];`+
    `[v][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[out]`;
}

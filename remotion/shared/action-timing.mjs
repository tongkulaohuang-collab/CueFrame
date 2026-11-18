import {captionTimes,timeline} from './model.mjs';
import {currentAlignment} from './voice-alignment.mjs';

export function measuredReadingPause(speech,from,until) {
  if(!Number.isFinite(from)||!Number.isFinite(until)||until<=from)return false;
  const segments=speech.filter(c=>c.evidence?.granularity==='segment'&&
    ['manual','provided-segments'].includes(c.evidence.source)&&Number.isFinite(c.until));
  return segments.some(c=>Math.abs(c.until-from)<.001)&&segments.some(c=>Math.abs(c.time-until)<.001)&&
    !speech.some(c=>c.time<until-.001&&(c.until??c.time)>from+.001);
}
export function actionTiming(p,shotId,lang=p.voice,row=timeline(p,lang).rows.find(r=>r.shot.id===shotId)) {
  if(!row)return {speech:[],music:[],estimated:[]};
  const start=row.from/p.fps,duration=row.frames/p.fps, speech=[],estimated=[];
  for(const v of row.voices){const a=currentAlignment(row.shot,v.asset,v.asset.role);if(!a)continue;
    const seen=new Set();for(const w of a.words){if(seen.has(w.tokenIndex))continue;seen.add(w.tokenIndex);
      speech.push({id:`word-${v.asset.role}-${w.start}`,time:v.from/p.fps+w.from,until:v.from/p.fps+w.until,globalTime:start+v.from/p.fps+w.from,text:w.token,
        precision:a.timing,evidence:{granularity:a.endBasis==='manual-calibration'?'token-interval':'token-onset',source:a.endBasis==='manual-calibration'?'manual-calibration':a.forced?'local-ctc':'local-asr',confidence:a.endBasis==='manual-calibration'?'operator-marked':'machine-unreviewed',receiptId:a.receiptId,endBasis:a.endBasis}});}}
  // Translated captions may group sentences differently from the recorded
  // language. Keep the actual spoken cue IDs through storyboard translation.
  const cues=p.captionMode==='bilingual'?captionTimes(row,lang,p.fps,true):row.captionCues;
  cues.filter(c=>c.lang===lang||p.language==='sequential').forEach((c,i)=>{
    const item={id:`speech-${c.lang}-${i}`,time:c.from/p.fps,until:c.until==null?null:c.until/p.fps,globalTime:start+c.from/p.fps,
      text:c[c.lang]||'',precision:c.timing,evidence:{granularity:'segment',source:/人工/.test(c.timing||'')?'manual':/精确|实测/.test(c.timing||'')?'provided-segments':'estimated',confidence:/精确|实测|人工/.test(c.timing||'')?'provided':'unverified'}};
    (/精确|实测|人工/.test(c.timing||'')?speech:estimated).push(item);
  });
  // A real audio file establishes paragraph entry, never unmeasured word times.
  if(!speech.length)row.voices.forEach((v,i)=>speech.push({id:`voice-${i}`,time:v.from/p.fps,
    until:(v.from+v.frames)/p.fps,globalTime:start+v.from/p.fps,text:row.shot[v.asset.role],precision:'音轨起点',evidence:{granularity:'paragraph',source:'audio-duration',confidence:'measured-boundary'}}));
  const f=p.scienceFlow||{},a=f.analysis,m=p.assets.find(a=>a.id===f.bgmId),music=[];
  if(a?.clipId===m?.id&&m?.duration>0){
    const attacks=a.rhythm?.onsets||[];
    const source=attacks.length?attacks:(a.marks||[]);
    const kind=attacks.length?'onset':'energy';
    for(let cycle=Math.floor(start/m.duration);cycle*m.duration<start+duration;cycle++)
      source.forEach((mark,i)=>{
        const time=cycle*m.duration+mark.time-start;
        if(Number.isFinite(time)&&time>=0&&time<duration)music.push({id:`music-${kind}-${cycle}-${i}`,time,globalTime:start+time,
          precision:kind==='onset'?'实测起音':'实测强弱变化',strength:mark.strength,change:mark.change});
      });
  }
  return {start,duration,speech,music,estimated};
}

export function bindActionCues(motion,bindings,timing,fps) {
  if(!Array.isArray(bindings)||bindings.length>48)throw Error('动作同步点格式无效');
  const cues=[...timing.speech,...timing.music], used=new Set();
  const sync=[];
  for(const b of bindings){
    const cue=cues.find(c=>c.id===b.cueId),node=motion.nodes.find(n=>n.id===b.nodeId),frame=node?.frames[b.frameIndex];
    const key=b.nodeId+':'+b.frameIndex;
    if(!cue||!frame||used.has(key)||!Number.isInteger(b.frameIndex)||b.frameIndex<=0||b.frameIndex>=node.frames.length-1||
      !Number.isFinite(b.offset)||Math.abs(b.offset)>.25||typeof b.action!=='string'||!b.action.trim())
      throw Error('动作同步点没有对应的实测声音、内部关键帧或动作说明');
    used.add(key);
    const time=Math.round((cue.time+b.offset)*fps)/fps;
    if(time<=node.frames[b.frameIndex-1].time||time>=node.frames[b.frameIndex+1].time)
      throw Error('动作同步点会使运动关键帧倒序，请调整动作分段');
    frame.time=time;
    sync.push({...b,time,globalTime:timing.start+time,precision:cue.precision,timingEvidence:cue.evidence||{granularity:'onset',source:'audio-analysis',confidence:'measured-boundary'},text:cue.text||cue.change||'音乐起音'});
  }
  return sync;
}

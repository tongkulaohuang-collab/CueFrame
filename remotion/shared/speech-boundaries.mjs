import {normalizedChars} from './voice-alignment.mjs';

// Energy marks speech activity, not phonemes. Keep this provenance visible.
export function speechEnvelope(samples,sampleRate=16000,step=.01) {
  const size=Math.max(1,Math.round(sampleRate*step)),rms=[],peaks=[];
  for(let i=0;i<samples.length;i+=size){let sum=0,peak=0,n=Math.min(size,samples.length-i);
    for(let j=0;j<n;j++){const x=samples[i+j];sum+=x*x;peak=Math.max(peak,Math.abs(x));}
    rms.push(Math.sqrt(sum/n));peaks.push(peak);
  }
  const sorted=rms.slice().sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.1)]||0,peak=Math.max(0,...rms);
  const threshold=Math.max(.00025,Math.min(peak*.06,floor*3),peak*.008);
  return {step,duration:samples.length/sampleRate,threshold,rms,peaks};
}
export function alignmentUnits(alignment) {
  const units=[];
  for(const [index,w] of alignment.words.entries()){
    const prior=units.at(-1);
    if(prior&&prior.tokenIndex===w.tokenIndex){prior.indices.push(index);prior.text+=w.c;prior.end=w.end;}
    else units.push({text:w.c,start:w.start,end:w.end,tokenIndex:w.tokenIndex,from:w.from,until:w.until,indices:[index]});
  }return units;
}
// A mismatch is a repair form, never an automatic alignment. Missing words remain untimed.
export function calibrationDraft(alignment) {
  if(alignment.applicable)return alignment;
  const chars=normalizedChars(alignment.text),words=[];
  let tokenIndex=0;
  for(let i=0;i<chars.length;){let end=i+1;
    if(!/[\p{Script=Han}]/u.test(chars[i].c))while(end<chars.length&&!/[\p{Script=Han}]/u.test(chars[end].c)&&chars[end].start===chars[end-1].end)end++;
    const part=chars.slice(i,end),matched=part.map(c=>alignment.words.find(w=>w.start===c.start&&w.end===c.end));
    const complete=matched.every(Boolean),from=complete?matched[0].from:null,until=complete?matched.at(-1).until:null,token=part.map(c=>c.c).join('');
    for(const c of part)words.push({...c,token,tokenIndex,from,until,needsTiming:!complete});
    tokenIndex++;i=end;
  }
  return {...alignment,words};
}
// Split at language punctuation / reading limits / measured gaps. Never divide time by characters.
export function timedSegments(text,words,{maxHan=22,maxLatin=42,gap=.18}={}) {
  if(!words.length)return [];const result=[];let start=0,first=0;
  for(let i=0;i<words.length;i++){
    const w=words[i],next=words[i+1],end=next?.start??text.length,tail=text.slice(w.end,end);
    const tokenBoundary=!next||next.tokenIndex!==w.tokenIndex;
    const length=normalizedChars(text.slice(start,end)).length;
    const punctuation=/[，。！？；,.!?;]/u.test(tail),space=/\s/u.test(tail);
    const limit=/[\p{Script=Han}]/u.test(text.slice(start,end))?maxHan:maxLatin;
    const breakHere=!next||tokenBoundary&&(punctuation||next.from-w.until>=gap||length>=limit&&(space||/[\p{Script=Han}]/u.test(w.c)));
    if(breakHere){result.push({text:text.slice(start,end).trim(),from:words[first].from,until:w.until});start=end;first=i+1;}
  }return result;
}
export function refineAcousticBoundaries(alignment,envelope) {
  if(!alignment.applicable)return alignment;
  const words=alignment.words.map(w=>({...w})),units=alignmentUnits(alignment);let trimmed=0;
  for(const unit of units){const first=Math.max(0,Math.floor(unit.from/envelope.step)),last=Math.min(envelope.rms.length,Math.ceil(unit.until/envelope.step));
    let active=-1;for(let i=first;i<last;i++)if(envelope.rms[i]>=envelope.threshold)active=i;
    const candidate=Math.min(unit.until,(active+1)*envelope.step+.02);
    if(active>=0&&unit.until-candidate>=.12&&candidate-unit.from>=.03){trimmed++;for(const i of unit.indices)words[i].until=candidate;}
  }
  return {...alignment,version:2,words,segments:timedSegments(alignment.text,words),timing:'声波边界候选（待校准）',endBasis:'acoustic-energy-candidate',
    acoustic:{step:envelope.step,threshold:envelope.threshold,trimmedUnits:trimmed},
    warning:'起点来自识别，终点结合声波静音边界估计；弱音和噪声可能影响候选。可逐字试听和校时，未完成人工听审。'};
}
export function calibrateBoundaries(alignment,boundaries,{confirmedText=false}={}) {
  if(!alignment.applicable&&confirmedText!==true)throw Error('识别文字未完全匹配，须先逐项核对原台词确实已读出，再人工标记缺失起止');
  const source=calibrationDraft(alignment),units=alignmentUnits(source);
  if(!Array.isArray(boundaries)||boundaries.length!==units.length)throw Error('校准项必须完整对应本次识别字词');
  const words=source.words.map(w=>({...w}));
  for(const [index,b] of boundaries.entries()){
    if(!b||!Number.isFinite(b.from)||!Number.isFinite(b.until)||b.from<0||b.until>alignment.duration||b.until-b.from<.01||index>0&&b.from<boundaries[index-1].until-.000001)throw Error(`第 ${index+1} 项起止越界、倒序或与前项重叠`);
    for(const i of units[index].indices){words[i].from=b.from;words[i].until=b.until;delete words[i].needsTiming;}
  }
  return {...alignment,version:2,applicable:true,...(!alignment.applicable?{transcriptReconciled:true}:{}),words,segments:timedSegments(alignment.text,words),timing:'人工校准起止（待完整听审）',endBasis:'manual-calibration',
    warning:'起止由操作者校准；全片音画与听感仍须按正常速度检查。'};
}

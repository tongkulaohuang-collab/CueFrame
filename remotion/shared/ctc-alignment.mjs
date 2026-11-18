import {normalizedChars} from './voice-alignment.mjs';
import {timedSegments,refineAcousticBoundaries} from './speech-boundaries.mjs';
import {readNumber,ambiguousNumberReading} from './spoken-reading.mjs';
export {canonicalSpokenText,ambiguousNumberReading} from './spoken-reading.mjs';

// CTC token evidence is frame-level acoustic alignment, not phoneme truth.
// Numeric spans keep one measured interval; no invented timestamps per digit.
export function spokenAlignmentUnits(text,vocab,{lang='zh'}={}){
 if(ambiguousNumberReading(text))throw Error('正负号、范围、分数或年份的读法需明确；保留基础定位与人工校准');
 const chars=normalizedChars(text),units=[];
 for(let i=0;i<chars.length;){const c=chars[i];let end=i+1,spoken=c.c;
  if(lang==='zh'&&/\d/.test(c.c)){
   const match=text.slice(c.start).normalize('NFKC').match(/^\d+(?:\.\d+)?%?/u)[0];
   const until=c.start+match.length;while(end<chars.length&&chars[end].start<until)end++;
   spoken=readNumber(match);
  }else if(!/\p{Script=Han}/u.test(c.c)){
   while(end<chars.length&&!/\p{Script=Han}/u.test(chars[end].c)&&chars[end].start===chars[end-1].end)end++;
   spoken=chars.slice(i,end).map(v=>v.c).join('');
  }
  const part=chars.slice(i,end),symbols=[...spoken].map(v=>vocab[v]!==undefined?v:v.toUpperCase()),ids=symbols.map(v=>vocab[v]);
  if(ids.some(v=>!Number.isInteger(v)))throw Error('当前声学词表不支持：'+text.slice(part[0].start,part.at(-1).end)+'；保留原定位');
  units.push({text:text.slice(part[0].start,part.at(-1).end),chars:part,spoken,symbols,ids});i=end;
 }
 if(!units.length||units.reduce((n,u)=>n+u.ids.length,0)>1500)throw Error('强制对齐稿件为空或过长');
 return units;
}
export function ctcViterbi(logits,{frames,vocabSize,targets,blank=0,frameSeconds=.02}){
 if(!frames||!targets.length||logits.length!==frames*vocabSize||!targets.every(v=>Number.isInteger(v)&&v>=0&&v<vocabSize&&v!==blank))throw Error('CTC 输入或词表无效');
 const states=targets.length*2+1;if(frames<targets.length||states*frames>25000000)throw Error('CTC 音频与稿件长度不匹配');
 const back=new Uint8Array(states*frames),logZ=new Float64Array(frames),greedy=[];let oldGreedy=-1;
 let prior=new Float64Array(states).fill(-Infinity);prior[0]=0;
 for(let t=0;t<frames;t++){
  const offset=t*vocabSize;let max=-Infinity,best=blank;
  for(let k=0;k<vocabSize;k++)if(logits[offset+k]>max){max=logits[offset+k];best=k;}
  let total=0;for(let k=0;k<vocabSize;k++)total+=Math.exp(logits[offset+k]-max);const z=max+Math.log(total);logZ[t]=z;
  if(best!==blank&&best!==oldGreedy)greedy.push({id:best,from:t*frameSeconds});oldGreedy=best;
  const next=new Float64Array(states).fill(-Infinity);
  for(let s=0;s<states;s++){
   const token=s%2?targets[(s-1)/2]:blank;let value=prior[s],step=0;
   if(s>0&&prior[s-1]>value){value=prior[s-1];step=1;}
   if(s>1&&s%2&&token!==targets[(s-3)/2]&&prior[s-2]>value){value=prior[s-2];step=2;}
   next[s]=value+logits[offset+token]-z;back[t*states+s]=step;
  }prior=next;
 }
 let state=prior.at(-1)>prior.at(-2)?states-1:states-2;
 if(!Number.isFinite(prior[state]))throw Error('声音中未找到完整的稿件路径');
 const spans=targets.map(id=>({id,first:Infinity,last:-1,sum:0,count:0}));
 for(let t=frames-1;t>=0;t--){if(state%2){const span=spans[(state-1)/2];span.first=Math.min(span.first,t);span.last=Math.max(span.last,t);span.sum+=logits[t*vocabSize+span.id]-logZ[t];span.count++;}state-=back[t*states+state];}
 if(spans.some(s=>!s.count))throw Error('声音中存在未定位字词');
 return {spans:spans.map(s=>({from:s.first*frameSeconds,until:(s.last+1)*frameSeconds,score:Math.exp(s.sum/s.count),frames:s.count})),greedy,frameSeconds};
}
export function forcedAlignmentResult(base,units,aligned,{duration,frameSeconds=.02,envelope,transcriptGuard}={}){
 let at=0;const words=[],scores=[];
 for(const [tokenIndex,u] of units.entries()){
  const spans=aligned.spans.slice(at,at+u.ids.length);at+=u.ids.length;
  const from=spans[0].from,until=Math.min(duration,spans.at(-1).until),score=Math.exp(spans.reduce((n,s)=>n+Math.log(Math.max(1e-12,s.score)),0)/spans.length);
  scores.push(score);for(const c of u.chars)words.push({...c,from,until,token:u.text,tokenIndex,score,spoken:u.spoken,ctcAnchor:{from,until}});
 }
 const low=scores.map((v,i)=>v<.05?i:-1).filter(i=>i>=0),mean=Math.exp(scores.reduce((n,s)=>n+Math.log(Math.max(1e-12,s)),0)/scores.length);
 // A forced path exists even for wrong text. Keep independent ASR and uncertainty gates.
 const acousticUsable=mean>=.12&&low.length<=Math.max(1,Math.floor(scores.length*.12));
 const transcriptUsable=transcriptGuard?transcriptGuard.matches:base.coverage===1&&base.precision===1;
 const applicable=acousticUsable&&transcriptUsable;
 // Blank CTC frames are not silence. Preserve anchors and estimate full spoken
 // intervals up to the next acoustic anchor, trimming only measured quiet tails.
 let bounded=words;
 if(envelope){const extended=words.map(w=>({...w,until:words.find(n=>n.tokenIndex>w.tokenIndex)?.from??duration}));bounded=refineAcousticBoundaries({...base,applicable:true,words:extended},envelope).words;}
 return {...base,version:3,words:bounded,segments:timedSegments(base.text,bounded,{gap:envelope ? .18 : .65}),applicable,duration,
  timing:'声学强制定位与尾界候选（待听审）',endBasis:'ctc-anchor-energy-tail',
  forced:{frameSeconds,meanScore:mean,lowConfidenceUnits:low,acousticUsable,transcriptUsable,transcriptGuard,asrCoverage:base.coverage,asrPrecision:base.precision,phonemeAligned:false,endMethod:envelope?'energy-tail-capped-by-next-anchor':'ctc-emission-span'},
  warning:applicable?'原稿直接与声学帧对齐，字词终点结合声波静音估计。原识别差异与低置信区间保留，需正常速度核对；20ms 帧步长不代表20ms绝对误差。':'已计算声学路径，但稿件读音差异或低置信区间未通过检查，保留原配音与字幕；请核对错稿、漏读或局部校准。'};
}

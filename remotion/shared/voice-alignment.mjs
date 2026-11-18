// ASR token ONSETS, not forced alignment or measured phoneme endings.
import {ambiguousNumberReading,spokenReadingUnits} from './spoken-reading.mjs';
export const ALIGNMENT_VERSION=1;
export function normalizedChars(text) {
  const out=[];let at=0;
  for(const raw of String(text||'')) {const value=raw.normalize('NFKC').toLowerCase();
    for(const c of value)if(/[\p{L}\p{N}]/u.test(c))out.push({c,start:at,end:at+raw.length});at+=raw.length;}
  return out;
}
export function alignRecognizedText(text,result,duration) {
  const wanted=normalizedChars(text),heard=[];
  if(!wanted.length||wanted.length>1500)throw Error('本段台词应为 1–1500 个字母或汉字');
  if(!Array.isArray(result.tokens)||result.tokens.length!==result.timestamps?.length||!result.tokens.length)throw Error('模型未返回字词起点');
  result.tokens.forEach((token,i)=>{
    const from=result.timestamps[i],until=result.timestamps[i+1]??duration;
    if(!Number.isFinite(from)||!Number.isFinite(until)||from<0||until<=from||until>duration+.03)throw Error('字词时间缺失、越界或倒序');
    for(const c of normalizedChars(token))heard.push({...c,token,tokenIndex:i,from,until:Math.min(duration,until)});
  });
  if(heard.length>2500)throw Error('识别结果过长');
  const cols=heard.length+1,dp=Array.from({length:wanted.length+1},()=>new Uint16Array(cols));
  for(let i=1;i<=wanted.length;i++)for(let j=1;j<cols;j++)dp[i][j]=wanted[i-1].c===heard[j-1].c?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  let i=wanted.length,j=heard.length;const words=[];
  while(i&&j){if(wanted[i-1].c===heard[j-1].c){words.push({...wanted[i-1],...{from:heard[j-1].from,until:heard[j-1].until,token:heard[j-1].token,tokenIndex:heard[j-1].tokenIndex}});i--;j--;}else if(dp[i-1][j]>=dp[i][j-1])i--;else j--;}
  words.reverse();
  let coverage=words.length/wanted.length,precision=words.length/Math.max(1,heard.length),normalization;
  const ambiguous=ambiguousNumberReading(text);
  if(!ambiguous&&(coverage!==1||precision!==1)&&/\p{Script=Han}/u.test(text)&&/\d/u.test(text.normalize('NFKC'))){
    const units=spokenReadingUnits(text),expanded=[];
    result.tokens.forEach((token,index)=>{for(const unit of spokenReadingUnits(token)||[])for(const c of unit.spoken)expanded.push({c,tokenIndex:index,from:result.timestamps[index],until:Math.min(duration,result.timestamps[index+1]??duration)});});
    if(units&&units.map(u=>u.spoken).join('')===expanded.map(u=>u.c).join('')){
      let offset=0;const groups=[];
      for(const unit of units){const chars=wanted.filter(c=>c.start>=unit.start&&c.end<=unit.end),part=expanded.slice(offset,offset+[...unit.spoken].length);offset+=part.length;
        if(!chars.length)continue;
        const previous=groups.at(-1),first=part[0],last=part.at(-1);
        if(previous&&first.tokenIndex<=previous.lastToken){previous.chars.push(...chars);previous.until=last.until;previous.lastToken=last.tokenIndex;previous.spoken+=unit.spoken;}
        else groups.push({chars,from:first.from,until:last.until,firstToken:first.tokenIndex,lastToken:last.tokenIndex,spoken:unit.spoken});
      }
      words.splice(0,words.length,...groups.flatMap((g,index)=>g.chars.map(c=>({...c,from:g.from,until:g.until,token:text.slice(g.chars[0].start,g.chars.at(-1).end),tokenIndex:index,spoken:g.spoken,sourceTokenRange:[g.firstToken,g.lastToken]}))));
      coverage=precision=1;normalization={method:'exact-chinese-number-reading',measuredNumberSpans:true};
    }
  }
  const applicable=!ambiguous&&coverage===1&&precision===1;
  const segments=[];
  if(applicable){let start=0;const cuts=[...String(text).matchAll(/[，。！？；,.!?;]+\s*/gu)].map(m=>m.index+m[0].length);if(cuts.at(-1)!==text.length)cuts.push(text.length);
    for(const end of cuts){const part=words.filter(w=>w.start>=start&&w.start<end);if(part.length)segments.push({text:text.slice(start,end).trim(),from:part[0].from,until:part.at(-1).until});start=end;}
    // English subwords may share a token boundary across punctuation: merge instead of overlapping.
    for(let k=1;k<segments.length;)if(segments[k].from<segments[k-1].until){segments[k-1].text+=segments[k].text;segments[k-1].until=segments[k].until;segments.splice(k,1);}else k++;
  }
  return {version:1,text,recognized:result.text,coverage,precision,applicable,words,segments,...(normalization?{normalization}:{}),...(ambiguous?{readingReviewRequired:true}:{}),
    timing:'本地字词起点（待听审）',endBasis:'next-token-or-audio-end',
    warning:ambiguous?'年份、正负号、范围、分数、时间或分组数字的读法需核对；保留原配音和字幕，不自动套用数量读法。':applicable?'字词起点来自识别；字幕结束沿用下一字词起点或音轨终点，仍须正常速度听审。':'识别与台词不完全一致，保留原配音和原字幕时间。请核对漏读、数字读法或手动标记。'};
}
export function currentAlignment(shot,asset,lang) {
  const a=shot.voiceAlignment?.[lang];
  return [1,2,3].includes(a?.version)&&a.assetId===asset?.id&&a.text===shot[lang]&&a.applicable&&a.receiptId?a:null;
}
export function quoteOnset(alignment,quote,occurrence=1) {
  if(!alignment?.applicable||!quote?.trim())throw Error('请先采用当前配音的字词定位结果');
  if(!Number.isInteger(occurrence)||occurrence<1)throw Error('台词出现次数无效');
  const all=normalizedChars(alignment.text),needle=normalizedChars(quote).map(v=>v.c);
  if(!needle.length)throw Error('同步台词不能为空');
  let at=-1;for(let i=0;i<occurrence;i++){at=all.findIndex((_,index)=>index>at&&needle.every((c,k)=>all[index+k]?.c===c));if(at<0)throw Error('同步台词在当前配音中不存在：'+quote);}
  const from=all[at].start,end=all[at+needle.length-1].end,words=alignment.words.filter(w=>w.start>=from&&w.end<=end);
  if(words.length!==needle.length)throw Error('这段台词缺少可用字词时间');
  return {from:words[0].from,until:words.at(-1).until,quote,precision:alignment.timing,receiptId:alignment.receiptId};
}

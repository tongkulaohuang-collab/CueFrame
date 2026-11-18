import {pinyin} from 'pinyin-pro';
import {canonicalSpokenText,ambiguousNumberReading} from '../shared/ctc-alignment.mjs';
export function transcriptGuard(text,recognized){
 const expected=canonicalSpokenText(text),actual=canonicalSpokenText(recognized);
 const reading=t=>pinyin(t,{toneType:'num',type:'array',nonZh:'consecutive'});
 const a=reading(expected),b=reading(actual),matches=!ambiguousNumberReading(text)&&!ambiguousNumberReading(recognized)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 return {matches,exactNormalized:expected===actual,method:'number-reading-and-contextual-toned-pinyin',expected,actual,
  differences:[...expected].flatMap((c,i)=>c!==[...actual][i]?[{index:i,expected:c,actual:[...actual][i]??'',sameReading:a[i]===b[i]}]:[])};
}

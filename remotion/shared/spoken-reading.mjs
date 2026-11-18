// One conservative reading for ordinary Chinese quantities. Dates, ranges,
// signed numbers and fractions need an explicit reading instead of a guess.
const digits='零一二三四五六七八九';
export function chineseInteger(raw){
 if(raw.length>9||raw.length>1&&raw[0]==='0')return [...raw].map(c=>digits[Number(c)]).join('');
 const n=Number(raw);if(n<10)return digits[n];
 const group=value=>{let out='',zero=false;for(let p=3;p>=0;p--){const d=Math.floor(value/10**p)%10;if(d){if(zero)out+='零';out+=digits[d]+['','十','百','千'][p];zero=false;}else if(out)zero=true;}return out;};
 let value=n,out='';for(const [size,suffix] of [[1e8,'亿'],[1e4,'万'],[1,'']]){const g=Math.floor(value/size);value%=size;if(g){if(out&&g<1000)out+='零';out+=group(g)+suffix;}}
 return out.replace(/^一十/,'十');
}
export const readNumber=match=>{const [a,b]=match.replace('%','').split('.');return (match.endsWith('%')?'百分之':'')+chineseInteger(a)+(b?'点'+[...b].map(v=>digits[+v]).join(''):'');};
export const canonicalSpokenText=text=>String(text).normalize('NFKC').replace(/\d+(?:\.\d+)?%?/gu,readNumber).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const ambiguousNumberReading=text=>/[+\-−]\s*\d|\d\s*[/~—–:：]\s*\d|\d{4}年|\d{1,3}(?:,\d{3})+(?:\.\d+)?/u.test(String(text).normalize('NFKC'));

// Preserve the written span for a whole spoken number. Do not manufacture a
// timestamp for each written digit, decimal point or percent sign.
export function spokenReadingUnits(text){
 const normalized=String(text).normalize('NFKC');
 if(normalized.length!==String(text).length)return null;
 return [...normalized.matchAll(/\d+(?:\.\d+)?%?|[\p{L}\p{N}]/gu)].map(m=>({start:m.index,end:m.index+m[0].length,spoken:/^\d/u.test(m[0])?readNumber(m[0]):m[0].toLowerCase(),numeric:/^\d/u.test(m[0])}));
}

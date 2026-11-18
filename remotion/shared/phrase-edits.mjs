import {currentAlignment,quoteOnset} from './voice-alignment.mjs';
import {validateGraphics} from './graphics-state.mjs';

const fail=s=>{throw Error('词组编辑：'+s);};
export function phraseRange(text,phrase,occurrence=1){
  if(typeof phrase!=='string'||!phrase.trim()||!Number.isInteger(occurrence)||occurrence<1||occurrence>100)fail('请输入完整词组和有效出现次数');
  let start=-1;for(let i=0;i<occurrence;i++){start=text.indexOf(phrase,start+1);if(start<0)fail('画面文字中找不到这一次词组');}
  return {start,end:start+phrase.length};
}
export function validatePhraseEdits(edits){
  if(edits==null)return;
  if(!Array.isArray(edits)||edits.length>40||new Set(edits.map(e=>e?.id)).size!==edits.length)fail('每段最多40项且编号须唯一');
  for(const e of edits){
    if(!e||typeof e.id!=='string'||!e.id||typeof e.nodeId!=='string'||!e.nodeId||typeof e.text!=='string'||!e.text.length||e.text.length>300||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||e.end>e.text.length||!['reveal','emphasis'].includes(e.mode)||!/^#[0-9a-f]{6}$/i.test(e.color||''))fail('对象、完整文字、范围或效果无效');
    const t=e.timing;
    if(!t||!['manual','voice'].includes(t.kind))fail('请选择手动时间或台词定位');
    if(t.kind==='manual'&&(![t.from,t.until].every(Number.isFinite)||t.from<0||t.until<=t.from||t.until>3600))fail('起止时间须递增且在本段以内');
    if(t.kind==='voice'&&(typeof t.quote!=='string'||!t.quote.trim()||t.quote.length>120||!Number.isInteger(t.occurrence)||t.occurrence<1||t.occurrence>100||!Number.isFinite(t.hold)||t.hold<0||t.hold>3))fail('台词、出现次数或延长时间无效');
  }
}
export function resolvePhraseEdits(shot,row,lang,fps){
  validatePhraseEdits(shot.phraseEdits);
  return (shot.phraseEdits||[]).map(e=>{
    const duration=row.frames/fps,t=e.timing;let from=t.from,until=t.until,precision='手动时间（待看片）',receiptId;
    if(t.kind==='voice'){
      const voice=row.voices?.find(v=>v.asset.role===lang),a=currentAlignment(shot,voice?.asset,lang),q=quoteOnset(a,t.quote,t.occurrence),offset=(voice?.from||0)/fps;
      from=q.from+offset;until=Math.min(duration,q.until+offset+t.hold);precision=q.precision;receiptId=q.receiptId;
    }
    if(!Number.isFinite(from)||!Number.isFinite(until)||from<0||until<=from||until>duration)fail('词组时间超出当前镜头，请重新定位');
    return {...e,from,until,precision,...(receiptId?{receiptId}:{})};
  });
}
export function applyPhraseEdits(nodes,edits,duration,{replaceAutomatic=false}={}){
  const groups=new Map();
  for(const e of edits||[]){
    const n=nodes.find(n=>n.id===e.nodeId);
    if(!n?.text||n.text.value!==e.text)fail('画面文字或对象已改变，请重新选择词组：'+e.nodeId);
    if(!groups.has(n))groups.set(n,[]);groups.get(n).push(e);
  }
  for(const [node,list] of groups){
    const g=node.graphics??={version:1,tracks:[],morphs:[],textStates:[]};
    const original=g.textCues||[];
    g.textCues=[...original.filter(c=>!replaceAutomatic||!list.some(e=>e.mode===c.mode&&e.start<c.end&&e.end>c.start)),...list.map(({start,end,from,until,mode,color})=>({start,end,from,until,mode,color}))];
    validateGraphics(node,duration);
  }
  return nodes;
}

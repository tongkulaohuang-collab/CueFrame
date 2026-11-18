import test from 'node:test';
import assert from 'node:assert/strict';
import {alignRecognizedText,quoteOnset} from '../shared/voice-alignment.mjs';
import {selectAlignmentCandidate} from '../shared/alignment-selection.mjs';
import {alignmentUnits,refineAcousticBoundaries,speechEnvelope} from '../shared/speech-boundaries.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {nodeVisualState} from '../shared/graphics-state.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {renderConcurrency} from '../shared/render-settings.mjs';
import {captionPhrases,displayCaptions} from '../shared/overlays.mjs';
const recognized=text=>{const tokens=[...text.replace(/[^\p{L}\p{N}]/gu,'')];return {text,tokens,timestamps:tokens.map((_,i)=>.2+i*.1)};};
test('Chinese number reading uses measured spans and distinguishes repeated quantities',()=>{
 const r=recognized('先增加百分之十二点五，再增加百分之十二点五');
 const a=alignRecognizedText('先增加12.5%，再增加12.5%。',r,3);
 assert.equal(a.applicable,true);assert.equal(a.normalization.method,'exact-chinese-number-reading');
 const first=quoteOnset(a,'12.5%',1),second=quoteOnset(a,'12.5%',2);
 assert.ok(first.until-first.from>.5);assert.ok(second.from>first.until);
 assert.equal(new Set(a.words.filter(w=>w.start>=3&&w.end<=7).map(w=>w.from)).size,1);
 assert.equal(alignmentUnits(a).filter(u=>u.text==='125').length,2);
});
test('number conversion refuses changed quantity, extra words and missing reads',()=>{
 for(const text of ['增加百分之十五','增加百分之十二点五左右','增加十二点五']){
   assert.equal(alignRecognizedText('增加12.5%。',recognized(text),4).applicable,false,text);
 }
});
test('ambiguous signs, fractions, clock times and dates cannot pass the basic path',()=>{
 for(const text of ['降低-10度','降低− 10度','2026年开始','比例1/2','时间10:30','约1,000个']){
  const a=alignRecognizedText(text,recognized(text),5);assert.equal(a.applicable,false,text);assert.equal(a.readingReviewRequired,true);
 }
});
test('mixed English words and a Chinese quantity retain source token evidence',()=>{
 const a=alignRecognizedText('PNG压缩率10%。',{text:'PNG压缩率百分之十',tokens:['PNG','压','缩','率','百','分','之','十'],timestamps:[.2,.5,.6,.7,.8,.9,1,1.1]},1.5);
 assert.equal(a.applicable,true);const units=alignmentUnits(a);
 assert.equal(units[0].text,'png');assert.equal(units.at(-1).text,'10');assert.equal(units.at(-1).from,.8);
 assert.equal(alignRecognizedText('PNG压缩率10%。',recognized('JPG压缩率百分之十'),4).applicable,false);
});
test('auto fallback keeps applicable ASR and rejected CTC evidence without mislabelling precision',()=>{
 const base=alignRecognizedText('重复重复',recognized('重复重复'),1);
 const rejected={...base,applicable:false,forced:{meanScore:.01,lowConfidenceUnits:[0]},warning:'低置信'};
 const auto=selectAlignmentCandidate(base,rejected,{engine:'auto'});
 assert.equal(auto.applicable,true);assert.equal(auto.selection.used,'asr');assert.deepEqual(auto.words,base.words);
 assert.equal(auto.forced,undefined);assert.equal(auto.selection.rejectedForced.forced.meanScore,.01);
 assert.equal(selectAlignmentCandidate(base,rejected,{engine:'ctc'}).applicable,false);
 assert.equal(selectAlignmentCandidate({...base,applicable:false},rejected).applicable,false);
});
test('number units survive acoustic-tail refinement without invented digit timings',()=>{
 const a=alignRecognizedText('一共128个。',recognized('一共一百二十八个'),2);
 const samples=new Float32Array(32000).fill(.1),r=refineAcousticBoundaries(a,speechEnvelope(samples));
 assert.equal(r.applicable,true);assert.ok(r.segments.every(s=>s.until>s.from));
 const number=r.words.filter(w=>w.start>=2&&w.end<=5);assert.equal(new Set(number.map(w=>w.from)).size,1);assert.equal(new Set(number.map(w=>w.until)).size,1);
});
test('incoming causal relations wait for both bridged objects and labels, including short scenes',()=>{
 const items=[{id:'a',label:'气压'},{id:'b',label:'沸腾温度'}],style={matchCuts:true,narrationMotion:true,entityColors:{},colors:['#b83b2d','#306e64'],theme:'editorial'};
 const previousPlan=compileSemanticScene({version:1,family:'narrative',style:'editorial',items},{duration:4,filmStyle:style});
 for(const duration of [2.2,5]){
  const plan=compileSemanticScene({version:1,family:'causal',style:'editorial',items,edges:[{from:'a',to:'b'}]},{duration,filmStyle:style,previousPlan,handoff:{mode:'bridge',seconds:.6,entityIds:['a','b'],reason:'同一科学量的因果表示'}});
  validateMotion(plan);
  for(const id of ['sem-edge-0','sem-arrow-0']){const node=plan.nodes.find(n=>n.id===id);assert.equal(nodeVisualState(node,.5,plan).opacity,0);assert.equal(nodeVisualState(node,.75,plan).opacity,1);}
  const signal=plan.nodes.find(n=>n.id==='sem-signal-0');assert.ok(signal.frames.find(f=>f.opacity>0).time>=.72);assert.equal(signal.frames.at(-1).time,duration);
 }
});
test('both export paths default to one ordered browser page while explicit supported overrides remain',()=>{
 for(const v of [undefined,'',0,-1,9,'bad',1.5])assert.equal(renderConcurrency(v),1);
 for(const v of ['1','2','8'])assert.equal(renderConcurrency(v),Number(v));
});
test('long Chinese reading chunks avoid orphan characters without changing speech boundaries or text',()=>{
 const text='先限定条件：用的是敞口、与当地大气相通的普通容器。',pieces=captionPhrases(text);
 assert.equal(pieces.join(''),text);assert.ok(pieces.every(p=>p.length>=5&&p.length<=23));
 const original=[{from:76,until:213,lang:'zh',zh:text,short:true}],snapshot=structuredClone(original),shown=displayCaptions(original);
 assert.deepEqual(original,snapshot);assert.equal(shown[0].from,76);assert.equal(shown.at(-1).until,213);assert.equal(shown.map(c=>c.zh).join(''),text);
 assert.ok(shown.every(c=>c.displayTiming.includes('非词级实测')));
 assert.deepEqual(captionPhrases('PNG keeps 128 pixels.'),['PNG keeps 128 pixels.']);
});
test('causal node silhouettes remain circular through every quadrant',()=>{
 const scene={version:1,style:'editorial',family:'causal',items:[{id:'a',label:'输入'},{id:'b',label:'结果'}],edges:[{from:'a',to:'b'}]},plan=compileSemanticScene(scene);
 const coords=plan.nodes.find(n=>n.id==='sem-a').paths[0].d.match(/[-+]?(?:\d*\.)?\d+/g).map(Number);let start=coords.slice(0,2);const radius=Math.abs(start[0]);
 for(let i=2;i<coords.length;i+=6){const p1=coords.slice(i,i+2),p2=coords.slice(i+2,i+4),end=coords.slice(i+4,i+6);for(let step=1;step<10;step++){const t=step/10,u=1-t,point=[0,1].map(k=>u**3*start[k]+3*u*u*t*p1[k]+3*u*t*t*p2[k]+t**3*end[k]);assert.ok(Math.abs(Math.hypot(...point)/radius-1)<.001);}start=end;}
});

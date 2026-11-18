import test from 'node:test';
import assert from 'node:assert/strict';
import {alignRecognizedText,quoteOnset,currentAlignment} from '../shared/voice-alignment.mjs';
import {speechEnvelope,refineAcousticBoundaries,alignmentUnits,calibrationDraft,calibrateBoundaries,timedSegments} from '../shared/speech-boundaries.mjs';
import {draft,emptyShot,timeline} from '../shared/model.mjs';
import {semanticOptions} from '../shared/semantic-context.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {nodeVisualState} from '../shared/graphics-state.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {longFilms} from './fixtures/long-films.mjs';
import {filmProofFrames} from '../shared/direction.mjs';
const fixture=()=>({...alignRecognizedText('先看，结果。',{text:'先看结果',tokens:['先','看','结','果'],timestamps:[.2,.5,1.8,2.1]},3),duration:3,assetId:'audio',receiptId:'r'});
test('acoustic gaps trim long silent tails without moving ASR onsets or creating phoneme claims',()=>{
 const samples=new Float32Array(48000);for(const [from,until] of [[.2,.73],[1.8,2.39]])for(let i=from*16000;i<until*16000;i++)samples[i]=.1*Math.sin(i*.17);
 const old=fixture(),next=refineAcousticBoundaries(old,speechEnvelope(samples));
 assert.deepEqual(next.words.map(w=>w.from),old.words.map(w=>w.from));assert.ok(next.segments[0].until<.77);assert.ok(next.segments[1].until<2.43);
 assert.equal(next.endBasis,'acoustic-energy-candidate');assert.equal(old.words.at(-1).until,3);assert.match(next.timing,/待校准/);
});
test('continuous and very quiet speech are retained; no invented acoustic endpoint in silence',()=>{
 for(const level of [.1,.001,0]){const samples=Float32Array.from({length:48000},(_,i)=>Math.sin(i*.3)*level),a=refineAcousticBoundaries(fixture(),speechEnvelope(samples));assert.equal(a.words.at(-1).until,3);}
});
test('manual boundaries preserve transcript and feed phrase anchors with current receipt and audio',()=>{
 const old=fixture(),a=calibrateBoundaries(old,[{from:.22,until:.48},{from:.5,until:.75},{from:1.81,until:2.08},{from:2.1,until:2.4}]);
 assert.deepEqual(a.segments.map(x=>[x.from,x.until]),[[.22,.75],[1.81,2.4]]);assert.equal(quoteOnset(a,'结果').from,1.81);
 assert.ok(currentAlignment({zh:a.text,voiceAlignment:{zh:a}},{id:'audio'},'zh'));assert.equal(a.text,old.text);assert.equal(old.words[0].from,.2);
});
test('manual calibration rejects incomplete, reordered, overlapping or out-of-range intervals',()=>{
 const a=fixture(),b=alignmentUnits(a).map(({from,until})=>({from,until}));
 for(const bad of [b.slice(1),b.map((x,i)=>i===2?{...x,from:.1}:x),b.map((x,i)=>i===3?{...x,until:3.01}:x),b.map((x,i)=>i===0?{...x,from:NaN}:x)])assert.throws(()=>calibrateBoundaries(a,bad));
 assert.throws(()=>calibrateBoundaries({...a,applicable:false},b),/未完全/);
});
test('English tokens share bounds; reading subdivision uses real timestamps and preserves words',()=>{
 const text='First keep the original document, then check the result.';
 const tokens=text.toLowerCase().match(/[a-z]+/g),a={...alignRecognizedText(text,{text,tokens,timestamps:tokens.map((_,i)=>.2+i*.6)},tokens.length*.6+.3),duration:tokens.length*.6+.3};
 const b=calibrateBoundaries(a,alignmentUnits(a).map(({from,until})=>({from,until})));assert.equal(alignmentUnits(b).length,tokens.length);
 assert.equal(b.segments.map(s=>s.text).join('').replace(/\s/g,''),text.replace(/\s/g,''));assert.ok(b.segments.every(s=>b.words.some(w=>w.from===s.from)));
 const chinese=fixture();assert.equal(timedSegments(chinese.text,chinese.words).map(x=>x.text).join(''),chinese.text);
});
test('narration focus uses real quote onsets, follows target geometry, and leaves data scale unchanged',()=>{
 const p=draft('science');p.assets=[{id:'audio',kind:'audio',role:'zh',duration:3}];const a=fixture();
 p.shots=[{...emptyShot(),id:'shot',seconds:4,zh:a.text,assetIds:['audio'],voiceAlignment:{zh:a},semanticScene:{version:1,family:'comparison',title:'',style:'editorial',unit:'',items:[{id:'first',label:'先看',value:20,to:30},{id:'second',label:'结果',value:80,to:90}]}}];
 const row=timeline(p).rows[0],options=semanticOptions(p,p.shots[0],row),plan=compileSemanticScene(p.shots[0].semanticScene,options);
 assert.deepEqual(options.focusBeats.map(b=>b.from),[.2,1.8]);validateMotion(plan);
 const ring=plan.nodes.find(n=>n.id==='focus-first-0'),target=plan.nodes.find(n=>n.id==='sem-first');
 for(const t of [0,3.8,.8,.1,1.3]){assert.equal(nodeVisualState(ring,t,plan).graphics.paths[0].d,nodeVisualState(target,t,plan).graphics.paths[0].d);}
 assert.equal(nodeVisualState(ring,.1,plan).opacity,0);assert.ok(nodeVisualState(ring,.8,plan).opacity>.99);assert.equal(nodeVisualState(ring,2.4,plan).opacity,0);
 delete p.shots[0].voiceAlignment;assert.equal(semanticOptions(p,p.shots[0],row).focusBeats,undefined);
});
test('long-film fixtures contain independent coherent sections, with one deliberately measured pause',()=>{
 assert.equal(longFilms.length,2);for(const f of longFilms){assert.ok(f.shots.length>=16);assert.equal(new Set(f.shots.map(s=>s.text)).size,f.shots.length);assert.ok(f.shots.reduce((n,s)=>n+[...s.text].length,0)>1000);}
 const scene=longFilms[1].shots[0].scene;assert.notEqual(scene.items,longFilms[1].shots[8].scene.items);assert.ok(longFilms[1].shots.some(s=>s.pauseSeconds===1.6));
});
test('mismatched transcripts remain blocked until operator supplies missing boundaries and confirms spoken text',()=>{
 const a={...alignRecognizedText('先看结果。',{text:'先看果',tokens:['先','看','果'],timestamps:[.2,.5,2.1]},3),duration:3};
 const candidate=calibrationDraft(a),units=alignmentUnits(candidate),bounds=units.map(({from,until})=>({from,until}));
 assert.equal(candidate.applicable,false);assert.equal(units[2].from,null);assert.equal(units[2].until,null);
 assert.throws(()=>calibrateBoundaries(a,bounds,{confirmedText:true}),/越界/);
 const fixed=[{from:.2,until:.48},{from:.5,until:.8},{from:1.8,until:2.05},{from:2.1,until:2.5}];
 for(const confirmedText of [false,'true',1])assert.throws(()=>calibrateBoundaries(a,fixed,{confirmedText}),/未完全/);
 const final=calibrateBoundaries(a,fixed,{confirmedText:true});assert.equal(final.applicable,true);assert.equal(final.coverage,.75);assert.equal(final.transcriptReconciled,true);assert.equal(quoteOnset(final,'结果').from,1.8);assert.equal(a.words.length,3);
});
test('English transcript repair leaves an incomplete word untimed, rather than inventing letter timing',()=>{
 const a={...alignRecognizedText('Keep the cat.',{text:'keep the car',tokens:['keep','the','car'],timestamps:[.1,.6,1]},2),duration:2};
 const units=alignmentUnits(calibrationDraft(a));assert.deepEqual(units.map(u=>u.text),['keep','the','cat']);assert.equal(units.at(-1).from,null);
});
test('early narration brings narrative objects and structure labels into view before emphasis',()=>{
 for(const family of ['narrative','structure']){
  const scene={version:1,family,title:'',style:'editorial',unit:'',items:[{id:'one',label:'原始文件'},{id:'two',label:'修改副本'},{id:'three',label:'核对结果'}]};
  const focusBeats=scene.items.map((v,i)=>({entityId:v.id,from:1+i,until:1.9+i}));
  const plan=compileSemanticScene(scene,{duration:22,width:720,height:960,filmStyle:{theme:'editorial',entityColors:{},start:.18,settle:.67},focusBeats});validateMotion(plan);
  for(const [i,b] of focusBeats.entries())for(const id of ['sem-'+b.entityId,'sem-label-'+b.entityId,'focus-'+b.entityId+'-'+i]){
   const state=nodeVisualState(plan.nodes.find(n=>n.id===id),b.from+.2,plan);assert.ok(state.opacity>.99,`${family} ${id} must be visible while spoken`);
  }
  assert.ok(!plan.nodes.some(n=>n.id==='sem-story-cursor'));
 }
});
test('long-film preflight covers each shot entrance and exit without seeking outside a cut',()=>{
 const film={canvas:{frames:960},rows:[{from:0,until:450,frames:480,scene:{canvas:{frames:480,fps:24}}},{from:450,until:960,frames:510,scene:{canvas:{frames:510,fps:24}}}]};
 const frames=filmProofFrames(film);for(const frame of [0,449,450,959])assert.ok(frames.includes(frame));assert.ok(frames.every(f=>f>=0&&f<960));assert.equal(new Set(frames).size,frames.length);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {alignRecognizedText,quoteOnset,currentAlignment} from '../shared/voice-alignment.mjs';
import {filmStyleContext,filmStyleIssues,reconcileFilmStyle} from '../shared/film-style.mjs';
import {draft,emptyShot,timeline,update} from '../shared/model.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {graphicsState} from '../shared/graphics-state.mjs';
import {semanticCase} from './fixtures/semantic-cases.mjs';
import {repairPlan} from '../shared/content-contract.mjs';
import {designInputKey} from '../shared/director-quality.mjs';
import {filmProps} from '../shared/film.mjs';
import {srt} from '../server/film-package.mjs';
import {qualityFilms} from './fixtures/quality-films.mjs';
import {startAlignment,applyAlignment,assertAlignmentReceipts} from '../server/voice-alignment.mjs';
import {persistJob,write,get} from '../server/store.mjs';

const result=(text,times)=>({text,tokens:[...text],timestamps:times});
test('new projects start with a film-wide style; reopening legacy projects does not opt them in',()=>{
 assert.equal(draft('science').filmStyle.preset,'editorial');assert.equal(draft('product').filmStyle.preset,'minimal');
 const legacy=draft();legacy.topic='旧项目保留原画面';delete legacy.filmStyle;assert.equal(update(legacy,structuredClone(legacy)).filmStyle,undefined);
});
test('held-out rearrangement changes only the intended scene, preserving the narrative cause order',()=>{
 const film=qualityFilms.find(f=>f.id==='story-holdout');
 assert.deepEqual(film.shots[0].scene.items.map(v=>v.id),['original','draft','checked']);
 assert.deepEqual(film.shots[2].scene.items.map(v=>v.id),['checked','draft','original']);
 assert.notEqual(film.shots[0].scene.items,film.shots[2].scene.items);
});
test('rounded ratios disclose approximation and quantities with different units use division, not comparable bars',()=>{
 const scene=semanticCase('ratio');scene.items[0].value=7;scene.items[1].value=42;
 const options={width:720,height:960,fps:24,duration:8};
 const plan=compileSemanticScene(scene,options);assert.match(plan.nodes.find(n=>n.id==='sem-result').text.value,/≈ 0.167/);
 scene.items[0].value=20;scene.items[1].value=10;scene.unit='m/s';
 const dimensional=compileSemanticScene(scene,options);assert.match(dimensional.nodes.find(n=>n.id==='sem-result').text.value,/= 2 m\/s/);
 assert.ok(dimensional.nodes.find(n=>n.id==='sem-division-line'));assert.equal(dimensional.nodes.find(n=>n.id==='sem-'+scene.items[0].id).text.value,'20');
});
test('alignment retains real onsets and explicitly identifies estimated endings',()=>{
 const a=alignRecognizedText('先看，结果。',result('先看结果',[.2,.43,1.9,2.2]),3);
 assert.equal(a.applicable,true);assert.deepEqual(a.words.map(w=>w.from),[.2,.43,1.9,2.2]);assert.equal(a.endBasis,'next-token-or-audio-end');
 assert.equal(a.segments[1].from,1.9);assert.equal(quoteOnset(a,'结果').from,1.9);
});
test('missing, extra, wrong and silent recognition never author timing for missing words',()=>{
 for(const heard of ['先结','先看结果啊','先着结果']){const a=alignRecognizedText('先看结果',result(heard,[...heard].map((_,i)=>i*.3)),3);assert.equal(a.applicable,false);assert.deepEqual(a.segments,[]);}
 assert.throws(()=>alignRecognizedText('你好',result('',[]),2),/起点/);
 assert.throws(()=>alignRecognizedText('你好',result('你好',[1,.2]),2),/倒序/);
});
test('repeated phrase binding is explicit and unknown quotes cannot become guessed times',()=>{
 const a=alignRecognizedText('看看，再看看。',result('看看再看看',[.1,.3,1,2,2.3]),3);
 assert.equal(quoteOnset(a,'看看',2).from,2);assert.throws(()=>quoteOnset(a,'没说的话'),/不存在/);
});
test('quote positions use Unicode characters, not UTF-16 code units',()=>{
 const a=alignRecognizedText('𠮷看结果',result('𠮷看结果',[.1,.3,1,1.3]),2);assert.equal(quoteOnset(a,'结果').from,1);
});
test('English multi-letter tokens preserve shared onset without fabricating letter timings',()=>{
 const a=alignRecognizedText('Hello, world!',{text:'HELLO WORLD',tokens:['hello','world'],timestamps:[.2,1.4]},2.3);
 assert.equal(a.applicable,true);assert.equal(new Set(a.words.slice(0,5).map(w=>w.from)).size,1);
});
test('changed text or chosen audio invalidates an adopted alignment',()=>{
 const s={zh:'你好',voiceAlignment:{zh:{version:1,receiptId:'r',text:'你好',assetId:'a',applicable:true}}};
 assert.ok(currentAlignment(s,{id:'a'},'zh'));assert.equal(currentAlignment({...s,zh:'你们好'},{id:'a'},'zh'),null);assert.equal(currentAlignment(s,{id:'b'},'zh'),null);
});
function fixture(){const p={...draft('product'),topic:'跨镜头质量验证',id:'quality-fixture',productionMode:'model-process',flow:'direct',pauses:[],width:960,height:540,filmStyle:{version:1,preset:'technical'}};
 p.shots=[0,1,2].map(i=>({...emptyShot(),id:'s'+i,zh:'先看，结果。',en:'',seconds:6,silentOK:true,semanticScene:semanticCase('comparison',0,'editorial'),reviewed:true}));return p;}
test('reordering entities across shots cannot swap their colors',()=>{
 const p=fixture();p.shots[1].semanticScene.items.reverse();const c=filmStyleContext(p),a=sceneProps(p,'s0').shot.motionPlan,b=sceneProps(p,'s1').shot.motionPlan;
 for(const id of Object.keys(c.entityColors))assert.equal(a.nodes.find(n=>n.id==='sem-'+id).paths[0].fill,b.nodes.find(n=>n.id==='sem-'+id).paths[0].fill);
 assert.equal(a.bg,'#0e1826');assert.equal(filmStyleIssues(p).length,0);
});
test('continuation catches incorrect end-state and unit handoff, comparison stays available',()=>{
 const p=fixture();p.shots[1].handoff={mode:'continue',reason:''};assert.match(filmStyleIssues(p).join(' '),/起值/);
 p.shots[1].semanticScene.items.forEach((v,i)=>v.value=p.shots[0].semanticScene.items[i].to);assert.equal(filmStyleIssues(p).length,0);
 p.shots[1].semanticScene.unit='km';assert.match(filmStyleIssues(p).join(' '),/单位/);
 p.shots[1].handoff={mode:'compare',reason:'比较另一组条件'};assert.equal(filmStyleIssues(p).length,0);
});
test('styles invalidate visual approval and fingerprints while preserving audio IDs',()=>{
 const p=fixture(),next=structuredClone(p);next.filmStyle.preset='minimal';const oldKey=designInputKey(p,'s0');
 const q=update(p,next);assert.ok(q.shots.every(s=>!s.reviewed));assert.notEqual(designInputKey(q,'s0'),oldKey);assert.ok(repairPlan(p,q).every(r=>r.preserveAudio&&r.stages.includes('动画')));
});
test('same transcript landmarks drive bars, counters, preview, film and exported captions',()=>{
 const p=fixture(),s=p.shots[0],a={...alignRecognizedText(s.zh,result('先看结果',[.5,.8,3,3.4]),4),assetId:'voice',receiptId:'receipt'};
 p.assets=[{id:'voice',role:'zh',kind:'audio',duration:4,src:'/media/voice.wav'}];s.assetIds=['voice'];s.voiceAlignment={zh:a};s.subtitleTracks={zh:{assetId:'voice',text:s.zh,segments:a.segments,alignmentReceipt:'receipt'}};s.semanticSync={startQuote:'先看',endQuote:'结果'};
 const plan=sceneProps(p,s.id).shot.motionPlan;assert.equal(plan.semanticModel.speechTiming.start,.5);assert.equal(plan.semanticModel.speechTiming.settle,3);
 const item=s.semanticScene.items[0],bar=plan.nodes.find(n=>n.id==='sem-'+item.id),counter=plan.nodes.find(n=>n.id==='sem-value-'+item.id);
 for(let frame=0;frame<144;frame++){const time=frame/24,max=Math.max(...s.semanticScene.items.flatMap(v=>[v.value,v.to]));const coords=graphicsState(bar,time,plan).paths[0].d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);assert.ok(Math.abs(coords[2]/(960*.48)*max-Number(graphicsState(counter,time,plan).value))<.052);}
 const film=filmProps(p);assert.deepEqual(film.rows[0].scene.shot.motionPlan,plan);assert.match(srt(film),/00:00:03,000/);assert.match(film.captions[0].timing,/待听审/);
 s.semanticSync.endQuote='不存在';assert.throws(()=>sceneProps(p,s.id),/不存在/);
});
test('short end window and reversed anchors reject the whole render',()=>{
 const s=semanticCase('comparison');assert.throws(()=>compileSemanticScene(s,{duration:6,speechTiming:{start:3,settle:2}}),/递增/);assert.throws(()=>compileSemanticScene(s,{duration:6,speechTiming:{start:1,settle:5.9}}),/0.6/);
});
test('forged receipt is rejected and wrong project cannot adopt another receipt',()=>{
 const p=fixture();p.shots[0].voiceAlignment={zh:{receiptId:'missing'}};assert.throws(()=>assertAlignmentReceipts(p),/任务不存在/);
 const j={id:'other-receipt',project:'another',type:'voice-alignment',status:'done',result:{applicable:true}};persistJob(j);assert.throws(()=>applyAlignment(p,{jobId:j.id}),/不可采用/);
});
test('film-wide numerical scale survives a cut and physical screen position continues',()=>{
 const p=fixture();p.shots[1].semanticScene.items[0].to=1000;
 const a=sceneProps(p,'s0').shot.motionPlan,b=sceneProps(p,'s1').shot.motionPlan;
 assert.equal(a.nodes.find(n=>n.id==='sem-entity-0').paths[0].d,b.nodes.find(n=>n.id==='sem-entity-0').paths[0].d);
 p.shots=p.shots.slice(0,2);p.shots.forEach((s,i)=>s.semanticScene={version:1,family:'physical',style:'technical',title:'匀速',unit:'m',items:[],parameters:{initial:i*12,speed:2}});
 const first=sceneProps(p,'s0').shot.motionPlan.nodes.find(n=>n.id==='sem-body'),second=sceneProps(p,'s1').shot.motionPlan.nodes.find(n=>n.id==='sem-body');
 assert.equal(first.frames.at(-1).x,second.frames[0].x);
});
test('saved entity registry survives whole-shot reordering and new IDs',()=>{
 const p=fixture();reconcileFilmStyle(null,p);const before=filmStyleContext(p).entityColors;
 p.shots.reverse();p.shots[0].semanticScene.items.reverse();p.shots[0].semanticScene.items.push({id:'new',label:'新对象',value:2});
 reconcileFilmStyle(null,p);for(const [id,color] of Object.entries(before))assert.equal(filmStyleContext(p).entityColors[id],color);
});

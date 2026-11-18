import test from 'node:test';
import assert from 'node:assert/strict';
import {spokenAlignmentUnits,ctcViterbi,forcedAlignmentResult} from '../shared/ctc-alignment.mjs';
import {transcriptGuard} from '../server/transcript-guard.mjs';
import {textRuns,validateGraphics,nodeVisualState,graphicsState} from '../shared/graphics-state.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {filmStyleContext,filmStyleIssues} from '../shared/film-style.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {filmProps} from '../shared/film.mjs';
import {draft,emptyShot} from '../shared/model.mjs';
import {alignRecognizedText} from '../shared/voice-alignment.mjs';
const emissions=ids=>Float32Array.from(ids.flatMap(id=>[0,1,2,3].map(v=>v===id?6:-6)));
test('CTC aligns actual emission frames with repeated characters separated by blank',()=>{
 const result=ctcViterbi(emissions([0,1,1,0,1,0,2,2,0]),{frames:9,vocabSize:4,targets:[1,1,2],blank:0,frameSeconds:.02});
 assert.deepEqual(result.spans.map(s=>[s.from,s.until]),[[.02,.06],[.08,.1],[.12,.16]]);assert.ok(result.spans.every(s=>s.score>.99));
 assert.deepEqual(result.greedy.map(t=>t.id),[1,1,2]);
});

test('independent transcript guard allows normalized numbers and homophones, rejects different readings',()=>{
 assert.equal(transcriptGuard('增加20个。','增加二十个').matches,true);
 assert.equal(transcriptGuard('它们保留。','他们保留').matches,true);
 for(const x of ['减少二十个','增加二十','增加二十一个'])assert.equal(transcriptGuard('增加20个',x).matches,false);
 assert.equal(transcriptGuard('-20','二十').matches,false);assert.throws(()=>spokenAlignmentUnits('20-30个',{}),/读法/);
});
const fixedText={id:'words',paths:[],text:{value:'增加50%，保留原件',color:'#223344',size:24},graphics:{version:1,tracks:[],morphs:[],textStates:[],textCues:[{start:0,end:6,from:1,until:2,mode:'reveal'},{start:2,end:5,from:1,until:2,mode:'emphasis',color:'#cc2211'}]}};
test('phrases keep full layout and units while visibility and keyword color follow measured cues',()=>{
 validateGraphics(fixedText,3);
 const before=textRuns(fixedText,['增加50%，','保留原件'],.5),after=textRuns(fixedText,['增加50%，','保留原件'],1.5);
 assert.equal(before.flat().map(v=>v.char).join(''),fixedText.text.value);assert.ok(before[0].every(v=>v.opacity===0));assert.ok(before[1].every(v=>v.opacity===1));
 assert.ok(after[0].every(v=>v.opacity===1));assert.equal(after[0][2].fill,'#cc2211');assert.equal(textRuns(fixedText,[fixedText.text.value],2.1)[0][2].fill,undefined);
 const bad=structuredClone(fixedText);bad.graphics.textCues[1].end=4;assert.throws(()=>validateGraphics(bad,3),/数字与单位/);
});
test('phrase ranges reject split graphemes, replacement conflicts and overlapping controls',()=>{
 const t=structuredClone(fixedText);t.text.value='a👨‍👩‍👧b';t.graphics.textCues=[{start:1,end:2,from:0,until:1,mode:'reveal'}];assert.throws(()=>validateGraphics(t,3),/完整字符/);
 const b=structuredClone(fixedText);b.graphics.textCues.push({...b.graphics.textCues[0]});assert.throws(()=>validateGraphics(b,3),/重叠/);
 const c=structuredClone(fixedText);c.graphics.textStates=[{from:1,lines:['变更']}];assert.throws(()=>validateGraphics(c,3),/固定文字/);
});
const s={version:1,family:'comparison',style:'editorial',unit:'',items:[{id:'a',label:'甲组',value:20,to:30},{id:'b',label:'乙组',value:80,to:90}]};
const style=filmStyleContext({filmStyle:{version:1,preset:'editorial',matchCuts:true,narrationMotion:true},shots:[{semanticScene:s}]});
test('reordered inputs preserve comparison positions across the cut, avoiding crossing labels',()=>{
 const previous=compileSemanticScene(s,{duration:6,filmStyle:style,comparisonMax:90});
 const nextScene={...s,items:s.items.slice().reverse().map(v=>({...v,value:v.to,to:v.to}))};
 const next=compileSemanticScene(nextScene,{duration:6,filmStyle:style,comparisonMax:90,previousPlan:previous});validateMotion(next);
 for(const id of ['sem-a','sem-b','sem-label-a','sem-label-b']){const a=previous.nodes.find(n=>n.id===id),b=next.nodes.find(n=>n.id===id);assert.equal(nodeVisualState(a,6-1/24,previous).y,nodeVisualState(b,0,next).y);}
 assert.equal(nodeVisualState(next.nodes.find(n=>n.id==='sem-a'),0,next).y,nodeVisualState(next.nodes.find(n=>n.id==='sem-a'),.4,next).y);
 assert.deepEqual(graphicsState(previous.nodes.find(n=>n.id==='sem-a'),6,previous).paths,graphicsState(next.nodes.find(n=>n.id==='sem-a'),0,next).paths);
});
test('product images switch on narration, zoom locally and preserve the crop across a continuing cut',()=>{
 const assets=[{id:'img1',kind:'image',confirmed:true,source:'fixture',license:'self'},{id:'img2',kind:'image',confirmed:true,source:'fixture',license:'self'}];
 const scene={version:1,family:'product',style:'minimal',items:[{id:'a',label:'总览',assetId:'img1',focus:{x:35,y:60,zoom:1.5}},{id:'b',label:'细节',assetId:'img2',focus:{x:70,y:40,zoom:2}}]};
 const beats=[{entityId:'a',from:1,until:2},{entityId:'b',from:3,until:5}];
 const p=compileSemanticScene(scene,{duration:6,assets,filmStyle:style,focusBeats:beats});validateMotion(p);
 assert.equal(nodeVisualState(p.nodes.find(n=>n.id==='sem-b'),3,p).opacity,1);assert.equal(nodeVisualState(p.nodes.find(n=>n.id==='sem-a'),3,p).opacity,0);
 assert.equal(nodeVisualState(p.nodes.find(n=>n.id==='sem-b'),4,p).mediaZoom,2);
 const q=compileSemanticScene({...scene,items:scene.items.slice().reverse()},{duration:6,assets,filmStyle:style,previousPlan:p});validateMotion(q);
 assert.equal(nodeVisualState(q.nodes.find(n=>n.id==='sem-b'),0,q).mediaZoom,2);assert.equal(nodeVisualState(q.nodes.find(n=>n.id==='sem-b'),.4,q).mediaZoom,1);
});
test('legacy scenes have no new entrance, while incompatible continued assets raise a review issue',()=>{
 const old=compileSemanticScene(s,{duration:6,filmStyle:{...style,matchCuts:false,narrationMotion:false}});assert.equal(old.semanticModel.matchedHandoff,undefined);
 const p={filmStyle:{version:1,preset:'minimal',matchCuts:true},shots:[{semanticScene:{...s,family:'product',items:[{id:'a',label:'图',assetId:'1'}]}},{handoff:{mode:'continue'},semanticScene:{...s,family:'product',items:[{id:'a',label:'图',assetId:'2'}]}}]};assert.ok(filmStyleIssues(p).some(v=>v.includes('更换了图片')));
});

test('three continuing narrative shots retain identities, positions and already revealed labels at every entrance frame',()=>{
 const p=draft('product');p.productionMode='model-process';p.width=720;p.height=960;p.language='zh';
 const text='原件副本结果',asset={id:'voice',kind:'audio',role:'zh',duration:4};p.assets=[asset];
 const alignment={...alignRecognizedText(text,{text,tokens:[...text],timestamps:[.3,.6,1.3,1.6,2.3,2.6]},4),duration:4,assetId:asset.id,receiptId:'fixture'};
 const items=[{id:'one',label:'原件'},{id:'two',label:'副本'},{id:'three',label:'结果'}];
 p.shots=[items,[items[2],items[1],items[0]],[items[1],items[2],items[0]]].map((order,i)=>({...emptyShot(),id:'story-'+i,seconds:5,zh:text,assetIds:[asset.id],voiceAlignment:{zh:alignment},semanticScene:{version:1,family:'narrative',style:'editorial',items:order},handoff:{mode:i?'continue':'reset',reason:'same objects'}}));
 const plans=filmProps(p).rows.map(r=>r.scene.shot.motionPlan);
 for(let i=1;i<plans.length;i++)for(const id of items.flatMap(x=>['sem-'+x.id,'sem-label-'+x.id])){
   const previous=plans[i-1],plan=plans[i],node=plan.nodes.find(n=>n.id===id),prior=nodeVisualState(previous.nodes.find(n=>n.id===id),previous.duration-1/p.fps,previous);
   for(let frame=0;frame<=p.fps;frame++){
     const current=nodeVisualState(node,frame/p.fps,plan);assert.equal(current.opacity,1,id+' stays visible');assert.equal(current.textProgress,1,id+' stays revealed');assert.equal(current.x,prior.x);assert.equal(current.y,prior.y);
   }
 }
});
test('CTC rejects impossible lengths and a repeated token without room for a blank',()=>{
 assert.throws(()=>ctcViterbi(emissions([1]),{frames:1,vocabSize:4,targets:[1,2]}));
 assert.throws(()=>ctcViterbi(emissions([1,1]),{frames:2,vocabSize:4,targets:[1,1]}),/完整/);
});
test('numeric speech normalization preserves original text offsets and measured group intervals',()=>{
 const text='从20到30，增加50%。',vocab=Object.fromEntries([...new Set('从二十到三增加百分之五')].map((v,i)=>[v,i+1]));
 const units=spokenAlignmentUnits(text,vocab);assert.equal(units.map(u=>u.spoken).join(''),'从二十到三十增加百分之五十');
 assert.deepEqual(units.find(u=>u.text==='20').chars.map(c=>c.start),[1,2]);
 assert.throws(()=>spokenAlignmentUnits('未收录字',{一:1}),/词表/);
});
test('forced low-confidence or unrelated transcripts never become applicable merely because a path exists',()=>{
 const units=spokenAlignmentUnits('先看',{先:1,看:2});
 for(const [coverage,score] of [[0,1],[1,.001]]){const r=forcedAlignmentResult({text:'先看',coverage,precision:coverage},units,{spans:[{from:.1,until:.2,score},{from:.4,until:.5,score}]},{duration:1});assert.equal(r.applicable,false);}
});

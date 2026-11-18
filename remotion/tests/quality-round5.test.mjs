import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceOK,emptyClaim,sourceTypes} from '../shared/model.mjs';
import {researchResult} from '../server/topic-research.mjs';
import {draft,emptyShot,update,validateDraft,timeline} from '../shared/model.mjs';
import {compileSemanticScene,validateSemanticBinding} from '../shared/semantic-scenes.mjs';
import {semanticOptions} from '../shared/semantic-context.mjs';
import {phraseRange,resolvePhraseEdits,applyPhraseEdits} from '../shared/phrase-edits.mjs';
import {textRuns,nodeVisualState,graphicsState} from '../shared/graphics-state.mjs';
import {alignRecognizedText} from '../shared/voice-alignment.mjs';
import {repairPlan} from '../shared/content-contract.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {filmProps} from '../shared/film.mjs';
import {validateMotion} from '../shared/motion-plan.mjs';
import {filmStyleContext,filmStyleIssues} from '../shared/film-style.mjs';
import {bridgeIssues} from '../shared/cross-handoff.mjs';

test('official technical sources are accepted without weakening the original-source requirement for secondary articles',()=>{
 const c={...emptyClaim(),type:'标准组织或官方技术文档',text:'PNG使用无损编码',title:'PNG specification',url:'https://www.w3.org/TR/png-3/',locator:'Abstract'};
 assert.equal(evidenceOK(c),true);
 assert.equal(evidenceOK({...c,type:sourceTypes[4],original:''}),false);
 assert.equal(evidenceOK({...c,locator:''}),false);
 const m={kind:'科学资料',type:c.type,title:c.title,publisher:'W3C',url:c.url,locator:c.locator,summary:c.text,use:'解释格式',rights:'仅转述事实，不复制图版'};
 assert.equal(researchResult({materials:[m]}).length,1);
});

const fixture=()=>{
 const p=draft('science');p.topic='词组编辑测试';p.productionMode='model-process';
 const a={id:'voice',kind:'audio',role:'zh',duration:4,confirmed:true,source:'test',license:'self',scriptText:'压缩压缩'};p.assets=[a];
 const alignment={...alignRecognizedText('压缩压缩',{text:'压缩压缩',tokens:['压','缩','压','缩'],timestamps:[.2,.5,2,2.5]},4),assetId:a.id,receiptId:'receipt'};
 p.shots=[{...emptyShot(),id:'s1',zh:'压缩压缩',seconds:5,assetIds:[a.id],voiceAlignment:{zh:alignment},semanticScene:{version:1,family:'comparison',style:'editorial',unit:'',items:[{id:'a',label:'压缩50%',value:50},{id:'b',label:'原始编码',value:100}]}}];return p;
};
const edit={id:'one',nodeId:'sem-label-a',text:'压缩50%',start:0,end:2,mode:'emphasis',color:'#cc2211',timing:{kind:'voice',quote:'压缩',occurrence:2,hold:.2}};
test('phrase editor resolves repeated speech against current audio, with complete range and stale binding guards',()=>{
 const p=fixture(),s=p.shots[0];s.phraseEdits=[edit];const row=timeline(p).rows[0],resolved=resolvePhraseEdits(s,row,p.voice,p.fps);
 assert.equal(resolved[0].from,2);assert.equal(resolved[0].until,4.2);assert.equal(resolved[0].receiptId,'receipt');
 const plan=compileSemanticScene(s.semanticScene,semanticOptions(p,s,row));
 const label=plan.nodes.find(n=>n.id===edit.nodeId),runs=textRuns(label,[edit.text],2.2);
 assert.equal(runs[0][0].fill,'#cc2211');assert.equal(runs[0][2].fill,undefined);
 validateSemanticBinding(plan,s.semanticScene,semanticOptions(p,s,row));
 assert.deepEqual(phraseRange('甲乙甲乙','甲乙',2),{start:2,end:4});
 assert.throws(()=>phraseRange('甲乙','甲乙',2),/找不到/);
 const stale=structuredClone(s);stale.zh='不同台词';assert.throws(()=>resolvePhraseEdits(stale,row,p.voice,p.fps),/当前配音/);
 const replaced=structuredClone(row);replaced.voices[0].asset.id='replaced';assert.throws(()=>resolvePhraseEdits(s,replaced,p.voice,p.fps),/当前配音/);
});
test('editing words invalidates visual review and preserves original claims, recordings and subtitles',()=>{
 const p=fixture();p.claims=[{...emptyClaim(),id:'claim',verified:true}];p.shots[0].claimIds=['claim'];p.shots[0].reviewed=true;
 const changed=structuredClone(p);changed.shots[0].phraseEdits=[edit];const next=update(p,changed);
 assert.equal(next.shots[0].reviewed,false);assert.equal(next.claims[0].verified,true);assert.deepEqual(next.assets,p.assets);assert.deepEqual(next.shots[0].voiceAlignment,p.shots[0].voiceAlignment);
 assert.equal(repairPlan(p,next)[0].preserveAudio,true);assert.ok(repairPlan(p,next)[0].stages.includes('动画'));
 const bad=structuredClone(next);bad.shots[0].semanticScene.items[0].label='文字已改变';assert.throws(()=>validateDraft(bad,next),/重新选择/);
});
test('manual phrase edits reject broken units, graphemes, time overflow and conflicting ranges',()=>{
 const p=fixture(),s=p.shots[0];const manual={...edit,timing:{kind:'manual',from:1,until:2}};s.phraseEdits=[manual];validateDraft(p);
 for(const patch of [{start:2,end:3},{timing:{kind:'manual',from:0,until:6}}]){s.phraseEdits=[{...manual,...patch}];assert.throws(()=>validateDraft(p));}
 s.phraseEdits=[manual,{...manual,id:'two'}];assert.throws(()=>validateDraft(p),/重叠/);
 const node={id:'x',paths:[],text:{value:'👨‍👩‍👧家',color:'#112233'}};assert.throws(()=>applyPhraseEdits([node],[{...manual,nodeId:'x',text:node.text.value,start:0,end:1,from:1,until:2}],5),/完整字符/);
});
test('freeform fixed text uses the same editable cue evaluation without mutating the original plan',()=>{
 const p=fixture(),s=p.shots[0];delete s.semanticScene;p.productionMode='standard';
 s.motionPlan={width:1280,height:720,fps:24,duration:5,nodes:[{id:'sem-label-a',text:{value:edit.text,color:'#112233'},paths:[],frames:[{time:0,x:0,y:0,opacity:1},{time:5,x:0,y:0,opacity:1}]}]};
 s.phraseEdits=[{...edit,timing:{kind:'manual',from:1,until:2}}];const result=sceneProps(p,s.id);
 assert.equal(result.shot.motionPlan.nodes[0].graphics.textCues.length,1);assert.equal(s.motionPlan.nodes[0].graphics,undefined);
});

const bridge={mode:'bridge',entityIds:['a','b'],seconds:.6,reason:'保持同一对象身份，改用新的表示解释不同属性'};
const scenes=()=>{
 const base={version:1,style:'editorial',items:[{id:'a',label:'原件',value:60},{id:'b',label:'副本',value:30}]};
 return [{...base,family:'narrative'},{...base,family:'comparison'},{...base,family:'causal',edges:[{from:'a',to:'b'}]},{...base,family:'narrative'}];
};
function chain(width=1280,height=720){const p=fixture();p.width=width;p.height=height;p.shots=scenes().map((semanticScene,i)=>({...emptyShot(),id:'chain-'+i,seconds:5,zh:'压缩压缩',assetIds:['voice'],semanticScene,handoff:i?structuredClone(bridge):{mode:'reset',reason:'建立对象'}}));return p;}
test('cross-family chain carries actual final objects, has no empty handoff frame and preserves final geometry',()=>{
 for(const [w,h] of [[1280,720],[720,960]]){
  const p=chain(w,h),plans=filmProps(p).rows.map(r=>r.scene.shot.motionPlan);assert.deepEqual(filmStyleIssues(p,timeline(p).rows),[]);
  for(let i=1;i<plans.length;i++){
   const plan=plans[i],before=plans[i-1];validateMotion(plan);assert.equal(plan.semanticModel.crossHandoff.from,before.semanticModel.family);
   for(const id of ['a','b']){
    const target=plan.nodes.find(n=>n.id==='sem-'+id),ghost=plan.nodes.find(n=>n.id==='handoff-'+id),old=before.nodes.find(n=>n.id==='sem-'+id);
    const oldState=nodeVisualState(old,before.duration-1/p.fps,before),start=nodeVisualState(ghost,0,plan);
    assert.equal(start.x,oldState.x);assert.equal(start.y,oldState.y);assert.deepEqual(ghost.paths,graphicsState(old,before.duration-1/p.fps,before).paths);
    for(let f=0;f<=Math.ceil(.6*p.fps);f++){const time=f/p.fps;assert.ok(nodeVisualState(target,time,plan).opacity+nodeVisualState(ghost,time,plan).opacity>=.999,'handoff always shows representation');}
    assert.equal(nodeVisualState(ghost,1,plan).opacity,0);assert.equal(nodeVisualState(target,1,plan).opacity,1);
    const label=plan.nodes.find(n=>n.id==='sem-label-'+id);assert.equal(nodeVisualState(label,.375,plan).opacity,0);assert.equal(nodeVisualState(label,.75,plan).opacity,1);
    const plain=compileSemanticScene(p.shots[i].semanticScene,{width:w,height:h,duration:5,fps:p.fps,filmStyle:filmStyleContext(p),assets:p.assets});
    assert.deepEqual(graphicsState(target,5,plan).paths,graphicsState(plain.nodes.find(n=>n.id===target.id),5,plain).paths);
   }
  }
 }
});
test('cross-family contract rejects invented identity, changed media, unsupported physics and invisible product objects',()=>{
 const [a,b]=scenes();
 for(const h of [{...bridge,entityIds:['missing']},{...bridge,reason:''},{...bridge,seconds:2}])assert.ok(bridgeIssues(a,b,h).length);
 assert.ok(bridgeIssues({...a,family:'physical'},b,bridge).length);
 assert.ok(bridgeIssues({...a,items:a.items.map(v=>({...v,assetId:'old'}))},{...b,items:b.items.map(v=>({...v,assetId:'new'}))},bridge).length);
 const assets=['i1','i2'].map(id=>({id,kind:'image',confirmed:true,source:'self',license:'self'})),product={...a,family:'product',items:a.items.map((v,i)=>({...v,assetId:assets[i].id}))},style=filmStyleContext(chain());
 const previous=compileSemanticScene(product,{assets,duration:5,filmStyle:style});
 assert.throws(()=>compileSemanticScene(b,{assets,duration:5,filmStyle:style,previousPlan:previous,handoff:bridge}),/不可见/);
 const next=compileSemanticScene(b,{assets,duration:5,filmStyle:style,previousPlan:previous,handoff:{...bridge,entityIds:['b']}});validateMotion(next);assert.equal(next.nodes.find(n=>n.id==='handoff-b').media.assetId,'i2');
 assert.throws(()=>compileSemanticScene(b,{assets,duration:5,filmStyle:style,previousPlan:previous,handoff:{...bridge,entityIds:['b']},focusBeats:[{entityId:'b',from:.2,until:2}]}),/台词早于/);
});
test('an upstream visual edit invalidates dependent handoffs but keeps all recordings and source claims',()=>{
 const p=chain();p.shots.forEach(s=>s.reviewed=true);const q=structuredClone(p);q.shots[0].semanticScene.items[0].focusQuote='压缩';const next=update(p,q);
 assert.ok(next.shots.every(s=>!s.reviewed));assert.deepEqual(next.assets,p.assets);assert.ok(repairPlan(p,next).every(s=>s.stages.includes('动画')&&s.preserveAudio));
});
test('new styled narrative starts on a real visible object while unstyled legacy timings are retained',()=>{
 const [s]=scenes(),style=filmStyleContext(chain());const current=compileSemanticScene(s,{filmStyle:style}),legacy=compileSemanticScene(s);
 assert.equal(nodeVisualState(current.nodes.find(n=>n.id===current.subjectId),0,current).opacity,1);
 assert.equal(nodeVisualState(legacy.nodes.find(n=>n.id===legacy.subjectId),0,legacy).opacity,0);
});

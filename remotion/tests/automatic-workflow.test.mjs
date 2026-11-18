import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,emptyShot,emptyClaim,syncNarration,update} from '../shared/model.mjs';
import {advanceScience,scienceGate,proofsReady} from '../shared/science-flow.mjs';
import {directTask,mergeGeneratedProject} from '../shared/automatic-workflow.mjs';
import {validateScienceResult} from '../server/science-ai.mjs';
import {explanationScriptFixture} from './fixtures/motion.mjs';

test('自动执行覆盖科普后续任务，保留产品分镜原行为',()=>{
  for(const task of ['narration','phrasing','rhythm','proofs','shots','materials','material-image'])assert.equal(directTask(draft('science'),task),true);
  assert.equal(directTask(draft('product'),'shots'),false);
  assert.equal(directTask(draft('science'),'research'),false);
});
test('音乐断句可调整标点但保留语意段数，不能改字、数字或添加指令',()=>{
  const p={...draft('science'),script:'距离约为 1.5 米，随后离开。'};
  assert.deepEqual(validateScienceResult({text:'距离约为 1.5 米。\n随后离开！'},p,'phrasing'),['距离约为 1.5 米。随后离开！']);
  for(const text of ['距离约为 15 米，随后离开。','距离为 1.5 米，随后离开。','距离约为 1.5 米，随后离开。（停顿）'])
    assert.throws(()=>validateScienceResult({text},p,'phrasing'),/改动了原稿/);
});
test('资料齐备时自动衔接，修改效果图意见后必须重新生成，不虚构审片',()=>{
  const p=draft('science');p.topic='轨道';p.claims=[{...emptyClaim(),verified:true}];
  p.shots=[{...emptyShot(),zh:'测试',seconds:2,assetIds:['voice']}];
  p.assets=[{id:'voice',kind:'audio',role:'zh',duration:2,scriptText:'测试'},{id:'bgm',confirmed:true,source:'自制',license:'自制'}];
  p.scienceFlow={bgmId:'bgm',analysis:{clipId:'bgm'},style:'轨道',template:'连续跟随',rhythm:'0–1 s 移动',feedback:'',proofsForFeedback:'',proofs:[{},{},{}]};
  explanationScriptFixture(p);advanceScience(p);assert.ok(p.scienceFlow.scriptVersion);assert.ok(p.scienceFlow.proofVersion);
  assert.deepEqual(scienceGate(p,true),[]);assert.ok(!p.shots[0].motionReview);assert.equal(p.shots[0].reviewed,false);
  p.scienceFlow.feedback='改变相机';p.scienceFlow.proofVersion=null;
  assert.equal(proofsReady(p),false);assert.match(scienceGate(p,true).join(' '),/效果图/);
});
test('自动写入途中保留用户编辑及服务器新版本，清除失效图版',()=>{
  const before={...draft('science'),version:3,script:'原稿',scienceFlow:{rhythm:'旧脚本'}};
  const generated={...before,version:4,script:'生成稿',scienceFlow:{rhythm:'旧脚本',proofs:[{},{},{}],scriptVersion:4}};
  const current={...before,title:'手写标题',scienceFlow:{rhythm:'手写节奏'}};
  const merged=mergeGeneratedProject(before,current,generated);
  assert.equal(merged.version,4);assert.equal(merged.script,'生成稿');assert.equal(merged.title,'手写标题');
  assert.equal(merged.scienceFlow.rhythm,'手写节奏');assert.equal(merged.scienceFlow.proofs,null);
});
test('最新口播实时分段；保留未改段落音频，清除新课题的旧画面和声音',()=>{
  const old={...emptyShot(),title:'行星轨道',zh:'旧课题。',en:'Old topic.',assetIds:['old'],processVideoId:'video',subtitleTracks:{zh:{assetId:'old',segments:[]}},manualTiming:{zh:{assetId:'old'}}};
  const unchanged={...emptyShot(),zh:'继续观察。',assetIds:['keep']};
  const p={...draft('science'),topic:'细胞膜',script:'分子穿过细胞膜。\n继续观察。',shots:[old,unchanged],assets:[],scienceFlow:{rhythm:'旧节奏',proofs:[{},{},{}]}};
  const next=syncNarration(p);
  assert.deepEqual(next.shots.map(s=>s.zh),['分子穿过细胞膜。','继续观察。']);
  assert.equal(next.shots[0].id,old.id);assert.equal(next.shots[0].title,'口播 1');
  assert.equal(next.shots[0].en,'');assert.deepEqual(next.shots[0].assetIds,[]);
  assert.equal(next.shots[0].subtitleTracks,undefined);assert.equal(next.shots[0].manualTiming,undefined);assert.equal(next.shots[0].processVideoId,undefined);
  assert.equal(next.shots[1],unchanged);assert.equal(next.scienceFlow.rhythm,'');
  assert.equal(p.shots[0].zh,'旧课题。');assert.equal(syncNarration(next),next);
  const reordered=syncNarration({...next,script:'继续观察。\n分子穿过细胞膜。'});
  assert.equal(reordered.shots[0].id,unchanged.id);assert.deepEqual(reordered.shots[0].assetIds,['keep']);
  assert.equal(syncNarration({...next,script:''},{clearEmpty:true}).shots.length,0);
});
test('服务端保存改稿也会同步配音段，产品稿保持原分镜',()=>{
  const p={...draft('science'),topic:'测试',script:'旧稿。',scienceFlow:{},shots:[{...emptyShot(),zh:'旧稿。'}]};
  assert.equal(update(p,{...p,script:'新稿。'}).shots[0].zh,'新稿。');
  assert.equal(update({...p,kind:'product'},{...p,kind:'product',script:'新稿。'}).shots[0].zh,'旧稿。');
});

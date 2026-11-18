import test from 'node:test';
import assert from 'node:assert/strict';
import {removeAsset} from '../shared/assets.mjs';
import {draft,emptyShot,update} from '../shared/model.mjs';

test('removing narration clears only its timing and references without mutating the original',()=>{
  const p={...draft(),assets:[{id:'zh',role:'zh'},{id:'en',role:'en'}],shots:[{...emptyShot(),assetIds:['zh','en'],reviewed:true,
    subtitleTracks:{zh:{assetId:'zh'},en:{assetId:'en'}},manualTiming:{zh:{assetId:'zh'},en:{assetId:'en'}}},
    {...emptyShot(),assetIds:['en'],reviewed:true}]};
  const before=structuredClone(p), next={...p,...removeAsset(p,'zh')};
  assert.deepEqual(p,before);
  assert.deepEqual(next.assets.map(a=>a.id),['en']);
  assert.deepEqual(next.shots[0].assetIds,['en']);
  assert.deepEqual(next.shots[0].subtitleTracks,{en:{assetId:'en'}});
  assert.deepEqual(next.shots[0].manualTiming,{en:{assetId:'en'}});
  assert.equal(next.shots[0].reviewed,false);
  assert.deepEqual(next.shots[1],p.shots[1]);
});

test('removing process footage and original references clears dependent review state',()=>{
  const p={...draft(),assets:[{id:'source'},{id:'generated',referenceId:'source',confirmed:true},{id:'keep',confirmed:true}],
    shots:[{...emptyShot(),assetIds:['source'],processVideoId:'source',processOffset:3,reviewed:true},
      {...emptyShot(),assetIds:['generated'],reviewed:true}]};
  const next=removeAsset(p,'source');
  assert.equal(next.shots[0].processVideoId,'');assert.equal(next.shots[0].processOffset,0);
  assert.equal(next.assets[0].referenceId,'');assert.equal(next.assets[0].confirmed,false);
  assert.equal(next.shots[1].reviewed,false);assert.equal(next.assets[1].confirmed,true);
});

test('removing either BGM source or adopted clip cannot restore stale analysis on save',()=>{
  for(const id of ['original','clip']) {
    let p=update(null,{...draft('science'),topic:'配乐移除',assets:[{id:'original',kind:'audio',role:'music'}, {id:'clip',kind:'audio',role:'music'}],scienceFlow:{bgmId:'clip'}});
    p.scienceFlow={...p.scienceFlow,analysis:{sourceId:'original',clipId:'clip'},scriptVersion:3,proofVersion:3,sampleJob:'old'};
    const next=update(p,{...p,...removeAsset(p,id)});
    assert.equal(next.scienceFlow.bgmId,'');assert.equal(next.scienceFlow.analysis,null);
    assert.ok(!next.scienceFlow.scriptVersion);assert.ok(!next.scienceFlow.sampleJob);
    assert.equal(next.assets.length,1);
  }
});

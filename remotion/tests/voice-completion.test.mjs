import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,emptyShot,timeline} from '../shared/model.mjs';
import {voiceStageReady} from '../shared/voice-assembly.mjs';
function fixture(){
  const p={...draft('science'),voice:'en',captionMode:'bilingual',scienceFlow:{bgmId:'bgm',analysis:{clipId:'bgm'}}};
  p.assets=[{id:'en',kind:'audio',role:'en',duration:2,scriptText:'The object moves.'},
    {id:'bgm',kind:'audio',role:'music',duration:10}];
  p.shots=[{...emptyShot(),zh:'物体移动。',en:'The object moves.',assetIds:['en']}];
  return p;
}
test('English narration completes the step even when an old preview still uses Chinese',()=>{
  const p=fixture();
  assert.equal(timeline(p,'zh').rows.every(r=>r.voices.length),false);
  assert.equal(voiceStageReady(p),true);
  assert.equal(voiceStageReady({...p,voice:'zh'}),false);
  assert.equal(voiceStageReady({...p,language:'separate'}),true);
});
test('stale, deleted or empty narration cannot keep the completion tick',()=>{
  const p=fixture();
  assert.equal(voiceStageReady({...p,shots:[{...p.shots[0],en:'New narration.'}]}),false);
  assert.equal(voiceStageReady({...p,shots:[{...p.shots[0],assetIds:[]}]}),false);
  assert.equal(voiceStageReady({...p,shots:[]}),false);
  assert.equal(voiceStageReady({...p,assets:p.assets.map(a=>a.id==='en'?{...a,duration:0}:a)}),false);
});
test('sequential narration needs both languages; regular workflow needs adopted music',()=>{
  const p=fixture();p.language='sequential';
  assert.equal(voiceStageReady(p),false);
  p.assets.push({id:'zh',kind:'audio',role:'zh',duration:2,scriptText:'物体移动。'});p.shots[0].assetIds.push('zh');
  assert.equal(voiceStageReady(p),true);
  assert.equal(voiceStageReady({...p,scienceFlow:{}}),false);
  assert.equal(voiceStageReady({...p,assets:p.assets.filter(a=>a.id!=='bgm')}),false);
  assert.equal(voiceStageReady({...p,scienceFlow:{},productionMode:'local-process'}),true);
});

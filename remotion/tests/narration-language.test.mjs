import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {draft,emptyShot,syncNarration} from '../shared/model.mjs';
import {translationInput,translationSegments,validateTranslation,applyTranslation,voiceNarrationLanguage,preferredNarrationVoice,invalidateTranslations} from '../shared/narration-language.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-translation-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const project=()=>({...draft('science'),topic:'口播语言测试',script:'先靠近物体。\n然后离开。',voice:'en',scienceFlow:{},
  shots:[{...emptyShot(),zh:'先靠近物体。'},{...emptyShot(),zh:'然后离开。'}]});
const answer=p=>({segments:p.shots.map((s,i)=>({id:s.id,en:i?'Then move away.':'First approach the object.'}))});
const ready=async id=>{for(let i=0;i<100&&store.job(id).status==='running';i++)await new Promise(r=>setTimeout(r,5));return store.job(id);};

test('voice selection uses declared language and remembers a compatible voice',()=>{
  const voices=[{speaker_id:'zh',languages:'中文、支持30+语种识别'},{speaker_id:'en',languages:'美式英语'},{speaker_id:'clone',kind:'clone'}];
  assert.equal(voiceNarrationLanguage(voices[0],'en'),'zh');assert.equal(voiceNarrationLanguage(voices[1],'zh'),'en');
  assert.equal(voiceNarrationLanguage(voices[2],'en'),'en');
  assert.equal(preferredNarrationVoice(voices,'en','zh'),'en');assert.equal(preferredNarrationVoice(voices,'zh','en'),'zh');
  assert.equal(preferredNarrationVoice(voices,'en','clone'),'clone');
});
test('translation must cover each missing paragraph exactly once and preserve existing English',()=>{
  const p=project();p.shots[0].en='My existing English.';
  const rows=[{id:p.shots[1].id,en:'Then move away.'}];
  assert.equal(translationSegments(p).length,1);
  assert.deepEqual(validateTranslation({segments:rows},p),rows);
  for(const segments of [[],[...rows,...rows],[{id:'wrong',en:'Test.'}],[{id:rows[0].id,en:'仍然是中文。'}]])
    assert.throws(()=>validateTranslation({segments},p),/未完整对应/);
  const next=applyTranslation(p,rows);
  assert.equal(next.script,p.script);assert.equal(next.shots[0],p.shots[0]);assert.equal(next.shots[1].zh,p.shots[1].zh);
  assert.equal(next.shots[1].translationSourceZh,p.shots[1].zh);assert.equal(translationSegments(next).length,0);
  assert.equal(translationInput({...p,voice:'zh'}),translationInput(p));
});
test('changing paragraph boundaries clears stale English and audio, retaining recordings',()=>{
  const source=project(),p=applyTranslation(source,answer(source).segments);
  p.assets=[{id:'english',kind:'audio',role:'en'},{id:'chinese',kind:'audio',role:'zh'},{id:'music',kind:'audio',role:'music'}];
  p.shots[0].assetIds=['english','chinese','music'];
  p.shots[0].subtitleTracks={en:{assetId:'english',segments:[]},zh:{assetId:'chinese',segments:[]}};
  const next=syncNarration({...p,script:'先靠近物体，然后离开。'});
  assert.equal(next.shots.length,1);assert.equal(next.shots[0].en,'');
  assert.deepEqual(next.shots[0].assetIds,['music']);assert.equal(next.assets.length,3);
  assert.equal(next.shots[0].subtitleTracks.en,undefined);assert.equal(translationSegments(next).length,1);
  const edited=invalidateTranslations(p,{...p,shots:p.shots.map((s,i)=>i?s:{...s,zh:'先观察物体。'})});
  assert.equal(edited.shots[0].en,'');assert.equal(edited.shots[1].en,p.shots[1].en);
  assert.equal(p.shots[0].en,'First approach the object.');
});
test('translation broker applies across language switches without replacing source or current selection',async()=>{
  const p=store.save(project()),j=broker.prepare(p,null,'translation');let calls=0;
  assert.match(broker.prompt(p,j),/逐段翻译/);
  broker.approve(j.id,async()=>{calls++;return answer(p);});
  assert.throws(()=>broker.approve(j.id,()=>answer(p)),/不能再次/);
  assert.equal((await ready(j.id)).status,'ready');
  const chinese=store.save({...p,voice:'zh',title:'翻译中修改的标题'});
  const next=broker.applyJob(j.id);
  assert.equal(next.version,chinese.version+1);assert.equal(next.voice,'zh');assert.equal(next.title,chinese.title);
  assert.equal(next.script,p.script);assert.deepEqual(next.shots.map(s=>s.en),answer(p).segments.map(s=>s.en));
  assert.equal(calls,1);assert.throws(()=>broker.prepare(next,null,'translation'),/已有英文/);
});
test('late translation cannot overwrite a modified source draft',async()=>{
  const p=store.save(project()),j=broker.prepare(p,null,'translation');
  broker.approve(j.id,async()=>answer(p));assert.equal((await ready(j.id)).status,'ready');
  const changed=store.save({...p,script:'这是新口播。'});
  assert.throws(()=>broker.applyJob(j.id),/不会覆盖/);assert.equal(store.get(p.id).script,changed.script);
});
test('uncertain translation is never automatically resubmitted',async()=>{
  const p=store.save(project()),j=broker.prepare(p,null,'translation');let calls=0;
  broker.approve(j.id,async()=>{calls++;throw Object.assign(Error('待核对'),{uncertain:true});});
  assert.equal((await ready(j.id)).status,'unknown');
  assert.throws(()=>broker.prepare(p,null,'translation'),/待核对/);assert.equal(calls,1);
});

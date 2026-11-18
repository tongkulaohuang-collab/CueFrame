import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {draft,emptyShot,emptyClaim,update} from '../shared/model.mjs';
import {removeNarration} from '../shared/assets.mjs';
import {castingChoice} from '../shared/direction.mjs';
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {generateVoiceBatch} from '../ui/voice-batch.mjs';
import catalog from '../vendor/doubao-speech/voices.json' with {type:'json'};
import {createSpeechService} from '../vendor/doubao-speech/service.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-voice-management-'));
process.env.FRAMEBOARD_DATA=dir;
const {voicePreviews}=await import('../server/voice-previews.mjs');
const {db}=await import('../server/store.mjs');
after(()=>{db.close();if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('frameboard-voice-management-'))fs.rmSync(dir,{recursive:true,force:true});});

function project(){
  const p=draft('science'),claim={...emptyClaim(),text:'已核实事实',verified:true};
  const assets=[{id:'zh',kind:'audio',role:'zh',duration:2,src:'/zh.wav',scriptText:'你好。',confirmed:true},
    {id:'en',kind:'audio',role:'en',duration:2,src:'/en.wav',scriptText:'Hello.',confirmed:true},
    {id:'bgm',kind:'audio',role:'music',duration:4,src:'/bgm.wav'}];
  const shot={...emptyShot(),zh:'你好。',en:'Hello.',claimIds:[claim.id],assetIds:['zh','en'],reviewed:true,
    subtitleTracks:{zh:{assetId:'zh',text:'你好。',segments:[{text:'你好。',from:0,until:2}]}},
    manualTiming:{en:{assetId:'en',text:'Hello.',starts:[0]}},motionPlan:{revision:1}};
  return {...p,topic:'配音管理验证',assets,claims:[claim],shots:[shot,{...shot,id:'second'}],
    scienceFlow:{bgmId:'bgm',analysis:{clipId:'bgm'},proofs:['old'],sampleJob:'old'}};
}
test('删除选定配音仅解除目标段和语言，保留历史、BGM与其他段；旧混音失效',()=>{
  const p=project(),original=structuredClone(p),before=voiceAssemblyPlan(p);
  const next=removeNarration(p,[p.shots[0].id],['zh']);
  assert.deepEqual(p,original);assert.deepEqual(next.shots[0].assetIds,['en']);
  assert.deepEqual(next.shots[1],p.shots[1]);assert.equal(next.assets.length,3);
  assert.equal(next.shots[0].subtitleTracks.zh,undefined);assert.ok(next.shots[0].manualTiming.en);
  assert.equal(next.scienceFlow.bgmId,'bgm');assert.deepEqual(next.scienceFlow.analysis,p.scienceFlow.analysis);
  const after=voiceAssemblyPlan(next);assert.equal(after.ready,false);assert.notEqual(after.signature,before.signature);
  assert.equal(next.scienceFlow.sampleJob,null);assert.equal(next.shots[0].silentOK,false);
  const saved=update(p,next);assert.equal(saved.claims[0].verified,true);
});
test('全部删除会清除双语轨道；无效范围拒绝，录音仍可重新采用',()=>{
  const p=project(),next=removeNarration(p,p.shots.map(s=>s.id));
  assert.ok(next.shots.every(s=>s.assetIds.length===0));
  assert.ok(next.shots.every(s=>Object.keys(s.manualTiming).length===0));
  assert.throws(()=>removeNarration(p,['other']));assert.throws(()=>removeNarration(p,[p.shots[0].id],['music']));
  assert.ok(castingChoice(next,p.shots[0].id,p.assets[0]).shots[0].assetIds.includes('zh'));
});
test('显式全部重新生成不跳过已有结果；逐段采用新音轨并保留旧音轨',async()=>{
  let p={...project(),kind:'product'},count=0;
  await generateVoiceBatch({project:p,ids:p.shots.map(s=>s.id),lang:'zh',skipExisting:false,
    isCurrent:q=>q===p,onProgress:()=>{},onSaved:q=>{p=q;},
    synthesize:async(q,s)=>({id:'new-'+(++count),kind:'audio',role:'zh',duration:2,scriptText:s.zh,src:'/new.wav'}),
    adopt:async(q,s,a)=>castingChoice(q,s.id,a)});
  assert.equal(count,2);assert.equal(p.shots[0].assetIds.includes('zh'),false);assert.ok(p.assets.some(a=>a.id==='zh'));
});
test('目录包含同模型音色；新增音色可准备请求，准备不会产生云端调用',async()=>{
  assert.equal(catalog.voices.length,457);assert.equal(new Set(catalog.voices.map(v=>v.speaker_id)).size,457);
  assert.ok(catalog.voices.every(v=>v.resource_id==='seed-tts-2.0'));
  assert.ok(catalog.voices.filter(v=>v.sampleUrl).every(v=>new URL(v.sampleUrl).protocol==='https:'));
  let calls=0;const service=createSpeechService({root:dir,getConfig:()=>({ttsApiKey:'test-only',fetch:()=>{calls++;throw Error('No network');}})});
  const added=catalog.voices.find(v=>v.name==='刘飞 2.0');
  const prepared=await service.prepare('speech',{speaker_id:added.speaker_id,text:'试听。'});
  assert.equal(prepared.summary.voice,'刘飞 2.0');assert.equal(prepared.status,'prepared');assert.equal(calls,0);
});
test('试听明确提交一次后缓存复用，刷新及未知结果查询都不重发',async()=>{
  const records=new Map();let submits=0,prepares=0;
  const service={listVoices:async()=>catalog.voices,outputs:dir,
    prepare:async(kind,payload)=>{prepares++;const r={id:randomUUID(),kind,status:'prepared',payload,summary:{voice:'Vivi',characters:payload.text.length}};records.set(r.id,r);return r;},
    getRequest:async id=>records.get(id),
    execute:async(id,approval)=>{assert.equal(approval.confirmed,true);const r=records.get(id);if(r.status==='completed')return r;submits++;r.status='completed';r.result={audio_url:'/example.mp3'};return r;}};
  const api=voicePreviews(service),input={speaker:catalog.voices[0].speaker_id,text:'测试试听。'};
  const [a,b]=await Promise.all([api.prepare(input),api.prepare(input)]);assert.equal(a.id,b.id);assert.equal(prepares,1);
  await assert.rejects(api.execute({requestId:a.id}),/确认/);assert.equal(submits,0);
  await api.execute({requestId:a.id,confirmed:true});assert.equal(submits,1);
  const cached=await api.prepare(input);assert.equal(cached.id,a.id);assert.equal(cached.status,'completed');assert.equal(submits,1);
  const uncertain=await api.prepare({...input,text:'未知结果。'});records.get(uncertain.id).status='needs_review';
  assert.equal((await api.prepare({...input,text:'未知结果。'})).id,uncertain.id);
  await api.check({requestId:uncertain.id});assert.equal(submits,1);
  await assert.rejects(api.prepare({...input,text:'未知结果。',retry:true}),/核对/);
  const next=await api.prepare({...input,text:'未知结果。',retry:true,acknowledgeUncertain:true});assert.notEqual(next.id,uncertain.id);
  assert.equal(submits,1);assert.equal(records.get(uncertain.id).status,'needs_review');
  await assert.rejects(api.check({requestId:randomUUID()}),/不存在/);
});

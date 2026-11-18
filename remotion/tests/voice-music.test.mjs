import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,emptyShot,timeline} from '../shared/model.mjs';
import {castingChoice} from '../shared/direction.mjs';
import {voiceMusicPlan,musicDirection,matchingVoice} from '../shared/voice-music.mjs';
import {alignPCM,alignVoiceToMusic} from '../server/voice-music.mjs';
import {wave} from '../server/wave.mjs';
import {generateVoiceBatch,waitForVoiceResult} from '../ui/voice-batch.mjs';
const fixture=()=>({...draft('science'),topic:'测试节奏',shots:[1,2,3].map(i=>({...emptyShot(),zh:'完整句子。下一句。',seconds:2})),
  assets:[{id:'music',kind:'audio',role:'music',duration:10}],
  scienceFlow:{bgmId:'music',analysis:{clipId:'music',from:0,until:10,marks:[{time:.5,change:'声音增强'},{time:1.5,change:'声音减弱'},{time:2.5,change:'声音增强'}]}}});
test('失败显示原始错误；仅真正处理中的请求自动查询，不重发',async()=>{
  let checks=0;
  const pending={id:'request-123',status:'submitted'};
  const done=await waitForVoiceResult(pending,{isCurrent:()=>true,sleep:async()=>{},check:async()=>{checks++;return checks===2?{...pending,candidate:{id:'audio'}}:pending;}});
  assert.equal(done.candidate.id,'audio');assert.equal(checks,2);
  for(const status of ['failed','needs_review'])await assert.rejects(waitForVoiceResult({...pending,status,error:'fetch failed（ECONNRESET）'},
    {isCurrent:()=>true,check:()=>{throw Error('不能自动查询终态或重发');}}),/fetch failed（ECONNRESET）/);
  assert.equal(checks,2);
});
test('配音规划读取实际 BGM 和前段时长，不假造 BPM，换音乐或前段变长使旧配音失效',()=>{
  const p=fixture(),s=p.shots[1],plan=voiceMusicPlan(p,s.id,'zh');
  assert.equal(plan.offset,2);assert.equal(plan.speechRate,8);assert.match(musicDirection(plan,'自然'),/0.50秒声音增强/);
  const a={id:'voice',role:'zh',kind:'audio',scriptText:s.zh,speakerId:'voice1',duration:2,voiceMusic:plan};
  p.assets.push(a);s.assetIds=[a.id];assert.equal(matchingVoice(p,s,'zh','voice1'),a);
  p.shots[0].seconds=3;assert.equal(matchingVoice(p,s,'zh','voice1'),undefined);
  delete p.scienceFlow.analysis;assert.throws(()=>voiceMusicPlan(p,s.id,'zh'),/BGM/);
});
test('音乐不得切开语音；样本和句界原样保留，无时间戳不造逐句字幕',async()=>{
  const p=fixture(),plan=voiceMusicPlan(p,p.shots[0].id,'zh');
  const pcm=Buffer.alloc(24000*2*2);for(let n=0;n<pcm.length;n+=2)pcm.writeInt16LE(1000,n);
  const segments=[{text:'第一句',from:.1,until:.8},{text:'第二句',from:1,until:1.9}];
  const aligned=alignPCM(pcm,segments,plan);
  assert.deepEqual(aligned.segments,segments);
  assert.deepEqual(aligned.bytes.subarray(44),pcm);
  assert.deepEqual(aligned.voiceMusic.insertions,[]);
  let audible=0;for(let n=44;n<aligned.bytes.length;n+=2)if(aligned.bytes.readInt16LE(n)!==0)audible++;
  assert.equal(audible,48000);assert.equal(aligned.voiceMusic.alignedDuration,2);
  const original=wave(new Float32Array(24000).fill(.05),24000);
  const audio=await alignVoiceToMusic(original,undefined,plan);
  assert.deepEqual(audio.bytes,original);
  assert.equal(audio.segments,undefined);assert.equal(audio.voiceMusic.mode,'preserve-speech');
  const spoken={id:'preserved',role:'zh',kind:'audio',scriptText:p.shots[0].zh,voiceMusic:audio.voiceMusic};
  p.assets.push(spoken);p.shots[0].assetIds=[spoken.id];p.scienceFlow.analysis.marks[0].time=.75;
  assert.equal(matchingVoice(p,p.shots[0],'zh'),spoken);
  const next=castingChoice(p,p.shots[0].id,{id:'a',role:'zh',kind:'audio',scriptText:p.shots[0].zh,duration:audio.voiceMusic.alignedDuration,voiceMusic:audio.voiceMusic});
  assert.equal(timeline(next).rows[1].from/next.fps,audio.voiceMusic.alignedDuration);
});
test('批量逐段保存，失败即停；继续时只生成未完成段落，改稿时停止后续提交',async()=>{
  let p=fixture(),failed=true;const calls=[];
  const run=()=>generateVoiceBatch({project:p,ids:p.shots.map(s=>s.id),lang:'zh',speaker:'voice1',
    isCurrent:q=>q===p,onProgress:()=>{},onSaved:q=>{p=q;},
    synthesize:async(q,s)=>{calls.push(s.id);if(failed&&s.id===q.shots[1].id)throw Error('测试失败');return {id:'a-'+s.id,role:'zh',kind:'audio',scriptText:s.zh,speakerId:'voice1',duration:2,voiceMusic:voiceMusicPlan(q,s.id,'zh')};},
    adopt:async(q,s,a)=>castingChoice(q,s.id,a)});
  await assert.rejects(run(),/测试失败/);assert.equal(calls.length,2);assert.equal(p.shots[0].assetIds.length,1);assert.equal(p.shots[2].assetIds.length,0);
  failed=false;await run();assert.equal(calls.filter(id=>id===p.shots[0].id).length,1);assert.equal(p.shots[2].assetIds.length,1);
  await assert.rejects(generateVoiceBatch({project:p,ids:[p.shots[0].id],lang:'zh',isCurrent:()=>false}),/内容已变化/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpeechService, speechPayload, synthesizeRaw, PRESET_VOICES } from '../lib/doubao-speech.mjs';
const voice=PRESET_VOICES[0].speaker_id;
const cfg={ttsApiKey:'secret-not-for-output',ttsSpeaker:voice,ttsResourceId:'seed-tts-2.0'};
const approval={confirmed:true,billing_mode:'free_quota',billing_note:'测试模拟额度，不调用云服务'};
const mp3=Buffer.from('ID3-mock-audio-fixture');
const response=items=>new Response(items.map(i=>JSON.stringify(i)).join('\n'));
function validStream(){return response([{code:0,data:mp3.toString('base64'),sentence:{text:'你好。',words:[{startTime:0.125,endTime:1.8,word:'你好。'}]}},{code:20000000,usage:{text_words:3}}]);}
async function fixture(t,fetch,extra={}){const base=path.resolve(process.cwd());const root=await fs.mkdtemp(path.join(base,'.test-speech-'));t.after(async()=>{assert.ok(root.startsWith(base+path.sep+'.test-speech-'));await fs.rm(root,{recursive:true,force:true});});const saved=[];return {root,saved,service:createSpeechService({root,workspace:root,getConfig:()=>({...cfg,fetch,...extra}),saveConfig:async c=>saved.push(c),probe:async()=>({duration:10.464,hasAudio:true})})};}

test('连接预检不带凭据；失败明确标记未提交，不发送收费 POST',async t=>{
  let posts=0,checks=0;
  const {service}=await fixture(t,async()=>{posts++;return validStream();},{connectionFetch:async(url,opts)=>{
    checks++;assert.equal(opts.method,'HEAD');assert.equal(opts.headers,undefined);assert.equal(opts.body,undefined);
    throw Object.assign(Error('fetch failed'),{cause:{code:'ECONNRESET'}});
  }});
  const request=await service.prepare('speech',{text:'你好。'}),result=await service.execute(request.id,approval);
  assert.equal(result.status,'failed');assert.equal(result.submission_state,'not_submitted');
  assert.match(result.error,/ECONNRESET/);assert.equal(posts,0);assert.equal(checks,1);
});
test('404 连通回执不误判为合成失败，预检之后最多提交一次',async t=>{
  let posts=0;const {service}=await fixture(t,async()=>{posts++;return validStream();},{connectionFetch:async()=>new Response(null,{status:404})});
  const request=await service.prepare('speech',{text:'你好。'});
  assert.equal((await service.execute(request.id,approval)).status,'completed');assert.equal(posts,1);
});

test('预设/复刻使用不同资源，复刻不混用语气指令',()=>{
  const preset=speechPayload({text:'完整的一段话。',speaker_id:voice,direction:'自然讲述'});
  assert.equal(preset.resource_id,'seed-tts-2.0');assert.deepEqual(JSON.parse(preset.body.req_params.additions).context_texts,['自然讲述']);
  const cloned=speechPayload({text:'你好。',speaker_id:'S_mine',kind:'clone',direction:'自然讲述'});
  assert.equal(cloned.resource_id,'seed-icl-2.0');assert.equal(cloned.body.req_params.model,'seed-tts-2.0-standard');
  const additions=JSON.parse(cloned.body.req_params.additions);assert.equal(additions.context_texts,undefined);assert.equal(additions.tone_fidelity,true);assert.equal(cloned.warnings.length,1);
  assert.throws(()=>speechPayload({text:'你好',speaker_id:'S_mine',kind:'preset'}));
});
test('整段文案不受旧12秒镜头限制；不接受无效格式和速度',()=>{
  const paragraph='细胞膜正在运输物质。'.repeat(30);assert.equal(speechPayload({text:paragraph,speaker_id:voice}).body.req_params.text,paragraph);
  assert.throws(()=>speechPayload({text:'你好',speaker_id:voice,speech_rate:101}));
  assert.throws(()=>speechPayload({text:'你好',speaker_id:voice,format:'exe'}));
});
test('准备不产生云请求，确认后只提交一次并输出真实字幕及工程信息',async t=>{
  let calls=0;const {service}=await fixture(t,async(url,options)=>{calls++;assert.equal(url,'https://openspeech.bytedance.com/api/v3/tts/unidirectional');assert.equal(options.headers['X-Api-Key'],cfg.ttsApiKey);assert.equal(options.redirect,'error');return validStream();});
  const r=await service.prepare('speech',{text:'你好。'});assert.equal(calls,0);
  await assert.rejects(service.execute(r.id,{}),{code:'CONFIRMATION_REQUIRED'});assert.equal(calls,0);
  const done=await service.execute(r.id,approval);assert.equal(done.status,'completed');assert.equal(calls,1);assert.equal(done.result.duration,10.464);
  assert.match(await fs.readFile(done.result.subtitle_path,'utf8'),/00:00:00,125 --> 00:00:01,800/);
  assert.equal(done.result.timing_source,'provider_word_timestamps');assert.deepEqual(await fs.readFile(done.result.audio_path),mp3);
  assert.equal((await service.execute(r.id,approval)).status,'completed');assert.equal(calls,1);
  assert.ok(!JSON.stringify(await service.history()).includes(cfg.ttsApiKey));
});
test('没有时间戳时不伪造 SRT',async t=>{
  const {service}=await fixture(t,async()=>response([{code:0,data:mp3.toString('base64')},{code:20000000}]));
  const r=await service.prepare('speech',{text:'没有时间戳。'});const done=await service.execute(r.id,approval);
  assert.equal(done.result.subtitle_path,null);assert.equal(done.result.timing_source,'unavailable');
});
test('音色只读查询显式指定复刻资源，防止网关资源匹配错误',async t=>{
  let calls=0;const {service}=await fixture(t,async(url,options)=>{
    calls++;assert.equal(url,'https://openspeech.bytedance.com/api/v3/tts/get_voice');
    assert.equal(options.headers['X-Api-Resource-Id'],'seed-icl-2.0');
    assert.deepEqual(JSON.parse(options.body),{speaker_id:'S_existing'});
    return Response.json({speaker_id:'S_existing',status:0,available_training_times:15});
  });
  const result=await service.getVoice('S_existing');assert.equal(result.status,0);assert.equal(calls,1);
  assert.deepEqual(await service.history(),[]);
});
test('中断后保留待核对状态，不自动重试也不允许原请求重发',async t=>{
  let calls=0;const {service}=await fixture(t,async()=>{calls++;throw Error('connection reset');});const r=await service.prepare('speech',{text:'你好。'});
  const done=await service.execute(r.id,approval);assert.equal(done.status,'needs_review');
  await assert.rejects(service.execute(r.id,approval),{code:'ALREADY_SUBMITTED'});assert.equal(calls,1);
});
test('并发执行同一请求只发送一次',async t=>{
  let calls=0;const {service}=await fixture(t,async()=>{calls++;return validStream();});const r=await service.prepare('speech',{text:'你好。'});
  const results=await Promise.allSettled([service.execute(r.id,approval),service.execute(r.id,approval)]);
  assert.equal(calls,1);assert.ok(results.some(r=>r.status==='fulfilled'&&r.value.status==='completed'));
});
test('服务失败不会泄露凭据，HTTP 5xx 保留不确定性',async t=>{
  for(const code of [401,503]){const {service}=await fixture(t,async()=>new Response(cfg.ttsApiKey,{status:code}));const r=await service.prepare('speech',{text:'你好。'});const done=await service.execute(r.id,approval);assert.equal(done.status,code===503?'needs_review':'failed');assert.ok(!done.error.includes(cfg.ttsApiKey));}
});
test('复刻需录音授权，确认前不上传；使用正确V3格式并登记音色',async t=>{
  let calls=0;const {service,root}=await fixture(t,async(url,options)=>{calls++;assert.equal(url,'https://openspeech.bytedance.com/api/v3/tts/voice_clone');assert.equal(options.headers['X-Api-Resource-Id'],'seed-icl-2.0');const b=JSON.parse(options.body);assert.equal(b.speaker_id,'S_myvoice');assert.equal(b.audio.format,'wav');assert.equal(Buffer.from(b.audio.data,'base64').toString(),'RIFFrecording');assert.equal(b.model_type,undefined);return Response.json({speaker_id:b.speaker_id,status:2,available_training_times:14,speaker_status:[{model_type:5,demo_audio:'https://x.bytespeech.com/demo'}]});});
  const file=path.join(root,'mine.wav');await fs.writeFile(file,'RIFFrecording');const r=await service.prepare('clone',{audio_path:file,speaker_id:'S_myvoice',name:'我的声音'});assert.equal(calls,0);
  await assert.rejects(service.execute(r.id,approval),{code:'CONSENT_REQUIRED'});assert.equal(calls,0);
  const done=await service.execute(r.id,{...approval,voice_consent:true});assert.equal(done.status,'completed');assert.equal(calls,1);assert.equal((await service.listVoices()).at(-1).resource_id,'seed-icl-2.0');
});
test('复刻录音变化后需重新准备；拒绝工作区外录音与后付费自定义名称',async t=>{
  let calls=0;const {service,root}=await fixture(t,async()=>{calls++;});const file=path.join(root,'mine.wav');await fs.writeFile(file,'RIFFbefore');
  const r=await service.prepare('clone',{audio_path:file,speaker_id:'S_myvoice',name:'我的声音'});await fs.writeFile(file,'RIFFchanged');
  await assert.rejects(service.execute(r.id,{...approval,voice_consent:true}),/录音已变化/);assert.equal(calls,0);
  await assert.rejects(service.prepare('clone',{audio_path:file,speaker_id:'new_paid_voice',name:'声音'}),{code:'VALIDATION_ERROR'});
  await assert.rejects(service.prepare('clone',{audio_path:fileURLToPath(import.meta.url),speaker_id:'S_myvoice',name:'声音'}),/录音须放在当前工作区内/);
});
test('登记已有音色不访问云端，选择后更新视频工作流配置',async t=>{
  const {service,saved}=await fixture(t,()=>{throw Error('不应访问网络');});await service.registerVoice({speaker_id:'S_existing',name:'本人'});await service.selectVoice('S_existing');assert.deepEqual(saved,[{ttsSpeaker:'S_existing',ttsResourceId:'seed-icl-2.0'}]);
});
test('流式 UTF-8 跨包解析，字幕以秒为单位',async()=>{
  const bytes=Buffer.from(JSON.stringify({code:0,data:mp3.toString('base64'),sentence:{text:'氧分子',words:[{startTime:0.2,endTime:0.9,word:'氧分子'}]}})+'\n'+JSON.stringify({code:20000000}));
  const out=await synthesizeRaw({speaker_id:voice,text:'氧分子'}, {...cfg,fetch:async()=>new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}}))});assert.equal(out.captions[0].end,0.9);assert.equal(out.captions[0].text,'氧分子');
});

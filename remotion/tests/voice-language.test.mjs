import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {voiceTextIssue} from '../shared/voice-language.mjs';
import {createSpeechService,consumeSpeech,speechPayload} from '../vendor/doubao-speech/service.mjs';
import catalog from '../vendor/doubao-speech/voices.json' with {type:'json'};
const tim=catalog.voices.find(v=>v.name==='Tim'),vivi=catalog.voices[0];
const approval={confirmed:true,billing_mode:'paid_approved',billing_note:'本地模拟响应，不访问供应方。'};
const response=items=>new Response(items.map(i=>JSON.stringify(i)).join('\n'),{headers:{'x-tt-logid':'test-log-id','content-type':'application/json'}});
async function fixture(t,fetch){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'frameboard-empty-voice-'));
  t.after(async()=>{if(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('frameboard-empty-voice-'))await fs.rm(root,{recursive:true,force:true});});
  return {root,service:createSpeechService({root,getConfig:()=>({ttsApiKey:'test-secret',fetch}),probe:async()=>({duration:1})})};
}
test('按目录识别英语音色与中文文本不匹配，保留中文、英文和未知复刻语种',()=>{
  assert.match(voiceTextIssue(tim,'地球质量怎么算？'),/Tim.*美式英语.*中文/);
  assert.match(voiceTextIssue(tim,'Earth 地球'),/中文/);
  assert.equal(voiceTextIssue(tim,'How massive is Earth?'),'');
  assert.equal(voiceTextIssue(vivi,'地球质量怎么算？'),'');
  assert.equal(voiceTextIssue({name:'本人',kind:'clone'},'地球'), '');
  assert.throws(()=>speechPayload({speaker_id:tim.speaker_id,text:'地球'}),{code:'VOICE_LANGUAGE_MISMATCH'});
});
test('不匹配在准备和旧草稿执行前拦截，零网络请求且不误记为已提交',async t=>{
  let calls=0;const {root,service}=await fixture(t,async()=>{calls++;throw Error('Unexpected POST');});
  await assert.rejects(service.prepare('speech',{speaker_id:tim.speaker_id,text:'地球'}),{code:'VOICE_LANGUAGE_MISMATCH'});
  const old=await service.prepare('speech',{speaker_id:tim.speaker_id,text:'Earth'});
  old.payload.text='地球';
  await fs.writeFile(path.join(root,'.local','speech','requests',old.id+'.json'),JSON.stringify(old));
  await assert.rejects(service.execute(old.id,approval),{code:'VOICE_LANGUAGE_MISMATCH'});
  assert.equal(calls,0);assert.equal((await service.getRequest(old.id)).status,'prepared');
});
test('HTTP 成功但零音频记录响应摘要，不把空结果记为完成',async()=>{
  await assert.rejects(consumeSpeech(response([{code:0,message:'OK',data:null,usage:{text_words:28}}])),e=>{
    assert.equal(e.code,'EMPTY_AUDIO');assert.equal(e.uncertainSubmission,true);
    assert.deepEqual(e.diagnostics,{http_status:200,log_id:'test-log-id',content_type:'application/json',response_bytes:63,audio_bytes:0,events:1,last_code:0,last_message:'OK',billed_text_words:28});return true;
  });
});
test('空音频保留待核对，查询及重复点击不发新请求，诊断脱敏',async t=>{
  let calls=0;const {service}=await fixture(t,async()=>{calls++;return response([{code:0,message:'test-secret',data:'',usage:{text_words:5}}]);});
  const r=await service.prepare('speech',{speaker_id:tim.speaker_id,text:'Hello'});
  const done=await service.execute(r.id,approval);
  assert.equal(done.status,'needs_review');assert.equal(done.error_code,'EMPTY_AUDIO');
  assert.equal(done.diagnostics.audio_bytes,0);assert.equal(done.diagnostics.log_id,'test-log-id');
  assert.equal(done.diagnostics.billed_text_words,5);assert.ok(!JSON.stringify(done).includes('test-secret'));
  await service.getRequest(r.id);await assert.rejects(service.execute(r.id,approval),{code:'ALREADY_SUBMITTED'});
  assert.equal(calls,1);
});
test('合法 code 0 音频及提供方明确错误保持原语义',async()=>{
  const bytes=Buffer.from('test audio');
  const out=await consumeSpeech(response([{code:0,data:bytes.toString('base64')}]))
  assert.deepEqual(out.audio,bytes);assert.equal(out.diagnostics.audio_bytes,bytes.length);
  await assert.rejects(consumeSpeech(response([{code:45000000,message:'invalid voice'}])),e=>e.code==='PROVIDER_ERROR'&&e.diagnostics.last_code===45000000);
});

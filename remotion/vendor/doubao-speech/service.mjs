import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ROOT, getConfig, saveConfig, safeError } from '../../../video-workflow/lib/settings.mjs';
import { probeMedia } from '../../../video-workflow/lib/media.mjs';
import {voiceTextIssue} from '../../shared/voice-language.mjs';

// Official HTTP, voice_clone and get_voice contracts checked 2026-11-03.
const API = 'https://openspeech.bytedance.com/api/v3/tts/';
export const DEFAULT_DIRECTION = '像一位温和、清晰的老师，正指着动画给身边的人讲解。语气自然平实，整段连贯讲述，随语意自然停顿，避免播音腔和夸张起伏。';
import catalog from './voices.json' with {type:'json'};
export const PRESET_VOICES = catalog.voices;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function fail(message, code='VALIDATION_ERROR', extras={}) { return Object.assign(new Error(message), { code, ...extras }); }
export function networkDetail(error,config) {
  const code=error?.cause?.code||error?.code;
  return safeError(error,config)+(typeof code==='string'&&/^[A-Z_0-9]+$/.test(code)?'（'+code+'）':'');
}
export async function checkSpeechConnection(config={}) {
  // No credentials or speech data: even a 404 proves the HTTP route is reachable.
  try {await (config.connectionFetch||fetch)(API+'unidirectional',{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(12000)});}
  catch(e){throw fail('豆包连接检查失败，本次尚未提交配音：'+networkDetail(e,config),'NETWORK_UNAVAILABLE');}
}
const text = (s,label,max=2000) => { if(typeof s!=='string'||!s.trim()||[...s].length>max)throw fail(`${label}不能为空，最多 ${max} 字。`); return s.trim(); };
const int = (n,min,max,label) => { if(!Number.isInteger(n)||n<min||n>max)throw fail(`${label}须为 ${min}–${max} 的整数。`);return n; };
const speaker = s => { s=text(s,'音色 ID',256); if(!/^[A-Za-z0-9_-]+$/.test(s))throw fail('音色 ID 格式无效。');return s; };
const within = (base,target) => { const r=path.relative(base,target);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)); };
async function readJson(file,fallback) { try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;} }
async function writeJson(file,value) { await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await fs.rename(tmp,file); }

export function authHeaders(config,requestId,resource) {
  const headers={'Content-Type':'application/json','X-Api-Request-Id':requestId};
  if(config.ttsApiKey) headers['X-Api-Key']=config.ttsApiKey;
  else if(config.ttsAppId&&config.ttsAccessKey){headers['X-Api-App-Key']=config.ttsAppId;headers['X-Api-Access-Key']=config.ttsAccessKey;}
  else throw fail('尚未配置豆包语音 API Key。请打开本机配音工作台的连接设置；网页登录不能代替 API 凭据。','MISSING_CREDENTIALS');
  if(resource)headers['X-Api-Resource-Id']=resource;
  return headers;
}

export function speechPayload(input) {
  const voice={speaker_id:speaker(input.speaker_id),kind:input.kind||'preset'};
  const languageIssue=voiceTextIssue(PRESET_VOICES.find(v=>v.speaker_id===voice.speaker_id),input.text);
  if(languageIssue)throw fail(languageIssue,'VOICE_LANGUAGE_MISMATCH');
  if(!['preset','clone'].includes(voice.kind))throw fail('音色类型无效。');
  if(voice.kind==='preset'&&/^S_/.test(voice.speaker_id))throw fail('S_ 音色必须选择本人复刻类型。');
  const format=input.format||'mp3';if(!['mp3','wav'].includes(format))throw fail('只支持 MP3 或 WAV 输出。');
  const params={text:text(input.text,'配音文案'),speaker:voice.speaker_id,audio_params:{format,sample_rate:24000,enable_subtitle:true,
    speech_rate:int(input.speech_rate??0,-50,100,'语速'),loudness_rate:int(input.loudness_rate??0,-50,100,'音量')}};
  const additions={aigc_metadata:{enable:true}};
  const warnings=[];
  if(voice.kind==='clone') {
    params.model='seed-tts-2.0-standard';
    additions.tone_fidelity=input.tone_fidelity??true;
    if(typeof additions.tone_fidelity!=='boolean')throw fail('还原模式须为布尔值。');
    if(input.direction?.trim())warnings.push('本人复刻使用还原录音风格；当前标准版 HTTP 接口不发送语音指令。');
  } else if(input.direction?.trim())additions.context_texts=[text(input.direction,'语气指令',500)];
  params.additions=JSON.stringify(additions);
  return {resource_id:voice.kind==='clone'?'seed-icl-2.0':'seed-tts-2.0',body:{user:{uid:'local-video-workflow'},req_params:params},warnings};
}

async function withResponse(endpoint,body,config,requestId,resource,consume) {
  const headers=authHeaders(config,requestId,resource);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),config.requestTimeoutMs??180000);
  try {
    const response=await (config.fetch||fetch)(API+endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
    if(!response.ok){const msg=(await response.text()).slice(0,1200);throw fail(`豆包接口 HTTP ${response.status}：${safeError(msg,config)}`,'PROVIDER_ERROR',{uncertainSubmission:response.status>=500});}
    return await consume(response);
  } catch(e) {
    if(['MISSING_CREDENTIALS','VALIDATION_ERROR','PROVIDER_ERROR','EMPTY_AUDIO'].includes(e.code))throw e;
    throw fail(`请求未得到可确认的完成结果，请先核对供应方记录，不要自动重发。${networkDetail(e,config)}`,'SUBMISSION_UNCERTAIN',{uncertainSubmission:true,diagnostics:e.diagnostics});
  } finally {clearTimeout(timer);}
}

export async function consumeSpeech(response,config={}) {
  if(!response.body)throw fail('语音响应为空。','SUBMISSION_UNCERTAIN',{uncertainSubmission:true});
  const chunks=[],sentences=[];const decoder=new TextDecoder();let pending='',bytes=0,terminal=false,usage=null;
  const diagnostics={http_status:response.status,log_id:response.headers.get('x-tt-logid')?safeError(response.headers.get('x-tt-logid'),config).slice(0,160):'',
    content_type:response.headers.get('content-type')?.slice(0,100)||'',response_bytes:0,audio_bytes:0,events:0};
  function consume(line){
    line=line.trim();if(!line||line.startsWith(':')||line.startsWith('event:'))return;
    if(line.startsWith('data:'))line=line.slice(5).trim();
    if(line==='[DONE]'){terminal=true;return;}
    const item=JSON.parse(line);
    diagnostics.events++;diagnostics.last_code=item.code;
    diagnostics.last_message=item.message?safeError(String(item.message),config).slice(0,300):'';
    if(![0,20000000].includes(item.code))throw fail(`豆包配音失败（${item.code}）：${safeError(item.message||'未知错误',config)}`,'PROVIDER_ERROR');
    if(item.data){if(typeof item.data!=='string'||item.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw Error('音频 Base64 无效');const audio=Buffer.from(item.data,'base64');diagnostics.audio_bytes+=audio.length;chunks.push(audio);}
    if(item.sentence?.words?.length){const s=item.sentence;const words=s.words.filter(w=>Number.isFinite(w.startTime)&&Number.isFinite(w.endTime)&&w.startTime>=0&&w.endTime>w.startTime);
      if(words.length===s.words.length&&typeof s.text==='string')sentences.push({text:s.text,start:Math.min(...words.map(w=>w.startTime)),end:Math.max(...words.map(w=>w.endTime)),words});}
    if(item.usage){usage=item.usage;if(Number.isFinite(item.usage.text_words))diagnostics.billed_text_words=item.usage.text_words;}
    if(item.code===20000000)terminal=true;
  }
  try {
    for await(const chunk of response.body){bytes+=chunk.length;diagnostics.response_bytes=bytes;if(bytes>96*1024*1024)throw Error('音频响应超过本机限制');pending+=decoder.decode(chunk,{stream:true});let at;while((at=pending.indexOf('\n'))>=0){consume(pending.slice(0,at));pending=pending.slice(at+1);}}
    pending+=decoder.decode();if(pending.trim())consume(pending);
  }catch(e){e.diagnostics=diagnostics;throw e;}
  // The older V3 contract sends 20000000; the current HTTP contract may end a clean stream on code 0.
  if(!diagnostics.audio_bytes)throw fail('接口已结束响应，但没有返回可用音频。请核对音色与台词语种，并核对这次请求的计费记录；本机不会自动重发。','EMPTY_AUDIO',{uncertainSubmission:true,diagnostics});
  const unique=[...new Map(sentences.map(s=>[`${s.start}|${s.end}|${s.text}`,s])).values()].sort((a,b)=>a.start-b.start);
  return {audio:Buffer.concat(chunks),captions:unique,usage,terminalMarker:terminal,diagnostics};
}

export async function synthesizeRaw(input,config,requestId=randomUUID()) {
  const prepared=speechPayload(input);
  const out=await withResponse('unidirectional',prepared.body,config,requestId,prepared.resource_id,r=>consumeSpeech(r,config));
  return {...out,resource_id:prepared.resource_id,warnings:prepared.warnings};
}
async function jsonResponse(response){const value=await response.json();if(value.code!==undefined&&![0,20000000].includes(value.code))throw fail(`豆包音色接口失败（${value.code}）：${String(value.message||'').slice(0,500)}`,'PROVIDER_ERROR');if(typeof value.speaker_id!=='string'||![0,1,2,3,4].includes(value.status))throw Error('音色接口未返回有效的音色 ID 和状态，请核对控制台记录。');return value;}
// Live V3 gateway requires explicit ICL routing even for the read-only query.
export async function queryVoice(speakerId,config,requestId=randomUUID()) {return await withResponse('get_voice',{speaker_id:speaker(speakerId)},config,requestId,'seed-icl-2.0',jsonResponse);}
export function srt(captions){const stamp=n=>{let ms=Math.round(n*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(ms/1000)).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return captions.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n');}

export function createSpeechService(options={}) {
  const root=options.root||ROOT, workspace=options.workspace||path.resolve(ROOT,'..');
  const local=path.join(root,'.local','speech'),outputs=path.join(root,'outputs','speech');
  const config=options.getConfig||getConfig,save=options.saveConfig||saveConfig;
  const voicesFile=path.join(local,'voices.json');
  const reqFile=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw fail('请求编号无效。');return path.join(local,'requests',id+'.json');};
  const allVoices=async()=>[...PRESET_VOICES,...await readJson(voicesFile,[])];
  async function registerVoice(input){
    const entry={speaker_id:speaker(input.speaker_id),name:text(input.name,'音色名称',80),kind:'clone',resource_id:'seed-icl-2.0'};
    if(PRESET_VOICES.some(v=>v.speaker_id===entry.speaker_id))throw fail('预设音色不能登记为本人音色。');
    if(!/^S_[A-Za-z0-9_-]+$/.test(entry.speaker_id))throw fail('本版支持控制台已有 S_ 音色槽位，不自动创建后付费音色。');
    const list=await readJson(voicesFile,[]);await writeJson(voicesFile,[...list.filter(v=>v.speaker_id!==entry.speaker_id),entry]);return entry;
  }
  async function selectVoice(id){const v=(await allVoices()).find(v=>v.speaker_id===id);if(!v)throw fail('请先登记该音色。');await save({ttsSpeaker:id,ttsResourceId:v.resource_id});return v;}
  async function getVoice(id){return await queryVoice(id,config());}
  async function checkAudio(file){
    const base=await fs.realpath(workspace),actual=await fs.realpath(path.resolve(file));
    if(!within(base,actual))throw fail('录音须放在当前工作区内，或通过配音页面选择文件。');
    const ext=path.extname(actual).slice(1).toLowerCase();if(!['wav','mp3','m4a','aac','ogg'].includes(ext))throw fail('请使用 WAV、MP3、M4A、AAC 或 OGG 录音。');
    const stat=await fs.stat(actual);if(!stat.isFile()||stat.size<=0||stat.size>10*1024*1024)throw fail('录音须非空且小于 10MB。');
    const media=await (options.probe||probeMedia)(actual,config());if(!Number.isFinite(media.duration)||media.duration<5||media.duration>60)throw fail('录音须为 5–60 秒，推荐 10–30 秒。');
    return {path:actual,format:ext,sha256:sha(await fs.readFile(actual)),size:stat.size,duration:media.duration};
  }
  async function prepare(kind,input){
    authHeaders(config(),randomUUID());
    let payload,summary;
    if(kind==='speech'){
      const v=(await allVoices()).find(v=>v.speaker_id===(input.speaker_id||config().ttsSpeaker));if(!v)throw fail('请选择已登记的音色。');
      payload={text:text(input.text,'配音文案'),speaker_id:v.speaker_id,kind:v.kind,direction:input.direction||'',speech_rate:input.speech_rate??0,loudness_rate:input.loudness_rate??0,format:input.format||'mp3',tone_fidelity:input.tone_fidelity??true};
      const p=speechPayload(payload);summary={voice:v.name,characters:[...payload.text].length,resource_id:p.resource_id,warnings:p.warnings,text:payload.text};
    }else if(kind==='clone'){
      const id=speaker(input.speaker_id);if(!/^S_[A-Za-z0-9_-]+$/.test(id))throw fail('请填写控制台现有的 S_ 音色槽位。本工具不会创建后付费音色。');
      payload={speaker_id:id,name:text(input.name,'音色名称',80),audio:await checkAudio(text(input.audio_path,'录音路径',4096)),language:int(input.language??0,0,21,'语言编号'),reference_text:input.reference_text?.trim()||'',demo_text:text(input.demo_text||'你好，这是我的声音。现在，我们一起来看看细胞膜是怎样运输物质的。','试听文案',300)};
      if([...payload.demo_text].length<4)throw fail('试听文案至少 4 字。');
      summary={voice:payload.name,speaker_id:id,audio_path:payload.audio.path,duration:payload.audio.duration,sha256:payload.audio.sha256,destination:API+'voice_clone',demo_text:payload.demo_text,warning:'会上传这段录音并更新指定云端音色，消耗一次训练机会。请确认这是本人或已获授权的录音，并核对该槽位的计费状态。'};
    }else throw fail('操作类型无效。');
    const request={id:randomUUID(),kind,status:'prepared',created_at:new Date().toISOString(),payload,summary,
      billing:'本机无法读取账户免费额度；提交前核对控制台。复刻音色正式合成可能触发音色槽位费用。'};
    await writeJson(reqFile(request.id),request);return request;
  }
  async function execute(id,approval){
    if(!approval?.confirmed||!['free_quota','paid_approved'].includes(approval.billing_mode)||!approval.billing_note?.trim())throw fail('请先确认本次具体请求及免费额度或费用，再提交。','CONFIRMATION_REQUIRED');
    let r=await readJson(reqFile(id));if(r.status==='completed')return r;
    if(r.status!=='prepared')throw fail('该请求已提交或结果待核对，不能重复发送。请查询原请求。','ALREADY_SUBMITTED');
    if(r.kind==='speech')speechPayload(r.payload);
    if(r.kind==='clone'&&!approval.voice_consent)throw fail('复刻前需要本人或权利人对这段录音上传至豆包的明确授权。','CONSENT_REQUIRED');
    const cfg=config();authHeaders(cfg,r.id);
    let cloneBytes;
    if(r.kind==='clone'){
      const checked=await checkAudio(r.payload.audio.path);
      cloneBytes=await fs.readFile(checked.path);
      if(sha(cloneBytes)!==r.payload.audio.sha256)throw fail('录音已变化，请重新准备请求。');
    }
    const lock=await fs.open(reqFile(id)+'.lock','wx').catch(()=>{throw fail('该请求正在处理或已提交，不能重复发送。','ALREADY_SUBMITTED');});await lock.close();
    // Tests inject transports; production checks connectivity before the paid POST.
    if(!cfg.fetch||cfg.connectionFetch){
      try{await checkSpeechConnection(cfg);}
      catch(e){r.status='failed';r.error=safeError(e,cfg);r.error_code=e.code;r.submission_state='not_submitted';await writeJson(reqFile(id),r);return r;}
    }
    r.status='submitted';r.submitted_at=new Date().toISOString();r.approval={billing_mode:approval.billing_mode,billing_note:text(approval.billing_note,'确认说明',500),voice_consent:!!approval.voice_consent};await writeJson(reqFile(id),r);
    try {
      if(r.kind==='speech'){
        const out=await synthesizeRaw(r.payload,cfg,r.id);r.diagnostics=out.diagnostics;const dir=path.join(outputs,r.id);await fs.mkdir(dir,{recursive:true});
        const audioPath=path.join(dir,'narration.'+r.payload.format);await fs.writeFile(audioPath,out.audio,{flag:'wx'});
        const info=await (options.probe||probeMedia)(audioPath,cfg);if(!Number.isFinite(info.duration)||info.duration<=0)throw Error('音频时长不可用');
        const captions=out.captions.filter(s=>s.end<=info.duration+0.25);
        const manifest={provider:'doubao',request_id:r.id,speaker_id:r.payload.speaker_id,resource_id:out.resource_id,text:r.payload.text,duration:info.duration,audio_path:audioPath,sha256:sha(out.audio),usage:out.usage,captions,words:captions.flatMap(s=>s.words),timing_source:captions.length?'provider_word_timestamps':'unavailable',review_required:true,aigc:true,warnings:out.warnings};
        await writeJson(path.join(dir,'timing.json'),manifest);await fs.writeFile(path.join(dir,'narration.txt'),r.payload.text,'utf8');
        if(captions.length)await fs.writeFile(path.join(dir,'subtitles.srt'),srt(captions),'utf8');
        r.result={...manifest,manifest_path:path.join(dir,'timing.json'),subtitle_path:captions.length?path.join(dir,'subtitles.srt'):null,audio_url:`/api/speech/files/${r.id}/narration.${r.payload.format}`};
      }else {
        const p=r.payload;
        const body={speaker_id:p.speaker_id,audio:{data:cloneBytes.toString('base64'),format:p.audio.format},language:p.language,extra_params:{demo_text:p.demo_text,enable_audio_denoise:false}};
        if(p.reference_text)body.text=p.reference_text;
        const value=await withResponse('voice_clone',body,cfg,r.id,'seed-icl-2.0',jsonResponse);
        if(value.speaker_id!==p.speaker_id)throw Error('返回音色与提交音色不一致，请核对控制台。');
        r.result=value;if([1,2,4].includes(value.status))await registerVoice({speaker_id:p.speaker_id,name:p.name});
      }
      r.status='completed';r.completed_at=new Date().toISOString();
    }catch(e){r.status=e.uncertainSubmission||e.code!=='PROVIDER_ERROR'?'needs_review':'failed';r.error=safeError(e,cfg);r.error_code=e.code||'RESULT_ERROR';if(e.diagnostics)r.diagnostics=e.diagnostics;}
    await writeJson(reqFile(id),r);return r;
  }
  async function status(){const c=config();return {configured:!!(c.ttsApiKey||c.ttsAppId&&c.ttsAccessKey),selected_voice:c.ttsSpeaker,selected_resource:c.ttsResourceId,voices:await allVoices(),outputs,web_url:'http://127.0.0.1:8788/voice',quota:'unknown_check_console'};}
  async function history(){const files=await fs.readdir(path.join(local,'requests')).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const list=await Promise.all(files.filter(n=>n.endsWith('.json')).map(n=>readJson(path.join(local,'requests',n))));return list.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,50);}
  async function uploadAudio(data,format){if(!['mp3','wav','m4a','aac','ogg'].includes(format)||typeof data!=='string'||data.length>14*1024*1024||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw fail('录音文件格式或大小无效。');const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>10*1024*1024)throw fail('录音须小于 10MB。');const file=path.join(local,'uploads',randomUUID()+'.'+format);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});return await checkAudio(file);}
  return {status,listVoices:allVoices,registerVoice,selectVoice,getVoice,prepare,execute,getRequest:id=>readJson(reqFile(id)),history,uploadAudio,outputs};
}

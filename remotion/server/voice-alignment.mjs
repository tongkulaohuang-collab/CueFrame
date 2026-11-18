import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {root,data,get,job,jobs,write,persistJob,conflict} from './store.mjs';
import {update} from '../shared/model.mjs';
import {alignRecognizedText} from '../shared/voice-alignment.mjs';
import {refineAcousticBoundaries,calibrateBoundaries} from '../shared/speech-boundaries.mjs';
import {selectAlignmentCandidate} from '../shared/alignment-selection.mjs';
const exec=promisify(execFile),modelDir=path.join(root,'runtime-models/paraformer-zh-en-2023-09-14'),forcedDir=path.join(root,'runtime-models/ctc-zh-xlsr');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let queue=Promise.resolve(),verified,forcedVerified;
export function alignmentStatus(p,shotId,lang) {
  return {ready:fs.existsSync(path.join(modelDir,'manifest.json')),forcedReady:fs.existsSync(path.join(forcedDir,'manifest.json')),forcedLanguages:['zh'],jobs:jobs(p.id).filter(j=>j.type==='voice-alignment'&&(!shotId||j.shotId===shotId)&&(!lang||j.lang===lang)).slice(0,10)};
}
function selected(p,shotId,lang) {
  const shot=p.shots.find(s=>s.id===shotId),asset=p.assets.find(a=>shot?.assetIds.includes(a.id)&&a.kind==='audio'&&a.role===lang);
  if(!['zh','en'].includes(lang)||!shot?.[lang]?.trim()||!asset)throw Error('先为当前台词选择中文或英文配音');
  if(asset.duration>120||shot[lang].length>1500)throw Error('单段定位最多 120 秒、1500 字；请按完整语意段拆分');
  if(!/^\/media\/[\w-]+\.(wav|mp3|m4a|ogg)$/i.test(asset.src))throw Error('定位只支持已上传的本地音频');
  return {shot,asset,file:path.join(data,'uploads',path.basename(asset.src))};
}
function native(pcm,{forced=false,text,base}={}) {
  return new Promise((resolve,reject)=>{
    const child=fork(path.join(root,forced?'server/forced-alignment-worker.mjs':'server/alignment-worker.mjs'),[],{serialization:'advanced',windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let settled=false;const finish=(fn,value)=>{if(!settled){settled=true;clearTimeout(timeout);fn(value);}};
    const timeout=setTimeout(()=>{child.kill();finish(reject,Error('本地识别超时，原配音未改变'));},180000);
    child.once('message',m=>m.error?finish(reject,Error(m.error)):finish(resolve,m));child.once('error',e=>finish(reject,e));child.once('exit',code=>finish(reject,Error('本地识别进程未返回结果：'+code)));
    child.send({modelDir:forced?forcedDir:modelDir,pcm,text,base});
  });
}
export function startAlignment(p,{shotId,lang=p.voice,engine='auto'}) {
  const {shot,asset,file}=selected(p,shotId,lang);
  if(!alignmentStatus(p).ready)throw Error('请先运行 npm run setup:alignment 安装免费本地模型');
  if(!['auto','asr','ctc'].includes(engine))throw Error('语音定位方式无效');
  const useForced=engine!=='asr'&&lang==='zh'&&alignmentStatus(p).forcedReady;
  if(engine==='ctc'&&!useForced)throw Error('中文声学模型尚未就绪，或当前语言不支持该模型');
  const audioHash=sha(file),text=shot[lang];
  const existing=jobs(p.id).find(j=>j.type==='voice-alignment'&&j.engine===(useForced?'ctc':'asr')&&j.shotId===shotId&&j.audioHash===audioHash&&j.text===text&&['queued','running'].includes(j.status));
  if(existing)return existing;
  const j=persistJob({id:randomUUID(),type:'voice-alignment',engine:useForced?'ctc':'asr',project:p.id,version:p.version,shotId,lang,assetId:asset.id,text,audioHash,owner:process.pid,status:'queued',created:new Date().toISOString()});
  queue=queue.then(async()=>{
    try {
      j.status='running';persistJob(j);
      const manifest=JSON.parse(fs.readFileSync(path.join(modelDir,'manifest.json'),'utf8'));
      if(verified!==manifest.revision){for(const [name,hash] of Object.entries(manifest.files))if(sha(path.join(modelDir,name))!==hash)throw Error('本地模型校验失败');verified=manifest.revision;}
      const dir=path.join(data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});const pcm=path.join(dir,'speech.f32');
      await exec(ffmpeg.path,['-y','-i',file,'-t','120.05','-ac','1','-ar','16000','-f','f32le',pcm],{windowsHide:true,timeout:40000});
      const result=await native(pcm);
      const duration=Math.min(asset.duration,result.duration);
      j.raw=result.result;
      j.result={...refineAcousticBoundaries(alignRecognizedText(text,result.result,duration),result.envelope),assetId:asset.id,receiptId:j.id,audioHash,model:{id:manifest.id,revision:manifest.revision},duration};
      if(useForced){
        try{
          const forcedManifest=JSON.parse(fs.readFileSync(path.join(forcedDir,'manifest.json'),'utf8'));
          if(forcedVerified!==forcedManifest.revision){for(const [name,hash] of Object.entries(forcedManifest.files))if(sha(path.join(forcedDir,name))!==hash)throw Error('声学模型校验失败');forcedVerified=forcedManifest.revision;}
          const candidate=await native(pcm,{forced:true,text,base:j.result});
          const forced={...candidate.result,model:{id:forcedManifest.id,revision:forcedManifest.revision,asr:j.result.model},duration};
          j.result=selectAlignmentCandidate(j.result,forced,{engine});
        }catch(error){j.result=selectAlignmentCandidate(j.result,null,{engine,error:error.message});}
      }
      fs.unlinkSync(pcm);
      j.waveform={step:result.envelope.step,peaks:result.envelope.peaks.map(v=>Number(v.toFixed(4))),duration};
      j.status='done';persistJob(j);
    }catch(error){j.status='failed';j.error=error.message;persistJob(j);}
  });return j;
}
export function applyAlignment(p,{jobId}) {
  const j=job(jobId);
  if(j.project!==p.id||j.type!=='voice-alignment'||j.status!=='done'||!j.result?.applicable)throw Error('该定位结果尚不可采用');
  const {shot,asset,file}=selected(p,j.shotId,j.lang);
  if(j.assetId!==asset.id||j.text!==shot[j.lang]||j.audioHash!==sha(file))throw conflict('配音或台词已改变，请重新定位');
  shot.voiceAlignment={...shot.voiceAlignment,[j.lang]:j.result};
  shot.subtitleTracks={...shot.subtitleTracks,[j.lang]:{assetId:asset.id,text:shot[j.lang],segments:j.result.segments,timing:j.result.timing,alignmentReceipt:j.id}};
  return write(update(get(p.id),p),p.version);
}
export function calibrateAlignment(p,{jobId,boundaries,confirmed,confirmedText=false}) {
  if(confirmed!==true)throw Error('请核对本次起止时间后再保存校准');
  const prior=job(jobId);
  if(prior.project!==p.id||prior.type!=='voice-alignment'||prior.status!=='done')throw Error('校准依据无效');
  const {shot,asset,file}=selected(p,prior.shotId,prior.lang);
  if(prior.assetId!==asset.id||prior.text!==shot[prior.lang]||prior.audioHash!==sha(file))throw conflict('配音或台词已改变，请重新定位');
  const result=calibrateBoundaries(prior.result,boundaries,{confirmedText}),id=randomUUID();
  persistJob({...prior,id,version:p.version,sourceJobId:prior.id,mode:'manual-calibration',created:new Date().toISOString(),result:{...result,receiptId:id}});
  return applyAlignment(p,{jobId:id});
}
export function assertAlignmentReceipts(p) {
  for(const s of p.shots){
    for(const [lang,a] of Object.entries(s.voiceAlignment||{})){
      const j=job(a.receiptId);
      if(j.type!=='voice-alignment'||j.status!=='done'||JSON.stringify(j.result)!==JSON.stringify(a))throw Error('字词定位凭据被修改，请重新定位');
      // Copies may reuse an immutable receipt for the same recording and text.
      if(a.assetId!==s.subtitleTracks?.[lang]?.assetId||a.text!==s[lang])delete s.voiceAlignment[lang];
    }
    for(const track of Object.values(s.subtitleTracks||{}))if(track.alignmentReceipt){const j=job(track.alignmentReceipt);
      if(j.type!=='voice-alignment'||JSON.stringify(track.segments)!==JSON.stringify(j.result?.segments)||track.assetId!==j.assetId||track.text!==j.text||track.timing!==j.result.timing)throw Error('字词字幕凭据被修改，请改用人工标记或重新定位');}
  }
}

import fs from 'node:fs';
import path from 'node:path';
import {spokenAlignmentUnits,ctcViterbi,forcedAlignmentResult} from '../shared/ctc-alignment.mjs';
import {speechEnvelope} from '../shared/speech-boundaries.mjs';
import {transcriptGuard} from './transcript-guard.mjs';
process.once('message',async({modelDir,pcm,text,base})=>{
 try{
  const ort=await import('onnxruntime-node');
  const config=JSON.parse(fs.readFileSync(path.join(modelDir,'config.json'),'utf8')),vocab=JSON.parse(fs.readFileSync(path.join(modelDir,'vocab.json'),'utf8'));
  const buf=fs.readFileSync(pcm),samples=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
  if(samples.length>16000*45)throw Error('当前声学对齐按不超过45秒的完整语意段处理；本段保留现有定位');
  const units=spokenAlignmentUnits(text,vocab),mean=samples.reduce((a,v)=>a+v,0)/samples.length;
  let variance=0;for(const v of samples)variance+=(v-mean)**2;
  if(!samples.length||!Number.isFinite(variance)||variance/samples.length<1e-8)throw Error('音频没有有效语音');
  const std=Math.sqrt(variance/samples.length+1e-7);
  const input=Float32Array.from(samples,v=>(v-mean)/std),mask=new BigInt64Array(samples.length).fill(1n);
  const session=await ort.InferenceSession.create(path.join(modelDir,'model.onnx'),{executionProviders:['cpu'],intraOpNumThreads:4,interOpNumThreads:1});
  const feeds={input_values:new ort.Tensor('float32',input,[1,input.length])};
  if(session.inputNames.includes('attention_mask'))feeds.attention_mask=new ort.Tensor('int64',mask,[1,mask.length]);
  const output=await session.run(feeds),tensor=output[session.outputNames[0]],[,frames,vocabSize]=tensor.dims;
  const stride=config.conv_stride.reduce((a,b)=>a*b,1),frameSeconds=stride/16000;
  const aligned=ctcViterbi(tensor.data,{frames,vocabSize,targets:units.flatMap(u=>u.ids),blank:config.pad_token_id,frameSeconds});
  const reverse=Object.fromEntries(Object.entries(vocab).map(([k,v])=>[v,k]));
  const duration=Math.min(samples.length/16000,base.duration??Infinity);
  const result=forcedAlignmentResult(base,units,aligned,{duration,frameSeconds,envelope:speechEnvelope(samples),transcriptGuard:transcriptGuard(text,base.recognized)});
  result.forced.greedyText=aligned.greedy.map(v=>reverse[v.id]).join('').replaceAll('|',' ');
  await session.release();process.send({result},()=>process.disconnect());
 }catch(e){process.send({error:e.message},()=>process.disconnect());}
});

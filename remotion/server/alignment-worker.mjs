import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {speechEnvelope} from '../shared/speech-boundaries.mjs';
const require=createRequire(import.meta.url);
process.once('message',({modelDir,pcm})=>{
  try {
    const {OfflineRecognizer}=require('sherpa-onnx-node');
    const recognizer=new OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},
      modelConfig:{paraformer:{model:path.join(modelDir,'model.int8.onnx')},tokens:path.join(modelDir,'tokens.txt'),numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search'});
    const buf=fs.readFileSync(pcm),samples=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
    let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));
    if(peak<.0001)throw Error('音频没有有效声音，未生成字词定位；原配音与字幕保留');
    const stream=recognizer.createStream();stream.acceptWaveform({samples,sampleRate:16000});recognizer.decode(stream);
    const envelope=speechEnvelope(samples);
    process.send({result:recognizer.getResult(stream),duration:samples.length/16000,envelope},()=>process.disconnect());
  }catch(error){process.send({error:error.message},()=>process.disconnect());}
});

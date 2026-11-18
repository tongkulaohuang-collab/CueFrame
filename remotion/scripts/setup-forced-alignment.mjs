import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const revision='269b21c2b6ea9bebaa5d6b17bfeebf5a23beaa7b';
const repo='onnx-community/wav2vec2-large-xlsr-53-chinese-zh-cn-ONNX';
const folder=fileURLToPath(new URL('../runtime-models/ctc-zh-xlsr/',import.meta.url));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.mkdirSync(folder,{recursive:true});
const files=[['onnx/model_quantized.onnx','model.onnx','0dfb758126e2ed0fbc5e10df35320800a68b231dbb3d9db91555c676f57a5ec8'],['config.json','config.json'],['vocab.json','vocab.json'],['preprocessor_config.json','preprocessor_config.json']];
for(const [remote,name,expected] of files){
 const file=path.join(folder,name),partial=file+'.partial';
 if(!fs.existsSync(file)){
  if(!(expected&&fs.existsSync(partial)&&hash(partial)===expected))execFileSync('curl.exe',['--fail','--location','--retry','1','--max-time','900','https://huggingface.co/'+repo+'/resolve/'+revision+'/'+remote,'-o',partial],{windowsHide:true,stdio:'inherit',timeout:920000});
  if(expected&&hash(partial)!==expected)throw Error('模型文件 SHA256 不匹配，未采用');
  fs.renameSync(partial,file);
 }
 if(expected&&hash(file)!==expected)throw Error('现有模型文件 SHA256 不匹配');
 console.log(name,'verified',fs.statSync(file).size);
}
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({id:'ctc-zh-xlsr',revision,source:'https://huggingface.co/'+repo+'/tree/'+revision,
 upstream:'https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn',license:'Apache-2.0 (upstream weights; converted repository has no separate model card)',
 method:'CTC constrained Viterbi alignment against supplied text; grapheme boundaries, not a phoneme recognizer',sampleRate:16000,
 files:Object.fromEntries(files.map(([,n])=>[n,hash(path.join(folder,n))]))},null,2));
console.log('本地中文 CTC 模型已就绪，音频不会上传。');

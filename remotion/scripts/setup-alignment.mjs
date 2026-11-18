import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const revision='def027084691107096b5ebba69785756d63de6c5';
const base='https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14/resolve/'+revision+'/';
const folder=fileURLToPath(new URL('../runtime-models/paraformer-zh-en-2023-09-14/',import.meta.url));
fs.mkdirSync(folder,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// SHA-256 from the pinned Git LFS pointer (the CDN Xet identifier is not a file hash).
const expected='f36a0433bcf096bd6d6f11b80a3ac8bed110bdca632fe0d731df8d1a84475945';
for(const name of ['model.int8.onnx','tokens.txt','README.md']){
  const target=path.join(folder,name);
  if(!fs.existsSync(target)){
    const partial=target+'.partial';
    if(!(name==='model.int8.onnx'&&fs.existsSync(partial)&&hash(partial)===expected))
      execFileSync('curl.exe',['-fL','--retry','1','--max-time','600',base+name,'-o',partial],{windowsHide:true,stdio:'inherit',timeout:620000});
    if(name==='model.int8.onnx'&&hash(partial)!==expected)throw Error('识别模型摘要不匹配，保留下载文件供检查');
    fs.renameSync(partial,target);
  }
  if(name==='model.int8.onnx'&&hash(target)!==expected)throw Error('识别模型摘要不匹配');
}
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({id:'paraformer-zh-en-2023-09-14',revision,license:'Apache-2.0',
  source:'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14/tree/'+revision,
  documentation:'https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-paraformer/paraformer-models.html',
  files:Object.fromEntries(['model.int8.onnx','tokens.txt','README.md'].map(n=>[n,hash(path.join(folder,n))]))},null,2));
console.log('本地中英识别与字词定位模型已就绪；不会上传音频。');

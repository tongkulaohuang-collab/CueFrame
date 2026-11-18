import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, publicConfig, saveConfig, safeError } from './settings.mjs';
import { createSpeechService } from './doubao-speech.mjs';

const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function jsonBody(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('请求须为 JSON。');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>15*1024*1024)throw Error('请求过大。');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
export function speechHandler(service=createSpeechService(), { embedVoiceManager = false } = {}) {
  return async(req,res,url)=>{
    const p=url.pathname;
    if(!['/voice','/voice.js','/voice.css'].includes(p)&&!p.startsWith('/api/speech/'))return false;
    try {
      if(['GET','HEAD'].includes(req.method)&&['/voice','/voice.js','/voice.css'].includes(p)){
        if(p==='/voice'){
          const ancestor=embedVoiceManager && url.searchParams.get('frameboard')==='voices' ? "'self'" : "'none'";
          res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob: https:; connect-src 'self'; frame-ancestors ${ancestor}; base-uri 'self'; form-action 'self'`);
        }
        const file=p==='/voice'?'voice.html':p.slice(1);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(req.method==='HEAD'?'':await fs.readFile(path.join(ROOT,'public',file)));return true;
      }
      if(p==='/api/speech/status'&&req.method==='GET'){send(res,200,await service.status());return true;}
      if(p==='/api/speech/history'&&req.method==='GET'){send(res,200,await service.history());return true;}
      const request=p.match(/^\/api\/speech\/requests\/([a-f0-9-]{36})$/);
      if(request&&req.method==='GET'){send(res,200,await service.getRequest(request[1]));return true;}
      const media=p.match(/^\/api\/speech\/files\/([a-f0-9-]{36})\/(narration\.(mp3|wav|txt)|timing\.json|subtitles\.srt)$/);
      if(media&&['GET','HEAD'].includes(req.method)){
        const base=await fs.realpath(service.outputs),file=await fs.realpath(path.join(base,media[1],media[2]));
        if(!file.startsWith(base+path.sep))throw Error('文件不可访问。');
        const bytes=await fs.readFile(file);res.setHeader('Content-Type',media[3]==='mp3'?'audio/mpeg':media[3]==='wav'?'audio/wav':'text/plain; charset=utf-8');res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?'':bytes);return true;
      }
      if(req.method==='POST'){
        const input=await jsonBody(req);let out;
        if(p==='/api/speech/config'){
          const allowed=['ttsApiKey','ttsAppId','ttsAccessKey'];const update=Object.fromEntries(allowed.filter(k=>k in input).map(k=>[k,input[k]]));
          await saveConfig(update);out={configured:publicConfig().hasTtsKey||publicConfig().hasTtsLegacy};
        }else if(p==='/api/speech/voices/register')out=await service.registerVoice(input);
        else if(p==='/api/speech/voices/select')out=await service.selectVoice(input.speaker_id);
        else if(p==='/api/speech/voices/query')out=await service.getVoice(input.speaker_id);
        else if(p==='/api/speech/upload')out=await service.uploadAudio(input.data,input.format);
        else if(p==='/api/speech/prepare')out=await service.prepare(input.kind,input.payload);
        else if(p==='/api/speech/execute')out=await service.execute(input.request_id,input);
        else {send(res,404,{error:'没有找到该操作。'});return true;}
        send(res,200,out);return true;
      }
      send(res,404,{error:'没有找到该资源。'});
    }catch(e){send(res,400,{error:safeError(e),code:e.code||'ERROR'});}
    return true;
  };
}

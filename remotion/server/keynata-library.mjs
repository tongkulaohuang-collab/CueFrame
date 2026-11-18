import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const upstream=JSON.parse(readFileSync(new URL('../vendor/keynata/catalog.json',import.meta.url),'utf8'));
const {revision,repository,licenseUrl}=upstream;
const labels={classical_duo:'弦乐二重奏',classical_piano:'古典钢琴',classical_quartet:'弦乐四重奏',
  jpop_3piece:'日系流行三重奏',karaoke:'流行伴奏',rock_intense:'强劲摇滚',rock_standard:'经典摇滚'};
const records=new Map();
for(const t of upstream.tracks){
  if(!labels[t.category] || !/^[a-z0-9_]+$/.test(t.id) || ![t.id+'.mp3',t.id+'_karaoke.mp3'].includes(t.file)
    || !/^[0-9a-f]{64}$/.test(t.sha256) || !Number.isFinite(t.audioSeconds) || t.audioSeconds<=0
    || !Number.isSafeInteger(t.bytes) || t.bytes<1 || t.bytes>64*1024*1024 || records.has(t.id))
    throw Error('Keynata 曲目清单无效：'+t.id);
  const rel='release/tracks/'+t.id+'/';
  records.set(t.id,{...t,name:labels[t.category]+' '+t.id.split('_').at(-1),
    entry:'https://github.com/'+repository+'/blob/'+revision+'/'+rel+'metadata.json',
    // Both hosts must return the exact MP3 described by the pinned per-track metadata.
    urls:['https://carf-coder.github.io/keynata-commons/'+rel+t.file,
      'https://raw.githubusercontent.com/'+repository+'/'+revision+'/'+rel+t.file]});
}
export const library={name:'Keynata Commons',revision,license:upstream.license,licenseUrl,categories:labels,
  tracks:[...records.values()].map(({id,name,category,bpm,audioSeconds})=>({id,name,category,bpm,seconds:audioSeconds}))};
export function trackFor(id){
  const t=records.get(id);
  if(!t) throw Object.assign(Error('曲库中没有这首音乐'),{status:404});
  return t;
}
export const musicCacheDir=path.join(process.env.FRAMEBOARD_DATA || fileURLToPath(new URL('../data/',import.meta.url)),'keynata',revision);
function matches(bytes,t){
  return bytes.length===t.bytes && createHash('sha256').update(bytes).digest('hex')===t.sha256;
}
async function download(t,fetcher){
  const failures=[];
  for(const url of t.urls){
    try {
      const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
      if(!response.ok) {await response.body?.cancel(); throw Error('HTTP '+response.status);}
      const chunks=[]; let size=0;
      for await(const chunk of response.body){
        size+=chunk.length;
        if(size>t.bytes) throw Error('文件长度与曲目清单不符');
        chunks.push(chunk);
      }
      const buf=Buffer.concat(chunks);
      if(matches(buf,t)) return buf;
      throw Error('校验不符，实际 '+buf.length+' 字节');
    } catch(e){failures.push(new URL(url).hostname+': '+(e.cause?.code||e.message));}
  }
  throw Object.assign(Error('暂时无法取得这首音乐的完整文件，请检查网络并重试。',{cause:failures.join(' / ')}),{status:502});
}
export function createMusicCache(dir=musicCacheDir,fetcher=fetch){
  const pending=new Map(), checked=new Map();
  async function resolve(t){
    const dest=path.join(dir,t.file);
    try {
      const stat=await fs.stat(dest);
      if(stat.size===t.bytes && (checked.get(dest)===stat.mtimeMs || matches(await fs.readFile(dest),t))){
        checked.set(dest,stat.mtimeMs); return dest;
      }
    } catch(e){if(e.code!=='ENOENT') throw e;}
    const buf=await download(t,fetcher);
    await fs.mkdir(dir,{recursive:true});
    const part=dest+'.'+randomUUID()+'.part';
    try{
      await fs.writeFile(part,buf,{flag:'wx'});
      await fs.rename(part,dest);
    } finally {await fs.rm(part,{force:true});}
    checked.set(dest,(await fs.stat(dest)).mtimeMs);
    return dest;
  }
  return id=>{
    const t=trackFor(id);
    if(!pending.has(id)) pending.set(id,resolve(t).finally(()=>pending.delete(id)));
    return pending.get(id);
  };
}
export const trackAudio=createMusicCache();

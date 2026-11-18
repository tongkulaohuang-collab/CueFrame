import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUTS = path.join(ROOT, 'outputs');
const configPath = path.join(ROOT, '.local', 'config.json');
const secretKeys = ['arkApiKey','ttsApiKey','ttsAccessKey'];
const fields = ['arkBaseUrl','textModel','videoModel','ttsResourceId','ttsSpeaker','ttsAppId','ttsVoiceDirection','ttsEmotion','ttsEmotionScale','ttsSpeechRate',...secretKeys];
const defaults = {
  arkBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  textModel: 'doubao-seed-2-1-lite-260915',
  videoModel: 'doubao-seedance-2-0-260128',
  ttsResourceId: 'seed-tts-2.0',
  ttsSpeaker: 'zh_female_vv_uranus_bigtts'
};
let saved = {};
try { saved = JSON.parse(await fs.readFile(configPath,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw new Error('本地配置文件损坏，请检查 .local/config.json'); }

export function getConfig() {
  // MCP and both web entry points share this file; never retain stale credentials or voice selection.
  try { saved=JSON.parse(readFileSync(configPath,'utf8')); } catch(e) { if(e.code!=='ENOENT')throw new Error('本地配置文件损坏，请检查 .local/config.json'); }
  return {...defaults,
    arkApiKey: process.env.ARK_API_KEY || '',
    ttsApiKey: process.env.DOUBAO_TTS_API_KEY || '',
    ttsAppId: process.env.DOUBAO_TTS_APP_ID || '',
    ttsAccessKey: process.env.DOUBAO_TTS_ACCESS_KEY || '',
    ...saved};
}
export function publicConfig() {
  const c=getConfig();
  const {arkApiKey,ttsApiKey,ttsAccessKey,...safe}=c;
  return {...safe,hasArkKey:!!arkApiKey,hasTtsKey:!!ttsApiKey,hasTtsLegacy:!!(c.ttsAppId&&ttsAccessKey)};
}
export async function saveConfig(input) {
  getConfig();
  const next={...saved};
  for (const key of fields) {
    if (!(key in input)) continue;
    if (secretKeys.includes(key) && !String(input[key]??'').trim()) continue;
    if (['ttsEmotionScale','ttsSpeechRate'].includes(key)) {
      if(input[key]===''||input[key]===null){delete next[key];continue;}
      const n=Number(input[key]);
      if(!Number.isFinite(n) || (key==='ttsEmotionScale'?(n<1||n>5):(n< -50||n>100))) throw new Error('情感强度需为 1–5，语速需为 -50–100');
      next[key]=n;
    } else {
      if(typeof input[key]!=='string'||input[key].length>4096)throw new Error('配置字段格式不正确');
      next[key]=input[key].trim();
    }
  }
  if(next.arkBaseUrl){const u=new URL(next.arkBaseUrl);if(u.protocol!=='https:'||!u.hostname.endsWith('.volces.com')||u.username||u.password||u.search||u.hash)throw new Error('方舟接口须使用官方 volces.com HTTPS 地址');}
  await fs.mkdir(path.dirname(configPath),{recursive:true});
  await fs.writeFile(configPath+'.tmp',JSON.stringify(next,null,2),{mode:0o600});
  await fs.rename(configPath+'.tmp',configPath);
  saved=next;
  return publicConfig();
}
export function safeError(error,config=getConfig()) {
  let message=String(error?.message||error||'未知错误');
  for(const k of secretKeys){if(config[k])message=message.split(config[k]).join('[已隐藏凭据]');}
  return message.slice(0,1600);
}

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import {isIP} from 'node:net';
import {createGunzip, createInflate, createBrotliDecompress} from 'node:zlib';
import ipaddr from 'ipaddr.js';
import {parseHTML} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {MAX_REFERENCE_TEXT, referenceUrls} from '../shared/references.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT = 20000;
const cache = new Map(), pending = new Map();

async function within(promise, signal) {
  signal.throwIfAborted();
  let abort;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, {once:true});
    })]);
  } finally { signal.removeEventListener('abort', abort); }
}

export const publicAddress = address => {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
};

export async function publicTarget(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 4096)
    throw Error('仅支持不含账号密码的 HTTP / HTTPS 网页链接');
  if (url.port && !['80', '443'].includes(url.port)) throw Error('仅支持标准网页端口');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{address: host, family: isIP(host)}] : await lookup(host, {all: true, verbatim: true});
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('仅支持公开网页，不读取本机或内网地址');
  return {url, address: addresses[0]};
}

function responseAt(url, address, signal, headers = {}) {
  return new Promise((resolve, reject) => {
    // Pin the checked DNS answer to the socket, including on every redirect.
    const req = (url.protocol === 'https:' ? https : http).get(url, {
      signal, agent: false, autoSelectFamily: false,
      lookup: (_host, options, cb) => cb(null, ...(options.all ? [[address]] : [address.address, address.family])),
      headers: {'User-Agent': 'Frameboard/1.0 (reference reader)', Accept: 'text/html,application/xhtml+xml,text/plain', 'Accept-Encoding': 'gzip, deflate, br', ...headers},
    }, resolve);
    req.on('error', reject);
  });
}

export async function resolvePublicHost(host, options, {lookup = dns.lookup, request = responseAt} = {}) {
  const addresses = await lookup(host, options);
  // Some desktop proxies use 198.18.0.0/15 as fake DNS answers. Resolve the
  // hostname independently over HTTPS instead of allowing reserved IPs.
  if (!addresses.length || !addresses.every(a => /^198\.(18|19)\./.test(a.address))) return addresses;
  const endpoint = new URL('https://dns.alidns.com/resolve');
  try {
    const target=await publicTarget(endpoint,lookup);
    return await publicAnswers(target,host,request);
  } catch {
    // The desktop proxy may also synthesize the resolver's DNS answer.
    // Bootstrap this public resolver at its published address; TLS still
    // authenticates the hostname. The media connection is pinned separately.
    return publicAnswers({url:new URL('https://cloudflare-dns.com/dns-query'),address:{address:'1.1.1.1',family:4}},host,request);
  }
}
async function publicAnswers({url:endpoint,address},host,request) {
  endpoint.searchParams.set('name', host); endpoint.searchParams.set('type', 'A');
  const signal = AbortSignal.timeout(6000);
  const res = await within(request(endpoint, address, signal, {Accept:'application/dns-json', 'Accept-Encoding':'identity'}), signal);
  try {
    if (res.statusCode !== 200) throw Error('代理 DNS 解析失败，请稍后重试');
    let bytes = 0; const chunks = [];
    for await (const chunk of res) {
      bytes += chunk.length;
      if (bytes > 32000) throw Error('DNS 返回内容异常');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const found = (data.Answer || []).filter(a => a.type === 1 && isIP(a.data) === 4).map(a => ({address:a.data,family:4}));
    if (data.Status !== 0 || !found.length) throw Error('未能获取网页的真实公网地址，请稍后重试');
    return found; // publicTarget validates these addresses before any connection.
  } finally { res.destroy(); }
}

export async function downloadPage(value, {lookup = resolvePublicHost, request = responseAt, signal = AbortSignal.timeout(TIMEOUT)} = {}) {
  let current = value;
  for (let hop = 0; hop <= 5; hop++) {
    signal.throwIfAborted();
    const {url, address} = await within(publicTarget(current, lookup), signal);
    signal.throwIfAborted();
    const response = await within(request(url, address, signal), signal);
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      response.destroy();
      if (!response.headers.location || hop === 5) throw Error('网页跳转过多或缺少目标地址');
      current = new URL(response.headers.location, url).href;
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw Error(`网页返回 HTTP ${response.statusCode}，可能需要登录或限制自动读取`);
    }
    const type = String(response.headers['content-type'] || '').toLowerCase();
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/.test(type)) {
      response.destroy();
      throw Error('此链接不是可提取的 HTML 或文本网页（PDF、视频和图片请另行提供文字资料）');
    }
    if (Number(response.headers['content-length']) > MAX_BYTES) {
      response.destroy(); throw Error('网页超过 2 MB，请提供正文摘录或更具体的页面');
    }
    let stream = response;
    const encoding = response.headers['content-encoding'];
    if (encoding && encoding !== 'identity') {
      const decompress = {gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress}[encoding];
      if (!decompress) { response.destroy(); throw Error('不支持此网页的压缩格式'); }
      stream = decompress();
      response.on('error', e => stream.destroy(e));
      response.pipe(stream);
    }
    const chunks = [];
    let bytes = 0;
    const abort = () => { stream.destroy(Error('读取超时')); response.destroy(); };
    signal.addEventListener('abort', abort, {once: true});
    try {
      for await (const chunk of stream) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw Error('解压后的网页超过 2 MB，请提供正文摘录');
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const meta = buffer.subarray(0, 4096).toString('ascii').match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
      const charset = type.match(/charset\s*=\s*["']?([\w-]+)/)?.[1] || meta?.[1] || 'utf-8';
      let body;
      try { body = new TextDecoder(charset).decode(buffer); }
      catch { body = new TextDecoder().decode(buffer); }
      return {body, type, finalUrl: url.href};
    } finally {
      signal.removeEventListener('abort', abort);
      stream.destroy(); response.destroy();
    }
  }
}

const clean = text => String(text || '').replace(/\r/g, '').replace(/[\t \u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export function extractPage({body, type, finalUrl}) {
  let title = new URL(finalUrl).hostname, text;
  if (type.startsWith('text/plain')) text = clean(body);
  else {
    // No script execution or subresource loading occurs in this detached DOM.
    const {document} = parseHTML(body);
    const base = document.createElement('base'); base.setAttribute('href', finalUrl); document.head.prepend(base);
    title = clean(document.title) || title;
    const hasPassword = !!document.querySelector('input[type="password"]');
    document.querySelectorAll('script,style,noscript,iframe,svg,canvas,form,nav,footer,header,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
    document.querySelectorAll('p,div,section,article,li,h1,h2,h3,h4,br,tr').forEach(node => node.appendChild(document.createTextNode('\n')));
    const article = new Readability(document.cloneNode(true), {charThreshold: 80, maxElemsToParse: 35000}).parse();
    const fallback = document.querySelector('article,main,[role="main"]') || document.body;
    text = clean(article?.textContent || fallback?.textContent);
    title = clean(article?.title) || title;
    const challenge = /just a moment|access denied|verify (?:you are|that you are) human|checking your browser|安全验证|访问验证|访问受限|请完成验证/i.test(title + '\n' + text.slice(0, 500));
    if (challenge || (hasPassword && text.length < 1000)) throw Error('网页需要登录或访问验证，请粘贴正文或换用公开链接');
  }
  if (!text || text.length < 80) throw Error('未能提取足够的正文，页面可能依赖脚本或只有摘要；请粘贴资料内容');
  return {title: title.slice(0, 500), text: text.slice(0, MAX_REFERENCE_TEXT), truncated: text.length > MAX_REFERENCE_TEXT};
}

export async function downloadVideo(value,options={}) {
 return downloadMedia(value,false,options);
}
export async function downloadImage(value,options={}) {
 return downloadMedia(value,true,options);
}
async function downloadMedia(value,image,{lookup=resolvePublicHost,request=responseAt,signal=AbortSignal.timeout(image?30000:120000)}={}){
 let current=value;const limit=(image?16:150)*1024*1024;
 const name=image?'素材图片':'参考视频';
 const accepts=image?'image/png,image/jpeg,image/webp,application/octet-stream':'video/mp4,video/webm,application/octet-stream';
 for(let hop=0;hop<=5;hop++){
  const {url,address}=await within(publicTarget(current,lookup),signal);
  const response=await within(request(url,address,signal,{Accept:accepts,'Accept-Encoding':'identity'}),signal);
  if([301,302,303,307,308].includes(response.statusCode)){
   response.destroy();if(!response.headers.location||hop===5)throw Error(name+'跳转过多');
   current=new URL(response.headers.location,url).href;continue;
  }
  try{
   if(response.statusCode!==200)throw Error(name+'返回 HTTP '+response.statusCode+'，请上传原文件');
   const type=String(response.headers['content-type']||'').toLowerCase();
   if(!accepts.split(',').includes(type.split(';')[0].trim()))throw Error(image?'请提供 PNG、JPEG 或 WebP 原图直链，或上传已取得的原图':'这个地址不是可直接读取的视频，请上传 MP4/WebM，或提供公开视频直链');
   if(Number(response.headers['content-length'])>limit)throw Error(name+'超过 '+limit/1048576+' MB');
   const chunks=[];let size=0;
   for await(const chunk of response){signal.throwIfAborted();size+=chunk.length;if(size>limit)throw Error(name+'超过 '+limit/1048576+' MB');chunks.push(chunk);}
   return {bytes:Buffer.concat(chunks),finalUrl:url.href};
  }finally{response.destroy();}
 }
}

export async function readReference(value, {force = false, download = downloadPage} = {}) {
  const url = referenceUrls(value)[0];
  if (!url || url !== value) throw Error('请提供完整的 HTTP / HTTPS 网页地址');
  if (pending.has(url)) return pending.get(url);
  const cached = cache.get(url);
  if (!force && cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.result;
  if (pending.size >= 24) throw Error('正在读取的链接较多，请稍后重试');
  const work = (async () => {
    let result;
    try {
      const page = await download(url);
      result = {url, finalUrl: page.finalUrl, status: 'ready', ...extractPage(page), fetchedAt: new Date().toISOString()};
    } catch (error) {
      const message = error.name === 'AbortError' || error.name === 'TimeoutError' ? '读取超时，请稍后重试或直接粘贴正文' :
        /^(ENOTFOUND|EAI_AGAIN|ECONN|CERT|ERR_TLS|UNABLE_)/.test(error.code || '') ? '无法连接此网页，请检查链接或稍后重试' : error.message;
      result = {url, status: 'failed', error: message, text: '', fetchedAt: new Date().toISOString()};
    }
    cache.delete(url); cache.set(url, {at: Date.now(), result});
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    return result;
  })();
  pending.set(url, work);
  try { return await work; } finally { pending.delete(url); }
}

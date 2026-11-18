import {referenceDocuments, referenceUrls, MAX_REFERENCE_URLS} from '../shared/references.mjs';

export function createReferenceClient(request) {
  const pending = new Map();
  function read(url, force = false) {
    if (pending.has(url)) return pending.get(url);
    const work = request('/api/references/read', {url, force})
      .catch(error => ({url, status:'failed', text:'', error:error.message}))
      .finally(() => pending.delete(url));
    pending.set(url, work);
    return work;
  }
  async function resolve(p, forceUrl) {
    const urls = referenceUrls(p.references);
    if (urls.length > MAX_REFERENCE_URLS) throw Error(`一次最多读取 ${MAX_REFERENCE_URLS} 条参考链接，请减少链接数量`);
    const existing = referenceDocuments(p);
    const documents = await Promise.all(urls.map(url => {
      // A retry in progress also takes priority over a previously failed record.
      if (pending.has(url)) return pending.get(url);
      return url !== forceUrl && existing.find(d => d.url === url) || read(url, url === forceUrl);
    }));
    return referenceDocuments({...p, referenceDocuments:documents});
  }
  return {resolve};
}

import {IssueNotice} from './IssueNotice';
import React, {useEffect, useRef, useState} from 'react';
import {Input} from './fields';
import {referenceDocuments, referenceUrls, MAX_REFERENCE_URLS} from '../shared/references.mjs';
import {createReferenceClient} from './reference-client.mjs';

export function useReferenceReader(p, set, request) {
  const client = useRef(null);
  if (!client.current) client.current = createReferenceClient(request);
  const latestSet = useRef(set); latestSet.current = set;
  const forced = useRef(null);
  const [revision, refresh] = useState(0);
  const [reading, mark] = useState({});
  useEffect(() => {
    if (!p) return;
    let active = true;
    const forceUrl = forced.current; forced.current = null;
    const urls = referenceUrls(p.references), docs = referenceDocuments(p);
    const missing = urls.filter(url => url === forceUrl || !docs.some(d => d.url === url));
    if (!missing.length || urls.length > MAX_REFERENCE_URLS) { mark({}); return; }
    mark({id:p.id, references:p.references, urls:missing, waiting:true});
    const timer = setTimeout(async () => {
      mark({id:p.id, references:p.references, urls:missing});
      try {
        const documents = await client.current.resolve(p, forceUrl);
        if (active) latestSet.current(current => current?.id === p.id && current.references === p.references ? {referenceDocuments:documents} : null);
      } finally { if (active) mark({}); }
    }, forceUrl ? 0 : 750);
    return () => {active = false; clearTimeout(timer);};
  }, [p?.id, p?.references, revision]);
  return {
    reading: reading.id === p?.id && reading.references === p?.references ? reading : {},
    retry: url => {forced.current = url; refresh(n => n + 1);},
    resolve: current => client.current.resolve(current),
  };
}

export function References({p, set, reader, busy}) {
  const urls = referenceUrls(p.references), docs = referenceDocuments(p);
  return <div className="reference-input">
    <Input area title="参考链接或资料说明" aria-label="参考链接或资料说明" value={p.references} disabled={busy}
      aria-describedby="reference-help" onChange={references => set({references,
        referenceDocuments:referenceDocuments({...p, references})})}/>
    <p id="reference-help" className="muted">粘贴完整网页链接后自动读取，可混合填写资料说明。正文将用于口播、分镜和资料检索，随草稿保存。最多 {MAX_REFERENCE_URLS} 条链接。</p>
    {urls.length > MAX_REFERENCE_URLS && <IssueNotice area="参考资料" error={`链接过多，请保留最多 ${MAX_REFERENCE_URLS} 条后读取。`}/>}
    <div role="status" aria-live="polite" aria-atomic="true" className="muted">
      {reader.reading.urls?.length ? `${reader.reading.waiting ? '等待读取' : '正在读取'} ${reader.reading.urls.length} 条参考链接…` :
        docs.length ? `已读取 ${docs.filter(d=>d.status==='ready').length} 条，读取失败 ${docs.filter(d=>d.status==='failed').length} 条。` : ''}
    </div>
    {urls.slice(0,MAX_REFERENCE_URLS).map(url => {
      const doc = docs.find(d => d.url === url), pending = reader.reading.urls?.includes(url);
      return <div className="detail reference-result" key={url}>
        <a href={url} target="_blank" rel="noreferrer">{doc?.title || url}</a>
        {pending || !doc ? <p>{reader.reading.waiting || !pending ? '等待读取…' : '正在读取网页正文…'}</p> : doc.status === 'ready' ? <>
          <p>已读取 · {doc.text.length.toLocaleString()} 字符{doc.truncated ? ' · 长文已截取前 20,000 字符' : ''}</p>
          <details><summary>查看读取的正文</summary><p className="muted">来源：{doc.finalUrl}</p><div className="reference-text">{doc.text}</div></details>
          <p className="muted">正文可供生成参考；科学结论仍需在资料区核实。</p>
        </> : <IssueNotice area="参考资料读取" error={'参考链接读取失败：'+doc.error}/>}
        {doc && <button type="button" disabled={busy || pending} onClick={()=>reader.retry(url)} aria-label={`${doc.status==='ready'?'重新读取':'重试读取'} ${doc.title || url}`}>
          {doc.status==='ready'?'重新读取':'重试读取'}</button>}
      </div>;
    })}
  </div>;
}

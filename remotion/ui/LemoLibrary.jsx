import React,{useEffect,useRef,useState} from 'react';
import {lemoLinks,lemoRepo,lemoStyle,lemoStyles} from '../shared/lemo.mjs';
import './lemo.css';
import {IssueNotice} from './IssueNotice';

const categories=[...new Set(lemoStyles.map(s=>s.cat))];
const pageSize=8;

function FilmPreview({style,current,busy,close,choose}) {
  const dialog=useRef(null);
  const [failed,setFailed]=useState(false);
  const links=lemoLinks(style);
  useEffect(()=>{
    const node=dialog.current;
    node.showModal();
    return ()=>node.close();
  },[]);
  return <dialog className="lemo-preview" aria-labelledby="lemo-title" ref={dialog}
    onCancel={close}>
    <header><div><small>{style.cat} · LemoLab</small><h2 id="lemo-title">{style.cn}</h2></div>
      <button autoFocus onClick={close}>关闭</button></header>
    <video key={style.slug} controls playsInline preload="metadata" poster={links.poster}
      src={links.preview} aria-label={style.cn+'官方样片'} onError={()=>setFailed(true)} />
    {failed&&<IssueNotice area="风格样片" error="在线样片加载失败。可以打开下方的官方原片，或稍后重新载入。"/>}
    <h3>{style.film}</h3><p>{style.line_cn}</p>
    <div className="lemo-actions"><a href={links.full} target="_blank" rel="noreferrer">打开官方原片 ↗</a>
      <a href={links.guide} target="_blank" rel="noreferrer">风格说明 ↗</a>
      <button className="primary" disabled={busy||current} onClick={()=>{close();choose(style.slug);}}>
        {current?'已用于本期':'本期使用'}</button></div>
  </dialog>;
}

export function LemoLibrary({selected,busy,choose}) {
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('');
  const [page,setPage]=useState(0);
  const [preview,setPreview]=useState(null);
  const current=lemoStyle(selected);
  const term=search.toLowerCase().trim();
  const matches=lemoStyles.filter(s=>(!category||s.cat===category) &&
    [s.cn,s.en,s.slug,s.cat,s.film,s.line_cn].some(text=>text.toLowerCase().includes(term)));
  const pages=Math.ceil(matches.length/pageSize);
  return <section className="panel lemo-library" aria-labelledby="lemo-library-title">
    <small>LEMO OPUSCAR</small><h2 id="lemo-library-title">Lemo 风格样片库</h2>
    <p className="muted">浏览 {lemoStyles.length} 种风格。先看样片，再决定本期的画面参考。</p>
    <div className="lemo-selection" aria-live="polite">
      <div><small>本期采用</small><b>{current?current.cn:'尚未选择 Lemo 风格'}</b></div>
      {current&&<><button onClick={()=>setPreview(current)}>回看样片</button>
        <button disabled={busy} onClick={()=>choose('')}>取消采用</button></>}
    </div>
    <div className="lemo-filters"><label>搜索风格<input type="search" placeholder="中文名、英文名或样片关键词"
      value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
      <label>分类<select value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}>
        <option value="">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
    <p className="lemo-count" role="status">{matches.length} 种风格{pages>0&&' · 第 '+(page+1)+' / '+pages+' 页'}</p>
    <div className="lemo-grid">{matches.slice(page*pageSize,(page+1)*pageSize).map(style=>
      <button key={style.slug} className={'lemo-card'+(selected===style.slug?' adopted':'')}
        aria-label={'看样片：'+style.cn} onClick={()=>setPreview(style)}>
        <img alt="" src={lemoLinks(style).poster} loading="lazy" width="320" height="180"/>
        <span className="lemo-card-body"><small>{selected===style.slug?'本期已选 · ':''}{style.cat}</small>
          <strong>{style.cn}</strong><span>{style.en}</span>
          <span className="lemo-play">▷ 看样片 · {Math.round(style.dur)} 秒</span></span>
      </button>)}</div>
    {!matches.length&&<p>没有匹配的风格。<button onClick={()=>{setSearch('');setCategory('');setPage(0);}}>清除筛选</button></p>}
    {pages>1&&<nav aria-label="样片分页"><button disabled={!page} onClick={()=>setPage(page-1)}>上一页</button>
      <button disabled={page+1===pages} onClick={()=>setPage(page+1)}>下一页</button></nav>}
    <p className="lemo-credit">样片与封面由 <a href={lemoRepo} target="_blank" rel="noreferrer">LemoLab</a> 创作，按 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> 提供。视频在线播放。</p>
    {preview&&<FilmPreview style={preview} current={preview.slug===selected} busy={busy}
      close={()=>setPreview(null)} choose={choose}/>}
  </section>;
}

import {IssueNotice} from './IssueNotice';
import React,{useDeferredValue,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Disc3,Pause,Play} from 'lucide-react';
import {Input,Select} from './fields';
import './keynata.css';

const perPage=8;
const clock=seconds=>{const s=Math.floor(seconds);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const media=id=>'/api/music/keynata/'+encodeURIComponent(id)+'/audio';
export function KeynataLibrary({request,run,busy,adopt,current,available=true,autoScroll=true}){
  const [lib,L]=useState(null),[failure,F]=useState(''),[reload,R]=useState(0);
  const [query,Q]=useState(''),[category,C]=useState(''),[length,D]=useState(''),[page,P]=useState(0);
  const [choice,S]=useState(''),[state,U]=useState('idle'),[message,M]=useState('');
  const player=useRef(null),active=useRef(''),root=useRef(null),filteredQuery=useDeferredValue(query);
  useEffect(()=>{
    let live=true;
    request('/api/music/keynata').then(data=>{if(live){L(data);F('');}}).catch(e=>{if(live)F(e.message);});
    return ()=>{live=false;};
  },[request,reload]);
  useEffect(()=>{
    if(autoScroll&&new URLSearchParams(location.search).get('view')==='music'){
      const t=requestAnimationFrame(()=>root.current?.scrollIntoView({block:'start'}));
      return ()=>cancelAnimationFrame(t);
    }
  },[]);
  const list=lib?.tracks||[],selected=list.find(t=>t.id===choice),adopted=list.find(t=>t.id===current);
  const q=filteredQuery.trim().toLowerCase();
  const matches=list.filter(t=>(!category || t.category===category)
    && (!length || (length==='short'?t.seconds<60:length==='long'?t.seconds>=180:t.seconds>=60&&t.seconds<180))
    && (!q || [t.id,t.name,t.bpm+' bpm'].some(v=>v.toLowerCase().includes(q))));
  const pages=Math.max(1,Math.ceil(matches.length/perPage)),index=Math.min(page,pages-1);
  function listen(t){
    const a=player.current;
    if(!a) return;
    if(active.current===t.id && !a.paused){a.pause();return;}
    if(active.current!==t.id || a.error){
      active.current=t.id;
      a.src=media(t.id); S(t.id); M('');
    }
    if(a.ended) a.currentTime=0;
    U('loading');
    a.play().catch(e=>{if(active.current===t.id && e.name!=='AbortError') U('error');});
  }
  const clear=()=>{Q('');C('');D('');P(0);};
  const status=state==='loading'?'正在载入…':state==='playing'?'正在播放':state==='error'?'未能播放，请检查连接后重试。':state==='end'?'播放结束':'已暂停';
  return <section ref={root} id="keynata-music" className="keynata" aria-label="Keynata Commons 曲库">
    <div className="kn-heading"><Disc3 aria-hidden="true" size={22}/><h3>Keynata Commons 曲库</h3>
      {lib&&<span className="kn-count">{list.length} 首</span>}</div>
    <p className="kn-intro">点一首试听，满意后再采用。<a href="https://carf-coder.github.io/keynata-commons/#license" target="_blank" rel="noreferrer">CC0 · 可商用 ↗</a></p>
    {!lib && (failure?<IssueNotice area="背景曲库" error={failure} onRetry={()=>{F('');R(reload+1);}} retryLabel="重新载入曲库"/>:<p role="status">正在读取曲库…</p>)}
    {lib&&<>
      <div className="kn-filters">
        <Input title="搜索曲目" type="search" placeholder="曲号、风格或 BPM" value={query} onChange={v=>{Q(v);P(0);}}/>
        <Select title="风格" value={category} options={[['','全部风格'],...Object.entries(lib.categories)]} onChange={v=>{C(v);P(0);}}/>
        <Select title="时长" value={length} options={[['','全部时长'],['short','不到 1 分钟'],['mid','1 至 3 分钟'],['long','3 分钟以上']]} onChange={v=>{D(v);P(0);}}/>
      </div>
      <div className="kn-results">
        <span aria-live="polite">{matches.length?'显示 '+(index*perPage+1)+'–'+Math.min(matches.length,(index+1)*perPage)+' / '+matches.length+' 首':'没有匹配的曲目'}</span>
        {(query||category||length)&&<button className="kn-reset" onClick={clear}>清除筛选</button>}
      </div>
      {matches.length>0&&<ul className="kn-tracks">{matches.slice(index*perPage,(index+1)*perPage).map(t=>{
        const on=t.id===choice,playing=on&&state==='playing';
        const Icon=playing?Pause:Play;
        return <li key={t.id}><button className={'kn-track'+(on?' kn-current':'')} aria-pressed={on}
          aria-label={(playing?'暂停 ':'试听 ')+t.name} onClick={()=>listen(t)}>
          <Icon size={16} aria-hidden="true"/><span>{t.name}{t.id===current&&<small>已采用</small>}</span>
          <span className="kn-bpm">{t.bpm} BPM</span><time>{clock(t.seconds)}</time>
        </button></li>;
      })}</ul>}
      {pages>1&&<nav className="kn-paging" aria-label="曲目翻页">
        <button aria-label="上一页曲目" disabled={index===0} onClick={()=>P(index-1)}><ChevronLeft size={16} aria-hidden="true"/></button>
        <span>第 {index+1} / {pages} 页</span>
        <button aria-label="下一页曲目" disabled={index===pages-1} onClick={()=>P(index+1)}><ChevronRight size={16} aria-hidden="true"/></button>
      </nav>}
      <div className="kn-player" hidden={!selected}>
        <div><b>{selected?.name}</b> <span role="status">{selected?status:''}</span></div>
        <audio ref={player} controls preload="none" aria-label="曲库试听播放器"
          onPlaying={()=>U('playing')} onWaiting={()=>U('loading')} onPause={()=>{if(player.current?.paused&&!player.current?.ended)U('paused');}}
          onEnded={()=>U('end')} onError={()=>U('error')}/>
        {state==='error'&&<IssueNotice area="音乐试听" error="音乐试听未能播放，请检查示例文件是否可用。" onRetry={()=>listen(selected)} retryLabel="重试试听"/>}
        <div className="kn-use">
          <button className="primary" disabled={busy||!available||!selected||choice===current} onClick={()=>run(async()=>{
            M('');
            try{await adopt(choice);player.current?.pause();M('已采用「'+selected.name+'」');}
            catch(e){M({error:e.message});throw e;}
          })}>{busy?'处理中…':choice===current?'本片已采用':'采用为本片 BGM'}</button>
        </div>
      </div>
      {!available&&<p className="muted">可以先试听，建立镜头后即可采用。</p>}
      {adopted&&<p className="kn-selected">本片曲库配乐 · <strong>{adopted.name}</strong></p>}
      {message?.error?<IssueNotice area="采用背景音乐" error={message.error}/>:message&&<p role="status">{message}</p>}
    </>}
  </section>;
}

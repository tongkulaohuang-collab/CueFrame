import {IssueNotice} from './IssueNotice';
import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {Input,Select} from './fields';

const samples={
  zh:'你好，这是我的声音。我们一起把复杂的知识，讲得清楚又有趣。',
  en:'Hello, this is my voice. Let us make complex ideas clear and interesting.',
  ja:'こんにちは、私の声を聞いてください。難しい知識も、わかりやすく楽しく伝えます。',
  ko:'안녕하세요. 제 목소리를 들어 보세요. 어려운 지식도 쉽고 재미있게 전해 드립니다.',
  es:'Hola, esta es mi voz. Vamos a explicar ideas complejas de forma clara e interesante.',
  fr:'Bonjour, voici ma voix. Rendons les idées complexes claires et intéressantes.',
  de:'Hallo, das ist meine Stimme. Wir erklären komplexe Ideen klar und interessant.',
  it:'Ciao, questa è la mia voce. Rendiamo le idee complesse chiare e interessanti.',
  pt:'Olá, esta é a minha voz. Vamos tornar as ideias complexas claras e interessantes.',
  ru:'Здравствуйте, это мой голос. Давайте объяснять сложные идеи просто и интересно.',
  id:'Halo, ini suara saya. Mari kita jelaskan ide yang rumit dengan jelas dan menarik.',
  vi:'Xin chào, đây là giọng nói của tôi. Hãy cùng giải thích kiến thức thật rõ ràng và thú vị.',
  th:'สวัสดี นี่คือเสียงของฉัน มาอธิบายเรื่องยากให้เข้าใจง่ายและน่าสนใจกัน',
  ar:'مرحباً، هذا صوتي. لنجعل الأفكار المعقدة واضحة وممتعة.',
  ms:'Helo, ini suara saya. Mari kita jelaskan idea yang rumit dengan jelas dan menarik.',
  nl:'Hallo, dit is mijn stem. Laten we complexe ideeën helder en interessant maken.',
  pl:'Cześć, to mój głos. Wyjaśniajmy trudne pomysły jasno i ciekawie.',
  tr:'Merhaba, bu benim sesim. Karmaşık fikirleri açık ve ilginç hale getirelim.',
  sv:'Hej, det här är min röst. Låt oss göra komplexa idéer tydliga och intressanta.',
  no:'Hei, dette er stemmen min. La oss gjøre komplekse ideer klare og interessante.',
  uk:'Вітаю, це мій голос. Пояснюймо складні ідеї просто й цікаво.',
  fi:'Hei, tämä on minun ääneni. Tehdään monimutkaisista asioista selkeitä ja kiinnostavia.',
  da:'Hej, det er min stemme. Lad os gøre komplekse idéer klare og interessante.',
  cs:'Ahoj, toto je můj hlas. Vysvětlujme složité myšlenky jasně a zajímavě.',
  hu:'Szia, ez az én hangom. Tegyük érthetővé és érdekessé az összetett gondolatokat.',
  el:'Γεια σας, αυτή είναι η φωνή μου. Ας εξηγήσουμε σύνθετες ιδέες απλά και ενδιαφέροντα.',
  ro:'Bună, aceasta este vocea mea. Să explicăm ideile complexe clar și interesant.',
  hi:'नमस्ते, यह मेरी आवाज़ है। आइए जटिल विचारों को सरल और रोचक बनाएं।',
  fil:'Kumusta, ito ang aking boses. Gawin nating malinaw at kawili-wili ang mahihirap na ideya.',
};
function sampleText(voice){const lang=voice.speaker_id.match(/^(?:ICL_uranus_)?([a-z]{2,3})_/)?.[1];return samples[lang==='kr'?'ko':lang]||samples.zh;}

export function VoiceLibrary({directory,speaker,onSelect,disabled,request,lang}) {
  const [query,Q]=useState(''),[filter,F]=useState(['zh','en'].includes(lang)?lang:'all'),[page,P]=useState(0);
  const [preview,V]=useState(null),[text,T]=useState(''),[record,R]=useState(null),[loading,L]=useState(false),[error,E]=useState('');
  const [playing,S]=useState(false),[audioFailed,AF]=useState(false);
  const audio=useRef(null),previewPanel=useRef(null),mounted=useRef(true),inFlight=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;audio.current?.pause();};},[]);
  useEffect(()=>{P(0);},[query,filter]);
  const voices=directory?.voices||[], needle=query.trim().toLocaleLowerCase();
  const filtered=voices.filter(v=>(!needle||[v.name,v.category,v.languages,v.gender,v.speaker_id].join(' ').toLocaleLowerCase().includes(needle))&&
    (filter==='all'||filter==='samples'&&v.sampleUrl||filter==='female'&&v.gender==='女声'||filter==='male'&&v.gender==='男声'||
      filter==='zh'&&v.languages?.includes('中文')||filter==='en'&&/英语|英文/.test(v.languages||'')||filter==='clone'&&v.kind==='clone'));
  const pages=Math.max(1,Math.ceil(filtered.length/12)),pageIndex=Math.min(page,pages-1);
  const currentSrc=record?.status==='completed'?record.result?.audio_url:preview?.sampleUrl;
  async function choosePreview(voice){
    if(inFlight.current)return;
    audio.current?.pause();
    flushSync(()=>{V(voice);T(sampleText(voice));R(null);E('');S(false);AF(false);});
    previewPanel.current?.scrollIntoView({block:'center'});
    if(voice.sampleUrl){audio.current?.play().catch(()=>{});return;}
    // Preparing only looks up/creates a local request. It never submits synthesis.
    inFlight.current=true;L(true);
    try{const r=await request('/api/doubao/previews',{action:'prepare',speaker:voice.speaker_id,text:sampleText(voice)});if(mounted.current)R(r);}
    catch(e){if(mounted.current)E(e.message);}
    finally{inFlight.current=false;if(mounted.current)L(false);}
  }
  function toggleAudio(){if(!audio.current)return;if(audio.current.paused){audio.current.play().catch(()=>E('播放未能开始，请重试。'));}else audio.current.pause();}
  async function call(action,extra={}){
    if(inFlight.current)return;
    inFlight.current=true;L(true);E('');
    let pending=record;
    try{
      if(action==='generate'){
        pending=await request('/api/doubao/previews',{action:'prepare',speaker:preview.speaker_id,text});
        if(mounted.current)R(pending);
        if(pending.status==='prepared')pending=await request('/api/doubao/previews',{action:'execute',requestId:pending.id,confirmed:true});
      }else if(action==='prepare'){
        pending=await request('/api/doubao/previews',{action,speaker:preview.speaker_id,text,...extra});
      }else pending=await request('/api/doubao/previews',{action:'check',requestId:record.id});
      if(mounted.current)R(pending);
    }catch(e){
      if(pending?.id){try{pending=await request('/api/doubao/previews',{action:'check',requestId:pending.id});}catch{pending={...pending,status:'submitted'};}}
      if(mounted.current){R(pending);E(e.message);}
    }finally{inFlight.current=false;if(mounted.current)L(false);}
  }
  return <section className="voice-library" aria-label="音色列表与试听">
    <h3>音色列表与试听 · {voices.length} 个音色</h3>
    <p className="muted">豆包语音合成 2.0 · 官方目录。可搜索名称、声音特点或用途；实际调用权限以你的账户为准。</p>
    <div className="voice-library-filters">
      <Input title="搜索音色" value={query} onChange={Q} placeholder="例如：云舟、女声、有声阅读"/>
      <Select title="筛选音色" value={filter} onChange={F} options={[
        ['all','全部音色'],['zh','中文'],['en','英语'],['female','女声'],['male','男声'],['samples','有官方免费试听'],['clone','我的音色']
      ]}/>
    </div>
    {preview&&<section ref={previewPanel} className="voice-preview" aria-label="音色试听">
      <div className="voice-preview-heading"><strong>{preview.name} · 试听</strong>
        <button disabled={loading} onClick={()=>{audio.current?.pause();V(null);R(null);}}>关闭试听</button></div>
      {currentSrc?<><audio ref={audio} key={currentSrc} controls preload="metadata" src={currentSrc}
        aria-label={preview.name+' 音色试听'} onPlay={()=>S(true)} onPause={()=>S(false)} onEnded={()=>S(false)}
        onError={()=>{AF(true);E('试听音频暂时无法加载，请重试或打开官方音色页面。');}}/>
        <button onClick={toggleAudio}>{playing?'暂停试听':'播放试听'}</button>
        {audioFailed&&preview.sampleUrl&&<button disabled={loading} onClick={()=>choosePreview({...preview,sampleUrl:null})}>改用 API 生成试听（按账户计费）</button>}
        <p className="muted">{preview.sampleUrl?'官方示例，播放不产生配音调用费用。':'本次试听已保存，再次试听复用这条音频。'}</p></>:
        <><p className="muted">该音色暂无可用的官方示例。可按下面的短文生成试听；将按账户实际资费计费，生成后可重复播放。{preview.kind==='clone'?'本人复刻音色还可能涉及槽位费用。':''}</p>
          <Input area title="试听文案" value={text} maxLength={100} disabled={loading||!!record&&record.status!=='prepared'} onChange={value=>{T(value);R(null);}}/>
          {(!record||record.status==='prepared')&&<button disabled={loading||!directory.configured||!text.trim()} onClick={()=>call('generate')}>
            {loading?'正在生成试听…':`生成试听（${[...text.trim()].length} 字，按账户计费）`}</button>}
          {record&&['submitted','needs_review'].includes(record.status)&&<><p role="status">原试听请求尚待核对，查询不会重新提交。重新准备可能重复计费。</p>
            <button disabled={loading} onClick={()=>call('check')}>查询原试听请求</button>
            <button disabled={loading} onClick={()=>call('prepare',{retry:true,acknowledgeUncertain:true})}>已核对原请求，重新准备试听</button></>}
          {record?.status==='failed'&&<button disabled={loading} onClick={()=>call('prepare',{retry:true})}>重新准备试听</button>}
        </>}
      {loading&&<p role="status">正在处理试听请求…</p>}
      {(error||record?.error)&&<IssueNotice area="音色试听" job={record} error={error||record.error} onRetry={record?()=>call('check'):undefined} retryLabel="查询原试听请求"/>}
      <button disabled={disabled} aria-pressed={speaker===preview.speaker_id} onClick={()=>onSelect(preview.speaker_id)}>
        {speaker===preview.speaker_id?'已选此音色':'使用这个音色'}</button>
    </section>}
    <p className="muted" role="status">找到 {filtered.length} 个音色 · 第 {pageIndex+1} / {pages} 页</p>
    <div className="voice-library-grid">{filtered.slice(pageIndex*12,(pageIndex+1)*12).map(v=><article key={v.speaker_id}
      className={'voice-option'+(speaker===v.speaker_id?' is-selected':'')}>
      <div><strong>{v.name}</strong><span className="muted">{v.gender|| (v.kind==='clone'?'本人音色':'')} · {v.category?.split(/[,，]/)[0]||'自定义'}</span></div>
      <p className="muted">{v.languages||'跟随录音语种'}</p>
      <div className="voice-option-actions"><button type="button" disabled={loading} onClick={()=>choosePreview(v)}
        aria-label={(v.sampleUrl?'试听 ':'准备试听 ')+v.name}>{v.sampleUrl?'免费试听':'准备试听'}</button>
        <button type="button" disabled={disabled} aria-pressed={speaker===v.speaker_id} onClick={()=>onSelect(v.speaker_id)}
          aria-label={'选择音色 '+v.name}>{speaker===v.speaker_id?'已选择':'选择'}</button></div>
    </article>)}</div>
    {!filtered.length&&<p>没有匹配的音色。试试“女声”“通用场景”，或清空筛选。</p>}
    <nav className="voice-library-pages" aria-label="音色分页"><button disabled={pageIndex===0} onClick={()=>P(pageIndex-1)}>上一页</button>
      <span>{pageIndex+1} / {pages}</span><button disabled={pageIndex+1>=pages} onClick={()=>P(pageIndex+1)}>下一页</button></nav>
    <p className="muted"><a href={directory?.catalogSource||'https://docs.volcengine.com/docs/doubao-voice/tone-list-3?lang=zh'} target="_blank" rel="noreferrer">查看官方音色目录</a>
      {' · 更新于 '+(directory?.catalogUpdated||'2026-11-09')}</p>
  </section>;
}

import React,{useRef,useState} from 'react';

function stamp(seconds){
 const ms=Math.round(seconds*1000);
 return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}

function SegmentPlayer({row,review,label}){
 const player=useRef(null);
 const [error,setError]=useState('');
 const start=Math.max(0,row.from-5),end=Math.min(review.duration,row.until+1);
 if(!review.videoUrl)return <p role="alert">这次分析的原片缺失或已改变，暂时无法播放。</p>;
 async function replay(){
  const v=player.current;
  try {setError('');v.currentTime=start;await v.play();}catch{setError('片段暂时无法播放，请用下方链接打开原片。');}
 }
 return <div className="ref-review-player">
  <video ref={player} controls playsInline preload="metadata" aria-label={label+'复核视频'}
   src={review.videoUrl+'#t='+start.toFixed(3)+','+end.toFixed(3)}
   onPlay={e=>{const v=e.currentTarget;if(v.currentTime<start-.1||v.currentTime>=end-.01)v.currentTime=start;}}
   onTimeUpdate={e=>{const v=e.currentTarget;if(!v.paused&&v.currentTime>=end)v.pause();}}
   onError={()=>setError('视频加载失败，可以打开原片或刷新后重试。')}/>
  <div className="ref-player-tools"><button type="button" onClick={replay}>从前文播放</button>
   <a href={review.videoUrl+'#t='+row.from} target="_blank" rel="noreferrer">打开原片</a></div>
  {error&&<p role="alert">{error}</p>}
 </div>;
}

export function ReferenceSegmentReview({groups,busy,decide}){
 if(!groups.length)return null;
 const rows=groups.flatMap(({j,issue,decisions})=>issue.review.segments.map(row=>({
  j,issue,row,decision:decisions[row.id],label:row.number?'第 '+row.number+' 段':row.id==='whole'?'整条参考片':'缺少分析的时段',
 })));
 const pending=rows.filter(r=>!r.decision).length;
 return <section className="ref-review-list" aria-label="参考片段人工审核">
  <header><h3>参考片段人工审核</h3><span role="status">{pending?'待审核 '+pending+' 段':'审核已完成'} · 共 {rows.length} 段</span></header>
  <p>通过的片段可供本期脚本引用。去掉后，该时段将从本期参考中排除。</p>
  {rows.map(({j,issue,row,decision,label})=><article key={j.id+issue.review.key+row.id} aria-label={issue.name+' '+label}>
   <div className="ref-review-heading"><h4>{issue.name} · {label}</h4>
    <span className="ref-review-status" data-state={decision||'pending'} role="status">{decision==='approved'?'已通过':decision==='excluded'?'已去掉':'待审核'}</span></div>
   <p className="ref-review-time"><b>原片时间</b> <time>{stamp(row.from)} – {stamp(row.until)}</time></p>
   <div className="ref-review-body"><SegmentPlayer row={row} review={issue.review} label={label}/>
    <div className="ref-review-decision"><strong>未通过原因</strong><p>{row.reason}</p>
     {row.description&&<p className="muted">{row.description}</p>}
     <div className="ref-review-actions" role="group" aria-label={label+'审核决定'}>
      <button type="button" aria-pressed={decision==='approved'} disabled={busy||!issue.review.videoUrl||decision==='approved'}
       onClick={()=>decide({jobId:j.id,key:issue.review.key,segmentId:row.id,decision:'approved'})}>通过</button>
      <button type="button" aria-pressed={decision==='excluded'} disabled={busy||!issue.review.videoUrl||decision==='excluded'}
       onClick={()=>decide({jobId:j.id,key:issue.review.key,segmentId:row.id,decision:'excluded'})}>去掉这一段</button>
     </div>
    </div>
   </div>
  </article>)}
 </section>;
}

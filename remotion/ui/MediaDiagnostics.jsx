import React,{useEffect,useRef} from 'react';

// Event evidence describes the browser, not the audible quality of the file.
export function useMediaDiagnostics(ref,id) {
  const records=useRef([]);
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    records.current=[];
    const observe=event=>{
      const q=el.getVideoPlaybackQuality?.();
      records.current.push({event:event.type,wall:Date.now(),time:el.currentTime,paused:el.paused,
        readyState:el.readyState,networkState:el.networkState,rate:el.playbackRate,
        buffered:Array.from({length:el.buffered.length},(_,i)=>[el.buffered.start(i),el.buffered.end(i)]),
        dropped:q?.droppedVideoFrames,total:q?.totalVideoFrames,error:el.error?.code||null});
      if(records.current.length>600)records.current.shift();
    };
    const events=['loadstart','emptied','loadedmetadata','play','playing','pause','waiting','stalled','seeking','seeked','ratechange','ended','error'];
    events.forEach(name=>el.addEventListener(name,observe));observe({type:'mounted'});
    return()=>{observe({type:'unmounted'});events.forEach(name=>el.removeEventListener(name,observe));};
  },[ref,id]);
  return ()=>({mediaId:id,scope:'browser-events-only',events:records.current});
}
export function MediaDiagnostics({read}) {
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(read(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='播放诊断.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <details><summary>播放中断排查</summary><p className="muted">网页暂停、重新载入或缓冲：下载本次播放记录。画面继续但声音断裂：在配音步骤试听同一句原声，再与成片比较。两种问题分别记录，播放正常不代表音轨正常。</p><button onClick={download}>下载本次播放记录</button></details>;
}

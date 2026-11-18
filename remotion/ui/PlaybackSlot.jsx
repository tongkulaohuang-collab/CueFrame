import React,{useState} from 'react';
// A new render is a pending choice, not permission to replace playing media.
export function PlaybackSlot({job,children}) {
  const [display,setDisplay]=useState(job);
  const current=display.id===job.id?job:display;
  return <div className="playback-slot">
    {display.id!==job.id&&<p className="hint">新版本已就绪，当前保留上一版。<button onClick={()=>setDisplay(job)}>切换到新版本</button></p>}
    {children(current)}
  </div>;
}

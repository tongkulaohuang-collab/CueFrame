import React from 'react';
import {AbsoluteFill,Audio,OffthreadVideo,Sequence,useCurrentFrame,useVideoConfig} from 'remotion';
import {MotionScene} from './MotionScene';
import {MusicBed} from './MusicBed';
import {MIX} from '../shared/audio-mix.mjs';
// A process clip fills the frame. Project/shot/beat names never become overlays.
export function ContinuousScene({shot,assets=[],voices=[],music,musicOffsetFrames=0,audioContext,captionCues=[],burnCaptions=false,hideCaptions=false,silent=false,base='',variant='zh'}){
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  const video=assets.find(a=>a.id===shot.processVideoId&&a.kind==='video');
  const cue=captionCues.findLast(c=>c.from<=frame&&(c.until==null||frame<c.until));
  return <AbsoluteFill style={{background:'#07111F'}}>
    {video?<OffthreadVideo muted src={base+video.src} trimBefore={Math.round((shot.processOffset||0)*fps)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:shot.motionPlan&&<MotionScene plan={shot.motionPlan} assets={assets} base={base}/>}
    {!silent&&voices.map(v=><Sequence key={v.asset.id} from={v.from} durationInFrames={v.frames}><Audio src={base+v.asset.src} volume={MIX.voice}/></Sequence>)}
    {!silent&&music&&<MusicBed {...{music,voices,base}} captions={captionCues} offset={musicOffsetFrames} context={audioContext}/>}
    {burnCaptions&&!hideCaptions&&cue&&<div style={{position:'absolute',bottom:'4%',left:'8%',right:'8%',fontFamily:'Microsoft YaHei, sans-serif',fontSize:28,color:'white',textAlign:'center',textShadow:'0 2px 5px black'}}>{cue[variant]}</div>}
  </AbsoluteFill>;
}

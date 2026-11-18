import React from 'react';
import {Audio,Sequence,useCurrentFrame,useVideoConfig} from 'remotion';
import {musicGain,speechWindows} from '../shared/audio-mix.mjs';

export function MusicBed({music,voices=[],captions=[],base='',offset=0,context}) {
  const frame=useCurrentFrame(),{fps,durationInFrames}=useVideoConfig();
  if(!music)return null;
  const windows=context?.windows||speechWindows(voices,fps,captions);
  const time=(frame+(context?.start||0))/fps;
  const duration=(context?.frames||durationInFrames)/fps;
  return <Sequence from={-offset}><Audio loop src={base+music.src}
    volume={musicGain(time,windows,duration)} loopVolumeCurveBehavior="extend"/></Sequence>;
}

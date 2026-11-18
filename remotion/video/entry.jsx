import React from "react";
import { Composition, registerRoot } from "remotion";
import { ShotScene } from "./Scene";
import { Film } from "./Film";
import {MotionScene} from './MotionScene';
const fallback = {
  id: "sample",
  title: "样镜",
  visual: "",
  zh: "",
  en: "",
  graphic: "步骤图",
  labels: [],
};
function Root() {
  return (
    <>
      <Composition id="SemanticScene" component={MotionScene} width={960} height={540} fps={24} durationInFrames={144}
        defaultProps={{plan:{width:960,height:540,duration:6,bg:'#ffffff',nodes:[],annotations:[],camera:[{time:0,x:480,y:270,zoom:1},{time:6,x:480,y:270,zoom:1}]},assets:[]}}
        calculateMetadata={({props})=>({width:props.plan.width,height:props.plan.height,fps:props.plan.fps||24,durationInFrames:Math.round(props.plan.duration*(props.plan.fps||24)),props})}/>
      <Composition
        id="SampleShot"
        component={ShotScene}
        width={960}
        height={540}
        fps={24}
        durationInFrames={96}
        defaultProps={{
          shot: fallback,
          canvas: { width: 960, height: 540, fps: 24, frames: 96 },
        }}
        calculateMetadata={({ props }) => ({
          width: props.canvas.width,
          height: props.canvas.height,
          fps: props.canvas.fps,
          durationInFrames: props.canvas.frames,
          props,
        })}
      />
      <Composition
        id="FullFilm"
        component={Film}
        width={1920}
        height={1080}
        fps={24}
        durationInFrames={1}
        defaultProps={{
          rows: [],
          captions: [],
          music: [],
          canvas: { width: 1920, height: 1080, fps: 24, frames: 1 },
        }}
        calculateMetadata={({ props }) => ({
          width: props.canvas.width,
          height: props.canvas.height,
          fps: props.canvas.fps,
          durationInFrames: props.canvas.frames,
          props,
        })}
      />
    </>
  );
}
registerRoot(Root);

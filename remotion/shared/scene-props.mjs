import { timeline } from "./model.mjs";
import { beatLabels, beatsFor } from "./direction.mjs";
import {speechWindows} from './audio-mix.mjs';
import {captionDisplayCues} from './overlays.mjs';
import {shotImagePlan} from './shot-images.mjs';
import {compileSemanticScene} from './semantic-scenes.mjs';
import {semanticOptions} from './semantic-context.mjs';
import {applyPhraseEdits,resolvePhraseEdits} from './phrase-edits.mjs';
import {shotVisualAssetIds} from './image-text-layers.mjs';
export const RENDER_PIPELINE_VERSION='reference-style-priority-v8-2026-11-17';
export function sceneProps(
  p,
  id,
  variant = p.voice,
  base = "",
  tl = timeline(p, variant),
  includePrevious = true,
) {
  const idx = tl.rows.findIndex((r) => r.shot.id === id);
  if (idx < 0) throw Error("镜头不存在");
  const r = tl.rows[idx];
  let shot=p.productionMode==='model-process'&&r.shot.semanticScene?{...r.shot,processVideoId:undefined,motionPlan:compileSemanticScene(r.shot.semanticScene,semanticOptions(p,r.shot,r,variant))}:
    r.shot.imageBindings?.length ? {...r.shot,motionPlan:shotImagePlan(r.shot.motionPlan,r.shot.imageBindings)} : r.shot;
  if(!(p.productionMode==='model-process'&&r.shot.semanticScene)&&shot.phraseEdits?.length){
    if(!shot.motionPlan)throw Error('词组编辑需要可编辑的文字画面');
    shot={...shot,motionPlan:structuredClone(shot.motionPlan)};
    applyPhraseEdits(shot.motionPlan.nodes,resolvePhraseEdits(shot,r,variant,p.fps),r.frames/p.fps);
  }
  const previous=includePrevious&&shot.libraryTransition&&idx>0 ? sceneProps(p,tl.rows[idx-1].shot.id,variant,base,tl,false) : null;
  return {
    ...(previous?{previousScene:{...previous,shot:{...previous.shot,libraryTransition:null}}}:{}),
    shot,
    index: idx + 1,
    kind: p.kind,
    burnCaptions: p.burnCaptions ?? false,
    ...(p.filmStyle?{captionBackplate:true}:{}),
    captionMode: p.captionMode || 'voice',
    look: r.shot.layout ? "directed" : p.look || "classic",
    productType: p.productType,
    beatLabels: beatLabels(r.shot, p.kind),
    beats: beatsFor({
      frames: r.frames,
      fps: p.fps,
      captionCues: r.captionCues,
      voices: r.voices,
      language: p.language,
      pace: r.shot.pace,
    }),
    language: p.language,
    variant,
    base,
    canvas: { width: p.width, height: p.height, fps: p.fps, frames: r.frames },
    assets: p.assets.filter((a) => shotVisualAssetIds(shot).includes(a.id)),
    voices: r.voices,
    cues: r.cues,
    captionCues: (r.shot.captionLayout||p.captionLayout)==='short'
      ? captionDisplayCues(r.captionCues,r.frames,p.captionMode) : r.captionCues,
    music: r.music || null,
    audioContext:{start:r.from,frames:tl.frames,windows:speechWindows(
      tl.rows.flatMap(row=>row.voices.map(v=>({...v,from:row.from+v.from}))),p.fps,
      tl.rows.flatMap(row=>row.captionCues.map(c=>({...c,from:row.from+c.from,until:c.until==null?undefined:row.from+c.until}))))},
    musicOffsetFrames: p.scienceFlow?.bgmId && r.music ? r.from % Math.max(1,Math.ceil(r.music.duration*p.fps)) : 0,
  };
}

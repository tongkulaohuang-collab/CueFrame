import {graphicsState,textRuns} from './graphics-state.mjs';
import {sampleMotion} from './motion-dynamics.mjs';

const graphic=node=>(node.graphics??={version:1,tracks:[],morphs:[],textStates:[]});
const ordered=frames=>frames.filter((f,i)=>!i||f.time>frames[i-1].time);
const pose=(base,time,opacity)=>({...base,time,opacity});

// Apply to the same production nodes, after generic style retiming. Actual
// voice times are never run through a percentage-of-duration mapping again.
export function applyNarrationMotion(nodes,scene,{focusBeats=[],duration,filmStyle},theme){
  if(!filmStyle?.narrationMotion||!focusBeats.length)return;
  for(const beat of focusBeats){
    const item=scene.items.find(v=>v.id===beat.entityId),target=nodes.find(n=>n.id==='sem-'+beat.entityId),label=nodes.find(n=>n.id==='sem-label-'+beat.entityId);
    if(label){graphic(label).textCues=[{start:0,end:label.text.value.length,from:beat.from,until:beat.until,mode:'emphasis',color:theme.accent},...(scene.family==='narrative'?[{start:0,end:label.text.value.length,from:beat.from,until:Math.min(duration,beat.from+.15),mode:'reveal'}]:[])];}
    if(item?.focus&&target?.media){
      const end=Math.min(duration,beat.from+.4),f=item.focus;
      for(const [channel,value,initial] of [['mediaZoom',f.zoom,1],['focusX',f.x,50],['focusY',f.y,50]]){
        graphic(target).tracks.push({channel,frames:ordered([{time:0,value:initial},{time:beat.from,value:initial},{time:end,value,easing:'smooth'},{time:duration,value}])});
      }
    }
  }
  if(scene.family==='product'){
    // Only use a complete, ordered voice schedule. Partial cues keep the
    // existing timing, instead of inventing unspoken transitions.
    const starts=scene.items.map(v=>focusBeats.find(b=>b.entityId===v.id)?.from);
    if(starts.every(Number.isFinite)&&starts.every((v,i)=>!i||v-starts[i-1]>.4)){
      scene.items.forEach((v,i)=>{
        const target=nodes.find(n=>n.id==='sem-'+v.id),label=nodes.find(n=>n.id==='sem-label-'+v.id);
        const from=i?starts[i]:0,until=i<starts.length-1?starts[i+1]:duration,blend=.12;
        const base=target.frames[0];
        target.frames=ordered([pose(base,0,i?0:1),...(i?[pose(base,Math.max(.001,from-blend),0),pose(base,from,1)]:[]),...(i<starts.length-1?[pose(base,until-blend,1),pose(base,until,0)]:[]),pose(base,duration,i===starts.length-1?1:0)]);
        const l=label.frames[0];label.frames=ordered([pose(l,0,i?0:1),...(i?[pose(l,Math.max(.001,from-.001),0),pose(l,from,1)]:[]),...(i<starts.length-1?[pose(l,until-.001,1),pose(l,until,0)]:[]),pose(l,duration,i===starts.length-1?1:0)]);
      });
    }
  }
}

// Match same-identity objects at a cut. This changes only the entrance; the
// destination pose, numerical process and audio timeline are untouched.
export function applyMatchedHandoff(nodes,scene,{previousPlan,duration,fps=24,filmStyle}){
  if(!filmStyle?.matchCuts||!previousPlan)return [];
  if(!['comparison','product','narrative'].includes(scene.family)||previousPlan.semanticModel?.family!==scene.family)return [];
  const matched=[],end=Math.min(.4,duration*.1),previousTime=previousPlan.duration-1/fps;
  for(const n of nodes){
    if(!/^sem-(?:label-|value-)?/.test(n.id)||n.id==='sem-subject'||n.id==='sem-title')continue;
    const prior=previousPlan.nodes.find(v=>v.id===n.id);if(!prior)continue;
    const old=sampleMotion(prior.frames,previousTime),oldGraphic=graphicsState(prior,previousTime,previousPlan),now=sampleMotion(n.frames,end);
    if(n.media){if(n.media.assetId!==prior.media?.assetId||n.media.width!==prior.media.width||n.media.height!==prior.media.height)continue;}
    else if(n.text){if(oldGraphic.value!==graphicsState(n,0,{fps}).value)continue;
      if(old.opacity>.99&&textRuns(prior,oldGraphic.lines||[prior.text.value],previousTime,fps).flat().every(r=>r.opacity>.99)&&n.graphics?.textCues)n.graphics.textCues=n.graphics.textCues.filter(c=>c.mode!=='reveal');}
    else if(JSON.stringify(oldGraphic.paths)!==JSON.stringify(n.paths))continue;
    n.frames=[{...old,time:0},{...now,time:end,easing:'smooth'},...n.frames.filter(f=>f.time>end)];
    if(scene.family==='narrative'&&old.opacity>.99)for(const f of n.frames)f.opacity=1;
    if(n.media)for(const channel of ['mediaZoom','focusX','focusY']){
      const g=graphic(n),initial=oldGraphic[channel],dest=graphicsState(n,end,{fps})[channel],track=g.tracks.find(t=>t.channel===channel);
      const changedAt=track?.frames.findIndex(f=>f.value!==track.frames[0].value);
      const frames=changedAt>0?track.frames.map((f,i)=>i<changedAt?{...f,value:initial}:{...f}):[{time:0,value:initial},{time:end,value:dest,easing:'smooth'},...(track?.frames.filter(f=>f.time>end)||[{time:duration,value:dest}])];
      g.tracks=g.tracks.filter(t=>t.channel!==channel);g.tracks.push({channel,frames});
    }
    matched.push(n.id);
  }
  return matched;
}

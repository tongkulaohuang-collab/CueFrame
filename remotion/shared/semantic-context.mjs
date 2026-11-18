import {filmStyleContext} from './film-style.mjs';
import {currentAlignment,quoteOnset} from './voice-alignment.mjs';
import {timeline} from './model.mjs';
import {compileSemanticScene} from './semantic-scenes.mjs';
import {resolvePhraseEdits} from './phrase-edits.mjs';
export function semanticOptions(p,shot,row,variant=p.voice,{includePrevious=true,rows=null,cache=new Map()}={}) {
  const options={width:p.width,height:p.height,fps:p.fps,duration:row.frames/p.fps,assets:p.assets,filmStyle:filmStyleContext(p),phraseEdits:resolvePhraseEdits(shot,row,variant,p.fps),handoff:shot.handoff};
  if(p.filmStyle?.matchCuts&&shot.handoff?.mode==='continue'&&['comparison','narrative'].includes(shot.semanticScene?.family)){
    let anchor=p.shots.findIndex(s=>s.id===shot.id);
    while(anchor>0&&p.shots[anchor].handoff?.mode==='continue'&&p.shots[anchor-1].semanticScene?.family===shot.semanticScene.family)anchor--;
    options.continuityOrder=p.shots[anchor].semanticScene.items.map(v=>v.id);
  }
  if((p.filmStyle?.narrationFocus||p.filmStyle?.narrationMotion)&&shot.semanticScene&&shot.semanticScene.family!=='physical'){
    const voice=row.voices?.find(v=>v.asset.role===variant),alignment=currentAlignment(shot,voice?.asset,variant);
    if(alignment){const beats=[];
      for(const item of shot.semanticScene.items){const quote=item.focusQuote||item.label;try{const cue=quoteOnset(alignment,quote);const from=cue.from+(voice?.from||0)/p.fps;beats.push({entityId:item.id,quote,from,until:Math.min(options.duration,from+2),precision:alignment.timing,receiptId:alignment.receiptId});}catch(e){if(item.focusQuote)throw e;}}
      beats.sort((a,b)=>a.from-b.from);
      options.focusBeats=beats.map((b,i)=>({...b,until:Math.min(b.until,beats[i+1]?.from??b.until)})).filter(b=>b.until-b.from>=.35);
    }
  }
  if(p.filmStyle&&shot.semanticScene?.family==='comparison'){
    const ids=new Set(shot.semanticScene.items.map(v=>v.id));
    const related=p.shots.map(s=>s.semanticScene).filter(s=>s?.family==='comparison'&&s.unit===shot.semanticScene.unit&&s.items.some(v=>ids.has(v.id)));
    options.comparisonMax=Math.max(1,...related.flatMap(s=>s.items.flatMap(v=>[v.value,v.to??v.value])));
  }
  if(p.filmStyle&&shot.semanticScene?.family==='physical'){
    const related=timeline(p,variant).rows.filter(r=>r.shot.semanticScene?.family==='physical'&&r.shot.semanticScene.unit===shot.semanticScene.unit);
    const values=related.flatMap(r=>{const {initial,speed}=r.shot.semanticScene.parameters;return [initial,initial+speed*r.frames/p.fps];});
    options.physicalDomain=[Math.min(...values),Math.max(...values)];
  }
  const sync=shot.semanticSync;
  if(sync?.startQuote||sync?.endQuote){
    if(shot.semanticScene?.family==='physical')throw Error('匀速模型保持真实时间，不能用台词拉伸物理速度');
    const voice=row.voices?.find(v=>v.asset.role===variant),alignment=currentAlignment(shot,voice?.asset,variant);
    const locate=(quote,occurrence)=>quoteOnset(alignment,quote,occurrence||1).from+(voice?.from||0)/p.fps;
    options.speechTiming={start:locate(sync.startQuote,sync.startOccurrence),settle:locate(sync.endQuote,sync.endOccurrence),receiptId:alignment?.receiptId};
  }
  if(includePrevious&&p.filmStyle?.matchCuts&&['continue','bridge'].includes(shot.handoff?.mode)){
    const index=p.shots.findIndex(s=>s.id===shot.id),before=p.shots[index-1];
    if(before?.semanticScene){rows??=timeline(p,variant).rows;const priorRow=rows.find(r=>r.shot.id===before.id);
      if(!cache.has(before.id))cache.set(before.id,compileSemanticScene(before.semanticScene,semanticOptions(p,before,priorRow,variant,{rows,cache})));
      options.previousPlan=cache.get(before.id);}
  }
  return options;
}

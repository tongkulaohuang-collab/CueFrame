import {timeline} from '../shared/model.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
import {validateExplanationBeats} from '../shared/explanation-plan.mjs';
import {checkedRhythm} from './rhythm-script.mjs';
import {actionTiming} from '../shared/action-timing.mjs';
import {reconcileReadingHolds} from './reading-holds.mjs';

// Repair identifiers only when the original action and its references are
// unambiguous. An explicitly authored short reading hold may fill a silent
// gap in the beat table; never invent content or a missing causal dependency.
export function checkedRhythmDraft(input, project, options) {
  const raw=structuredClone(input),adjustments=[];
  if(typeof raw?.text!=='string')return {result:checkedRhythm(raw,project,options),adjustments};
  const rows=timeline(project).rows,lines=raw.text.split(/\r?\n/),records=[];
  for(const [index,line] of lines.entries()) {
    const eventId=/[｜|]eventId=([\w-]{1,60})(?=[｜|])/.exec(line)?.[1];
    if(!eventId)continue;
    const single={...project,scienceFlow:{...project.scienceFlow,rhythm:line}};
    for(const row of rows)for(const action of actionRequirements(single,row.shot.id,row))
      records.push({index,line,action,shotId:row.shot.id,eventId,nextId:eventId});
  }
  const requirements=Array.isArray(raw.performanceRequirements)?raw.performanceRequirements:[];
  const linked=new Map();
  for(const r of requirements) {
    if(!r)continue;
    let matches=records.filter(a=>a.shotId===r.shotId&&(a.action.source===r.actionId?.trim()||a.action.id===r.actionId));
    if(matches.length>1)matches=matches.filter(a=>Math.abs(a.action.at-r.from)<.001&&a.action.until!=null&&Math.abs(a.action.until-r.until)<.001);
    if(matches.length===1)linked.set(r,matches[0]);
    else if(matches.length>1)throw Error('动作编号引用不明确：'+r.id+'；已保留原稿，请为每条动作指定唯一 eventId。');
  }
  for(const beat of raw.explanationBeats||[]) {
    if(beat.intent!=='hold'||!Array.isArray(beat.entities)||beat.entities.length)continue;
    const holds=requirements.filter(r=>r?.kind==='hold'&&r.shotId===beat.shotId&&beat.cueIds?.includes(r.cueId)&&
      linked.get(r)?.action.technique==='hold'&&Math.abs(r.from-beat.from)<.001&&Math.abs(r.until-beat.until)<.001);
    if(holds.length!==1||!holds[0].actorId)continue;
    beat.entities=[holds[0].actorId];
    adjustments.push({type:'hold-entity',beatId:beat.id,requirementId:holds[0].id,entity:holds[0].actorId});
  }
  for(const row of rows) {
    const own=records.filter(a=>a.shotId===row.shot.id),reserved=new Set(own.map(a=>a.eventId)),seen=new Set();
    for(const a of own) {
      if(!seen.has(a.eventId)){seen.add(a.eventId);continue;}
      // A bare repeated ID without a unique time match cannot be rewritten.
      if(requirements.some(r=>r?.shotId===a.shotId&&r.actionId==='action-'+a.eventId&&!linked.has(r)))
        throw Error('动作编号引用不明确：'+a.eventId+'；原稿已保留，不能猜测对应动作。');
      let suffix=2,next;
      do {const tail='-'+suffix++;next=a.eventId.slice(0,60-tail.length)+tail;}while(reserved.has(next));
      reserved.add(next);a.nextId=next;
      lines[a.index]=a.line.replace('eventId='+a.eventId,'eventId='+next);
      adjustments.push({type:'event-id',shotId:a.shotId,from:a.eventId,to:next});
    }
  }
  adjustments.push(...reconcileReadingHolds(raw,rows.map(row=>({shotId:row.shot.id,duration:row.frames/project.fps,
    actions:records.filter(a=>a.shotId===row.shot.id).map(a=>a.action),speech:actionTiming(project,row.shot.id,project.voice,row).speech}))));
  // Cross-shot causality belongs to explanationBeats. Remove a redundant local
  // dependency only if that exact bridge already exists in the valid beat plan.
  const byId=new Map(requirements.filter(Boolean).map(r=>[r.id,r]));
  const cross=requirements.filter(r=>Array.isArray(r?.dependsOn)&&r.dependsOn.some(id=>byId.has(id)&&byId.get(id).shotId!==r.shotId));
  if(cross.length)validateExplanationBeats(raw.explanationBeats,project);
  const beatFor=r=>{
    const action=linked.get(r);
    return raw.explanationBeats?.find(b=>b.id===action?.eventId&&b.shotId===r.shotId&&r.from>=b.from-.001&&r.until<=b.until+.001);
  };
  for(const r of cross)r.dependsOn=r.dependsOn.filter(id=>{
    const before=byId.get(id);
    if(!before||before.shotId===r.shotId)return true;
    const a=beatFor(before),b=beatFor(r);
    if(!a||!b||!b.dependsOn.includes(a.id))return true;
    adjustments.push({type:'cross-shot-dependency',requirementId:r.id,dependencyId:id,beatId:b.id,dependsOn:a.id});
    return false;
  });
  for(const [r,a] of linked)if(a.nextId!==a.eventId)r.actionId='action-'+a.nextId;
  raw.text=lines.join('\n');
  return {result:checkedRhythm(raw,project,options),adjustments};
}

// A fallback adoption may change these derived fields, but edits to narration,
// references, assets, claims, scene design, or a hand-written script must win.
export function sameRhythmRecoveryInputs(original, current, job) {
  if(!original||!current||original.id!==current.id)return false;
  if(![original.scienceFlow?.rhythm,job.result?.[0]].includes(current.scienceFlow?.rhythm))return false;
  const key=p=>{
    const copy=structuredClone(p);
    for(const k of ['version','updated','changeImpact'])delete copy[k];
    if(copy.scienceFlow)for(const k of ['rhythm','referenceScript','scriptVersion','proofVersion','proofs','proofsForFeedback','sampleJob'])delete copy.scienceFlow[k];
    return JSON.stringify(copy);
  };
  return key(original)===key(current);
}

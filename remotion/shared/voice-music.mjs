import {timeline} from './model.mjs';
import {isAuthoredProcess} from './production-mode.mjs';

export function voiceMusicPlan(p,shotId,lang) {
  if(p.kind!=='science'||!p.scienceFlow||isAuthoredProcess(p)&&!p.scienceFlow.analysis)return null;
  const f=p.scienceFlow,a=f.analysis,m=p.assets.find(x=>x.id===f.bgmId&&x.kind==='audio');
  if(!m||!a||a.clipId!==m.id||!m.duration||!a.marks?.length)
    throw Error('请先选择 BGM 并完成节奏分析，再生成配音');
  const row=timeline(p,lang).rows.find(r=>r.shot.id===shotId);
  if(!row)throw Error('找不到当前配音段');
  const offset=row.from/p.fps;
  const estimated=lang==='zh'?Array.from(row.shot[lang]).length/4.5:row.shot[lang].split(/\s+/).length/2.6;
  const marks=a.marks.filter(v=>Number.isFinite(v.time)&&v.time>=0&&v.time<m.duration);
  const gaps=marks.slice(1).map((v,i)=>v.time-marks[i].time).filter(n=>n>0).sort((x,y)=>x-y);
  const typical=gaps.length?gaps[Math.floor(gaps.length/2)]:3;
  // These are measured energy changes, not a claimed beat/BPM transcription.
  const speechRate=typical<1.4?8:typical>3?-5:0;
  const plan={bgmId:m.id,duration:m.duration,offset,marks,fps:p.fps,speechRate,
    gap:typical<1.4?.18:.3,estimatedDuration:estimated};
  plan.key=JSON.stringify([m.id,a.from,a.until,marks,offset,p.fps,lang]);
  return plan;
}
export function musicCues(plan,length) {
  if(!plan)return [];
  const cues=[];
  const first=Math.floor(plan.offset/plan.duration);
  for(let cycle=first;cycle<=(plan.offset+length+1)/plan.duration;cycle++)
    for(const mark of plan.marks){const time=cycle*plan.duration+mark.time-plan.offset;if(time>=0&&time<=length+1)cues.push({...mark,time});}
  return cues;
}
export function musicDirection(plan,direction='') {
  if(!plan)return direction;
  const cues=musicCues(plan,Math.min(90,plan.estimatedDuration)).slice(0,12);
  const context=`配合已选背景音乐，保持完整语意，重音随音乐强弱，弱声处自然换气，不读出时间码。段内音乐变化：${cues.map(m=>m.time.toFixed(2)+'秒'+m.change).join('；')}。`;
  return context.slice(0,360)+' '+direction.slice(0,130);
}
export function matchingVoice(p,s,lang,speaker) {
  const plan=voiceMusicPlan(p,s.id,lang);
  return p.assets.find(a=>s.assetIds.includes(a.id)&&a.role===lang&&a.scriptText===s[lang]&&
    (!speaker||a.speakerId===speaker)&& (a.voiceMusic?.processingVersion===2&&a.voiceMusic.mode==='preserve-speech'||(plan?a.voiceMusic?.key===plan.key:!a.voiceMusic)));
}

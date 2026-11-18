import {isAuthoredProcess} from './production-mode.mjs';
import {timeline} from './model.mjs';

// Navigation follows the project's narration language, independently of a preview variant.
export function voiceStageReady(p) {
  const musicReady=isAuthoredProcess(p)||Boolean(p.scienceFlow?.analysis &&
    p.assets.some(a=>a.id===p.scienceFlow.bgmId&&a.kind==='audio'&&a.role==='music'));
  return musicReady&&voiceAssemblyPlan(p).ready;
}

// Shared by the player and worker so an obsolete take can never look complete.
export function voiceAssemblyPlan(p) {
  const tl=timeline(p), languages=p.language==='sequential'?['zh','en']:[p.voice];
  const segments=tl.rows.map((row,index)=>{
    const voices=languages.map(lang=>{
      const take=row.voices.find(v=>v.asset.role===lang);
      const text=(row.shot[lang]||'').trim();
      const valid=take && take.asset.duration>0 && (!take.asset.scriptText || take.asset.scriptText.trim()===text);
      return {lang,text,asset:valid?take.asset:null,from:(row.from+(take?.from||0))/p.fps,
        silent:!!row.shot.silentOK&&!text};
    });
    return {id:row.shot.id,index,title:row.shot[p.voice]||'无旁白段落',voices,
      ready:voices.every(v=>v.asset||v.silent)};
  });
  const duration=tl.frames/p.fps;
  const signature=JSON.stringify({revision:1,project:p.id,duration,segments:segments.map(s=>({id:s.id,
    voices:s.voices.map(v=>({lang:v.lang,text:v.text,from:v.from,silent:v.silent,
      asset:v.asset&&[v.asset.id,v.asset.src,v.asset.duration]}))}))});
  return {segments,duration,signature,ready:segments.length>0&&segments.every(s=>s.ready)};
}

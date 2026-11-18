import {currentVoice} from './voice-status.mjs';

export const automaticTasks = ['narration', 'translation', 'phrasing', 'reference-motion', 'rhythm', 'proofs', 'shots', 'storyboard', 'materials','shot-images', 'material-image','material-supplement','motion'];
export const taskTitles = {research:'联网找素材','research-recommendation':'AI 素材推荐',narration:'口播',translation:'英文口播',phrasing:'口播断句','reference-motion':'参考视频分析',rhythm:'节奏脚本',proofs:'效果图',shots:'分镜',storyboard:'分镜与连续镜头设计',materials:'素材分析','shot-images':'全片图像素材分析','material-image':'图片素材','material-supplement':'AI 补充素材',motion:'样镜动画'};
export const directTask = (p, task) => ['narration','translation'].includes(task) || p?.kind === 'science' && automaticTasks.includes(task);
export const phrasingText = text => String(text||'').replace(/[\s，,。！？!?；;、：:]/gu,'');

const narrationLines=script=>String(script||'').split(/\n+/).map(text=>text.trim()).filter(Boolean);

export function matchNarrationParagraphs(script, shots) {
  const lines=narrationLines(script);
  // Identical lines can have different recordings. Keep exact matches at their
  // original positions first, then match paragraphs that moved in older drafts.
  const claimed=new Set(shots.filter((shot,i)=>shot.zh===lines[i]).map(shot=>shot.id));
  return lines.map((text,i)=>{
    const shot=shots[i]?.zh===text?shots[i]:shots.find(s=>s.zh===text&&!claimed.has(s.id));
    if(shot)claimed.add(shot.id);
    return {text,shot};
  });
}

// Editing the Chinese source can invalidate either language's take and its cues.
export function phrasingParagraphs(p) {
  return matchNarrationParagraphs(p.script,p.shots).map(({text,shot})=>({
    text,recorded:!!shot&&['zh','en'].some(lang=>currentVoice(p,shot,lang)),
  }));
}

export function musicPhrasing(p, formatted) {
  const suggested=preserveNarrationParagraphs(p.script,formatted).split('\n');
  const paragraphs=phrasingParagraphs(p);
  let index=0;
  return p.script.replace(/[^\n]+/g,line=>{
    if(!line.trim())return line;
    const {text,recorded}=paragraphs[index];
    const replacement=suggested[index++];
    return recorded?line:line.replace(text,()=>replacement);
  });
}
// Music phrasing may change punctuation, never the number of paid voice jobs.
export function preserveNarrationParagraphs(original, formatted) {
  if(phrasingText(original)!==phrasingText(formatted))throw Error('断句结果改动了原稿内容，已保留原稿');
  const paragraphs=narrationLines(original);
  const chars=Array.from(String(formatted).trim()),result=[];let cursor=0;
  for(const paragraph of paragraphs) {
    let count=0,text='',length=Array.from(phrasingText(paragraph)).length;
    while(cursor<chars.length) {
      const char=chars[cursor],spoken=phrasingText(char).length>0;
      if(count>=length&&spoken)break;
      text+=char;cursor++;if(spoken)count++;
    }
    const normalized=text.replace(/[\r\n]+/g,' ').replace(/([\p{Script=Han}。！？！，、；：])\s+(?=[\p{Script=Han}])/gu,'$1').trim();
    result.push(normalized.replace(/\s/g,'')===paragraph.replace(/\s/g,'')?paragraph:normalized);
  }
  return result.join('\n');
}

// Rebase edits made during a result write, retaining the generated fields that
// the user did not edit. Never reuse approvals after a concurrent edit.
export function mergeGeneratedProject(before, current, generated, task) {
  const next = {...generated};
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of Object.keys(current)) {
    if (['id','version','updated','scienceFlow'].includes(key)) continue;
    if (same(before[key],current[key])) continue;
    if (key === 'shots' && task === 'storyboard') {
      next.shots = current.shots.map(shot => {
        const old = before.shots.find(s => s.id === shot.id);
        const design = generated.shots.find(s => s.id === shot.id);
        if (!old || !design || old.zh !== shot.zh) return shot;
        if (same(old,shot)) return design;
        const merged = {...design};
        for (const field of Object.keys(shot)) {
          if (same(old[field],shot[field])) continue;
          if (field === 'continuity' && shot.continuity) {
            merged.continuity = {...design.continuity};
            for (const [name,value] of Object.entries(shot.continuity))
              if (old.continuity?.[name] !== value) merged.continuity[name] = value;
          } else merged[field] = shot[field];
        }
        return {...merged, reviewed:false, approvedLook:null, filmQA:[], motionReview:''};
      });
    } else next[key] = current[key];
  }
  if (current.scienceFlow) {
    next.scienceFlow={...generated.scienceFlow};
    for (const [key,value] of Object.entries(current.scienceFlow))
      if (!same(before.scienceFlow?.[key],value)) next.scienceFlow[key]=value;
    Object.assign(next.scienceFlow,{scriptVersion:null,proofVersion:null,sampleJob:null});
    if (!same(before.scienceFlow,current.scienceFlow) || !same(before.script,current.script) || !same(before.shots,current.shots))
      Object.assign(next.scienceFlow,{proofs:null,proofsForFeedback:undefined});
  }
  return next;
}

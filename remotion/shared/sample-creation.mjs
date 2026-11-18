import {scienceGate} from './science-flow.mjs';
import {evidenceOK,renderIssues} from './model.mjs';
import {isAuthoredProcess} from './production-mode.mjs';
export function sampleCreationNeeds(p,shotId,variant=p.voice,options={}) {
  if(p.kind!=='science')return renderIssues(p,shotId,variant);
  const needs=[...scienceGate(p,false,options)],s=p.shots.find(s=>s.id===shotId);
  if(!s)return [...needs,'先完成本期口播'];
  if(!p.claims.some(c=>c.verified&&evidenceOK(c)))needs.push('先核实本期科学资料');
  if(isAuthoredProcess(p))return [...new Set([...needs,...renderIssues(p,shotId,variant,undefined,options)])];
  const languages=p.language==='sequential'||p.language==='separate'?['zh','en']:[p.voice];
  for(const lang of languages) {
    const label=lang==='zh'?'中文':'英文';
    if(!s[lang]?.trim())needs.push(`先完成${label}口播`);
    if(!s.assetIds.some(id=>p.assets.some(a=>a.id===id&&a.kind==='audio'&&a.role===lang&&
      a.confirmed&&a.source&&a.license&&(!a.scriptText||a.scriptText===s[lang]))))needs.push(`先为本段生成${label}配音`);
  }
  if(p.burnCaptions&&p.captionMode==='bilingual'&&!s[p.voice==='zh'?'en':'zh']?.trim())needs.push('双语字幕尚缺译文，可切换为单语字幕');
  return [...new Set(needs)];
}

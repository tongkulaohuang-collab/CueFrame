import fs from 'node:fs';
import {createHash} from 'node:crypto';

const skillURL=new URL('../../视频制作/技能/motion-performance-director/SKILL.md',import.meta.url);
const contractURL=new URL('../../视频制作/技能/motion-performance-director/references/frameboard-contract.md',import.meta.url);
const graphicsURL=new URL('../../视频制作/技能/motion-performance-director/references/graphics-motion.md',import.meta.url);
export function performanceSkill() {
  const files=[skillURL,contractURL,graphicsURL].map(url=>fs.readFileSync(url,'utf8'));
  return {name:'motion-performance-director',fingerprint:createHash('sha256').update(files.join('\n')).digest('hex'),text:files.join('\n\n')};
}
export function performanceSkillInput(task,snapshot) {
  if(!['rhythm','shots','storyboard','proofs','motion'].includes(task))return '';
  const s=snapshot||performanceSkill();
  return '\n本次已加载专用 skill '+s.name+'，版本指纹 '+s.fingerprint+'。以下为本地受控制作指导：\n'+s.text;
}

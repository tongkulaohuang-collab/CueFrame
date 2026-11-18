import {scriptReady,proofsReady} from './science-flow.mjs';
import {voiceStageReady} from './voice-assembly.mjs';
import {referenceStyleStatus} from './visual-style.mjs';
import {referenceAnalysisNeeds} from './reference-motion.mjs';
import {validateSemanticScene} from './semantic-scenes.mjs';

// Completion is an assertion about current inputs, never about an old receipt.
export function workflowStages(p, jobs=[]) {
  const model=p.productionMode==='model-process',local=p.productionMode==='local-process'||model;
  const modelReady=s=>{try{validateSemanticScene(s.semanticScene,p.assets);return true;}catch{return false;}};
  const ready={0:!!p.topic?.trim()&&p.claims.some(c=>c.verified),4:voiceStageReady(p),
    5:model?!referenceAnalysisNeeds(p).length&&referenceStyleStatus(p).ready:local||!referenceAnalysisNeeds(p).length,
    1:local?p.shots.length>0&&p.shots.every(s=>model?modelReady(s):s.motionPlan||s.processVideoId):scriptReady(p),
    6:local||proofsReady(p)};
  const own=jobs.filter(j=>!j.project||j.project===p.id);
  const wholeVideo=j=>['rough','film','joined'].includes(j.scope)&&j.status==='done'&&(!j.variant||j.variant===p.voice);
  ready[2]=ready[1]&&ready[6]&&own.some(j=>j.scope==='shot'&&j.status==='done'&&j.version===p.version);
  ready[3]=ready[1]&&ready[6]&&own.some(j=>wholeVideo(j)&&j.version===p.version);
  const old={1:!!p.scienceFlow?.rhythm,6:!!(p.scienceFlow?.proofs?.length||p.scienceFlow?.artifactHistory?.length),
    2:own.some(j=>j.scope==='shot'&&j.status==='done'),3:own.some(wholeVideo)};
  return Object.fromEntries([0,4,5,1,6,2,3].map(step=>[step,{ready:!!ready[step],
    state:ready[step]?'current':old[step]?'outdated':'pending',
    label:ready[step]?(step>=2&&[2,3].includes(step)?'当前版本已生成':'输入已齐备'):old[step]?'历史结果 · 待更新':'待完成'}]));
}

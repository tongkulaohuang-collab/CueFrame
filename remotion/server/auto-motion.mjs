import {compileEffects} from '../shared/library-compiler.mjs';
import {selectableEffects} from '../shared/auto-motion.mjs';
export function compileAutoMotion(plan,selections=[]){
  if(!Array.isArray(selections)||selections.length>8)throw Error('AI 动效选择最多 8 项');
  if(selections.filter(e=>selectableEffects.find(x=>x.id===e.effectId)?.scope==='transition').length>1)throw Error('每镜只能选择一个转场');
  const instances=selections.map((e,i)=>{
    const item=selectableEffects.find(x=>x.id===e.effectId);
    if(!item||typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>240||!Array.isArray(e.targets)||e.targets.length>8||e.targets.some(x=>typeof x!=='string')||new Set(e.targets).size!==e.targets.length)throw Error('AI 动效选择的类型、对象或理由无效');
    if(item.scope==='transition'&&e.targets.length)throw Error('转场无需选择对象');
    return {instanceId:'ai-'+i,effectId:e.effectId,targets:e.targets,params:e.params,reason:e.reason};
  });
  const result=compileEffects(plan,instances);
  if(instances.length)result.plan.effectSelections=structuredClone(instances);
  return result;
}

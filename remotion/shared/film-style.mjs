// Sync settings remain independent; a preset is only a fallback without references.
import {bridgeIssues} from './cross-handoff.mjs';
import {referenceStyleStatus} from './visual-style.mjs';
export function handoffInputs(p,shot){
  if(!p?.filmStyle?.matchCuts||!['continue','bridge'].includes(shot?.handoff?.mode))return null;
  let index=p.shots.findIndex(s=>s.id===shot.id);const list=[];
  while(index>0&&['continue','bridge'].includes(p.shots[index].handoff?.mode)){
    const s=p.shots[--index];list.unshift([s.id,s.semanticScene,s.phraseEdits,s.voiceAlignment,s.semanticSync,s.handoff,s.seconds,s.assetIds]);
  }
  const ids=new Set(list.flatMap(v=>v.at(-1)||[]));
  return [list,p.assets?.filter(a=>ids.has(a.id)).map(a=>[a.id,a.src,a.duration,a.confirmed,a.source,a.license])];
}
export const filmStyles=Object.freeze({
  editorial:{name:'纸本图解',theme:'editorial',colors:['#b83b2d','#306e64','#75569b','#96621e','#297e97','#754851'],titleScale:1.4,labelScale:1,stroke:1.5,start:.18,settle:.67,description:'温暖纸色、稳定参照、较长结果停留'},
  technical:{name:'深色实验室',theme:'technical',colors:['#6bd9c4','#f3b664','#9db7ff','#f997b2','#b1d183','#c5a2ee'],titleScale:1.3,labelScale:1,stroke:2,start:.16,settle:.63,description:'深色背景、清晰细线、分阶段解释机制'},
  minimal:{name:'清晰白底',theme:'minimal',colors:['#3158b8','#bb4d36','#28766b','#875099','#8a661b','#546576'],titleScale:1.5,labelScale:1.05,stroke:1.2,start:.2,settle:.7,description:'白底留白、较大标签、保留产品原始画面'},
});
export function validateFilmStyle(style) {
  for(const k of ['narrationMotion','matchCuts'])if(style?.[k]!=null&&typeof style[k]!=='boolean')throw Error('解说动效与镜间衔接设置无效');
  if(style?.narrationFocus!=null&&typeof style.narrationFocus!=='boolean')throw Error('解说重点设置无效');
  if(style!=null&&(!style||style.version!==1||!filmStyles[style.preset]))throw Error('全片风格版本或方案无效');
  if(style?.entityOrder&&(!Array.isArray(style.entityOrder)||style.entityOrder.length>1500||new Set(style.entityOrder).size!==style.entityOrder.length||style.entityOrder.some(id=>typeof id!=='string'||!/^[\w-]{1,35}$/.test(id))))throw Error('全片对象颜色注册表无效');
}
export function reconcileFilmStyle(previous,p){if(p.filmStyle){const prior=p.filmStyle.entityOrder||previous?.filmStyle?.entityOrder||[];p.filmStyle={...p.filmStyle,entityOrder:[...new Set([...prior,...p.shots.flatMap(s=>s.semanticScene?.items.map(v=>v.id)||[])])]};}}
export function filmStyleContext(p) {
  const reference=referenceStyleStatus(p);
  if(!p.filmStyle&&reference.source==='default')return null;
  validateFilmStyle(p.filmStyle);
  const preset=p.filmStyle?.preset||(p.kind==='product'?'minimal':'editorial'),appearance=reference.appearance;
  const style=reference.source==='reference'?(appearance?{...appearance,theme:{bg:appearance.background,ink:appearance.foreground,accent:appearance.colors[0],secondary:appearance.colors[1],muted:appearance.muted,font:appearance.font}}:{}):filmStyles[preset];
  const entities=[...new Set([...(p.filmStyle?.entityOrder||[]),...(p.shots||[]).flatMap(s=>s.semanticScene?.items.map(v=>v.id)||[])])];
  return {...style,...reference,preset:reference.source==='reference'?'reference':preset,version:1,
    narrationMotion:Boolean(p.filmStyle?.narrationMotion),matchCuts:Boolean(p.filmStyle?.matchCuts),
    entityColors:Object.fromEntries(style.colors?entities.map((id,i)=>[id,style.colors[i%style.colors.length]]):[])};
}
export const visualStyleContext=p=>filmStyleContext({...p,filmStyle:p.filmStyle||{version:1,preset:p.kind==='product'?'minimal':'editorial'}});
export function filmStyleIssues(p,rows=[],{includeUnmanaged=true}={}) {
  if(!p.filmStyle)return [];const issues=[],seen=new Map();
  for(const [i,s] of p.shots.entries()){
    const scene=s.semanticScene;
    if(!scene){if(includeUnmanaged)issues.push(`第 ${i+1} 段的语音同步和镜头交接需在分镜与样片中核对。`);continue;}
    for(const item of scene.items){const old=seen.get(item.id);if(old&&old.label!==item.label)issues.push(`对象 ${item.id} 的名称在第 ${old.index+1}、${i+1} 段不一致`);seen.set(item.id,{...item,index:i});}
    if(s.handoff?.mode==='bridge'){
      issues.push(...bridgeIssues(p.shots[i-1]?.semanticScene,scene,s.handoff).map(message=>`第 ${i+1} 段：${message}`));
      if(!p.filmStyle.matchCuts)issues.push(`第 ${i+1} 段请先开启全片镜头衔接`);
    }
    if(i&&s.handoff?.mode==='continue'){
      const before=p.shots[i-1].semanticScene;
      if(p.filmStyle.matchCuts){
        if(before?.family!==scene.family||!['comparison','product','narrative','physical'].includes(scene.family))issues.push(`第 ${i+1} 段尚不支持这种类型的自动终态匹配，需手动设计衔接`);
        if(!scene.items.some(v=>before?.items.some(a=>a.id===v.id))&&scene.family!=='physical')issues.push(`第 ${i+1} 段缺少与前镜相同的对象身份`);
        for(const v of scene.items){const a=before?.items.find(a=>a.id===v.id);if(a&&a.assetId!==v.assetId)issues.push(`第 ${i+1} 段 ${v.label} 的连续交接更换了图片素材`);}
      }
      if(before?.family==='comparison'&&scene.family==='comparison')for(const item of scene.items){const prev=before.items.find(v=>v.id===item.id);
        if(prev&&(prev.to??prev.value)!==item.value)issues.push(`第 ${i+1} 段 ${item.label} 起值没有承接前段终值`);}
      if(before?.family==='physical'&&scene.family==='physical'){
        const row=rows.find(r=>r.shot.id===p.shots[i-1].id),seconds=row?row.frames/p.fps:p.shots[i-1].seconds;
        if(Math.abs(before.parameters.initial+before.parameters.speed*seconds-scene.parameters.initial)>.001)issues.push(`第 ${i+1} 段位置没有承接前段运动终点`);
      }
      if(before?.unit!==scene.unit)issues.push(`第 ${i+1} 段连续交接的单位改变，请说明为比较或新场景`);
    }
    if(i&&s.handoff?.mode==='reset'&&!s.handoff.reason?.trim())issues.push(`第 ${i+1} 段切换场景需要说明时间或对象变化`);
  }return [...new Set(issues)];
}

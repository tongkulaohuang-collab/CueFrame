// Original, bounded educational scenes. These are not general medical/CFD tools.
export const scienceScenes = Object.freeze([
  {id:'cubic-lattice',name:'简单立方晶格',engine:'blender',views:[['overview','空间排列'],['section','观察中间层']],limit:'简单立方点阵；不表示特定材料、化学键或原子真实比例',source:'https://dictionary.iucr.org/Bravais_lattice'},
  {id:'alveolar-exchange',name:'肺泡与毛细血管',engine:'blender',views:[['overview','肺泡截面与血管'],['section','气体交换界面']],limit:'单肺泡简化解剖示意，非等比；只表示气体净交换方向，不作诊断或患者模型',source:'https://www.nhlbi.nih.gov/health/lungs/respiratory-system'},
  {id:'laminar-pipe',name:'圆管层流',engine:'blender',views:[['overview','管壁与流体路径'],['section','速度分布截面']],limit:'不可压缩牛顿流体、圆直管、稳态充分发展层流；非湍流、多相流或任意流场求解器',source:'https://www.energy.gov/documents/doe-hdbk-1012-92vol3'},
]);
export const scienceScene = id => scienceScenes.find(v=>v.id===id);
export function scienceParameters(template,input={}) {
  const out=template==='laminar-pipe'?{radius:Number(input.radius??.002),meanSpeed:Number(input.meanSpeed??.02),viscosity:Number(input.viscosity??.000001)}:template==='cubic-lattice'?{layers:Number(input.layers??3)}:{};
  if(template==='cubic-lattice'&&(!Number.isInteger(out.layers)||out.layers<2||out.layers>5))throw Error('晶格每边需要 2–5 个节点');
  if(template==='laminar-pipe'){
    if(!Number.isFinite(out.radius)||out.radius<.0005||out.radius>.02||!Number.isFinite(out.meanSpeed)||out.meanSpeed<.001||out.meanSpeed>.2||!Number.isFinite(out.viscosity)||out.viscosity<.0000001||out.viscosity>.0001)throw Error('请检查管径、平均流速与运动黏度的适用范围');
    if(pipeMetrics(out).reynolds>=1500)throw Error('本场景只验证低雷诺数层流，请将 Re 保持在 1500 以下');
  }
  return out;
}
export function pipeMetrics(p){return {reynolds:2*p.radius*p.meanSpeed/p.viscosity,maximumSpeed:2*p.meanSpeed,flowRate:Math.PI*p.radius*p.radius*p.meanSpeed};}
export function pipeSpeed(p,r){if(!Number.isFinite(r)||r<0||r>p.radius)throw Error('取样位置须在管内');return 2*p.meanSpeed*(1-(r/p.radius)**2);}

import {timeline,emptyShot} from './model.mjs';
import {defaultParams,libraryItem,validateParams,validateLibraryShot} from './motion-library.mjs';
import {templatePlan,compileEffects} from './library-compiler.mjs';
import {validateMotion,motionInputs} from './motion-plan.mjs';
import {motionImageAsset} from './motion-dynamics.mjs';
export function libraryProject(input,request){
  const p=structuredClone(input);let s=p.shots.find(s=>s.id===request.shotId);
  if(!s&&request.action==='template'&&p.kind==='product'){
    s={...emptyShot(),title:libraryItem(request.itemId)?.name||'模板镜头',silentOK:true};p.shots.push(s);
  }
  if(!s)throw Error('请先建立并选择口播段或镜头');
  const row=timeline(p).rows.find(r=>r.shot.id===s.id),duration=row.frames/p.fps;
  if(request.action==='restore'){
    if(!s.motionLibrary?.restore)throw Error('没有可还原的画面');
    Object.assign(s,s.motionLibrary.restore);delete s.motionLibrary;
  }else{
    const old=s.motionLibrary;
    const restore=old?.restore||Object.fromEntries(['motionPlan','processVideoId','processOffset','libraryTransition','visual','continuity'].map(k=>[k,s[k]??null]));
    let l=old?structuredClone(old):{version:1,basePlan:s.motionPlan,instances:[],restore};
    if(request.action==='template'){
      if(libraryItem(request.itemId)?.type!=='template')throw Error('镜头模板不存在');
      const params=validateParams(request.itemId,request.params,duration);
      if(request.itemId==='product-scene'&&!motionImageAsset(p,params.assetId))throw Error('产品图片缺失或来源、使用条件尚未确认，请先在素材库核对');
      l={version:1,basePlan:templatePlan(request.itemId,params,{width:p.width,height:p.height,duration}),instances:[],restore,template:{id:request.itemId,params,version:1}};
      s.continuity={subject:request.itemId==='formula-scene'?'保持每个公式符号的身份':request.itemId==='data-scene'?'保持两组数据与柱形身份':'同一主体持续存在',path:libraryItem(request.itemId).description,camera:request.itemId==='product-scene'?'连续推进看局部，再拉远回整体':'同一世界坐标观察主体全过程',handoff:'本镜模板独立构图；应用后检查与前后镜的对象和空间交接'};
      s.visual=libraryItem(request.itemId).description+'；模板占位内容须按本片资料核对。';
      s.processVideoId=null;s.processOffset=0;
    }else{
      if(s.processVideoId)throw Error('当前镜头使用过程视频；请先应用镜头模板或选择已有对象动画');
      if(!l.basePlan)throw Error('当前镜头尚无对象动画，请先应用镜头模板');
      if(Math.abs(l.basePlan.duration-duration)>.001||l.basePlan.width!==p.width||l.basePlan.height!==p.height)throw Error('画幅或配音时长已变化，请重新应用模板或制作动画');
      if(request.action==='remove'){
        if(!l.instances.some(e=>e.instanceId===request.instanceId))throw Error('该动效已被移除');
        l.instances=l.instances.filter(e=>e.instanceId!==request.instanceId);
      }else if(request.action==='effect'){
        const e=libraryItem(request.itemId);if(e?.type!=='effect')throw Error('动效不存在');
        const params=validateParams(e.id,request.params,duration);
        const next={instanceId:request.instanceId||crypto.randomUUID(),effectId:e.id,version:1,params,targets:request.targets||[],cueId:request.cueId||null};
        const at=l.instances.findIndex(e=>e.instanceId===next.instanceId);
        if(at<0)l.instances.push(next);else l.instances[at]=next;
      }else throw Error('动效操作无效');
    }
    const {plan,transition}=compileEffects(l.basePlan,l.instances);validateMotion(plan);
    s.motionLibrary=l;s.motionPlan=plan;s.libraryTransition=transition;
    validateLibraryShot(s);
  }
  s.reviewed=false;s.approvedLook=null;s.filmQA=[];s.motionReview='';
  if(s.motionPlan)s.motionPlan.inputs=motionInputs(p,s);
  return {project:p,shotId:s.id};
}

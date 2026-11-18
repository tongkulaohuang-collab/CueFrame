import fs from 'node:fs';
import path from 'node:path';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {planForMaterial} from '../shared/material-plan.mjs';
import {imageNodeId,imageBoxOK} from '../shared/shot-images.mjs';
import {actorBindingIssue,actorSkinIssues} from '../shared/actor-catalog.mjs';
import {data,get,write,conflict} from './store.mjs';
import {upload} from './media.mjs';
import {imageExtension} from './materials.mjs';
import {downloadImage} from './reference-reader.mjs';

export async function importShotImage(p,b,download=downloadImage) {
  const source=p.researchSources?.find(s=>s.kind==='图片'&&s.url===b.url&&s.locator===b.locator);
  if(!source||b.confirmed!==true||typeof b.license!=='string'||!b.license.trim()||b.license.length>2400)
    throw Error('请选择已保存的图片出处，并填写已核对的使用条件');
  const mediaUrl=source.mediaUrl||b.mediaUrl||source.url;
  const existing=p.assets.find(a=>a.imageSource?.url===source.url&&a.imageSource.locator===source.locator&&a.imageSource.mediaUrl===mediaUrl);
  if(existing)return p;
  const result=await download(mediaUrl);
  const ext=imageExtension(result.bytes);
  if(!ext)throw Error('下载内容无法识别为 PNG、JPEG 或 WebP 原图');
  if(get(p.id)?.version!==p.version)throw conflict('项目已更新，请核对当前版本再导入图片');
  const imageSource={url:source.url,locator:source.locator,mediaUrl,finalUrl:result.finalUrl,publisher:source.publisher,rights:source.rights};
  const a=upload(source.title.slice(0,90)+ext,result.bytes,{imageSource});
  Object.assign(a,{source:source.url,license:b.license.trim(),credit:source.publisher,confirmed:true});
  return write({...p,assets:[...p.assets,a]},p.version);
}

export function applyShotImage(p,b) {
  const s=p.shots.find(s=>s.id===b.shotId);
  if(p.kind!=='science'||!s||s.processVideoId)throw Error('请选择使用动画对象的科普镜头');
  if(!imageNodeId(b.nodeId))throw Error('请选择镜头里的图像对象');
  const previous=s.imageBindings||[],old=previous.find(t=>t.nodeId===b.nodeId);
  let bindings=previous.filter(t=>t.nodeId!==b.nodeId);
  if(b.remove===true) {
    if(!old)return p;
  } else {
    const asset=motionImageAsset(p,b.assetId);
    if(asset?.kind!=='image'||!fs.existsSync(path.join(data,'uploads',path.basename(asset.src))))throw Error('请先选择已入库、有来源和使用条件的图片');
    const item=b.itemId&&planForMaterial(p,b.itemId)?.items.find(i=>i.id===b.itemId);
    const target=item?.imageTargets?.find(t=>t.shotId===s.id&&t.nodeId===b.nodeId);
    const node=s.motionPlan?.nodes.find(n=>n.id===b.nodeId);
    if(s.motionPlan ? !node||(!node.paths.length&&!node.media) : !target)
      throw Error('当前镜头没有这个可替换对象，请重新选择');
    if(s.motionPlan&&!imageBoxOK(b.box))throw Error('尚未取得对象在画面中的位置和尺寸');
    const label=target?.label||String(b.label||old?.label||b.nodeId).trim().slice(0,120);
    const binding={nodeId:b.nodeId,assetId:asset.id,label,box:s.motionPlan?b.box:null,
      ...(node?.rig?{scope:b.scope,actorId:b.actorId,partId:b.partId,designVersion:b.designVersion}:{}),
      ...(item?{itemId:item.id,styleMatch:target?.styleMatch||''}:{})};
    const issue=actorBindingIssue(s.motionPlan,binding);if(issue)throw Error(issue);
    if(JSON.stringify(old)===JSON.stringify(binding))return p;
    bindings.push(binding);
  }
  const shots=p.shots.map(shot=>shot.id===s.id?{...s,imageBindings:bindings,reviewed:false,approvedLook:null,filmQA:[],motionReview:''}:shot);
  const conflicts=actorSkinIssues({...p,shots});if(conflicts.length)throw Error(conflicts.join('；'));
  return write({...p,shots,scienceFlow:{...p.scienceFlow,sampleJob:null}},p.version);
}

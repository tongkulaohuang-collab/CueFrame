import fs from 'node:fs';
import path from 'node:path';
import {data,get} from './store.mjs';
import {materialFrames} from './material-frames.mjs';
import {materialPrompt,validateMaterialPlan} from './materials.mjs';

// Keep every shot's sample and the shared style references in the same request.
const shotsPerRequest=8;
export function writeShotImageSchema(file) {
  const plan=JSON.parse(fs.readFileSync(new URL('./material-plan.schema.json',import.meta.url),'utf8'));
  plan.properties.shotId={type:'string'};
  plan.required.push('shotId');
  plan.properties.items.items.properties.mode.enum=['reuse','generate','source'];
  fs.writeFileSync(file,JSON.stringify({type:'object',additionalProperties:false,required:['shots'],
    properties:{shots:{type:'array',items:plan}}}));
  return file;
}
export function framesForShots(frames,ids) {
  const refs=frames.filter(f=>f.kind!=='sample').slice(0,8);
  const byShot=ids.map(id=>frames.filter(f=>f.shotId===id&&f.kind==='sample'));
  const chosen=byShot.map(group=>group[1]||group[0]).filter(Boolean);
  const extra=byShot.flat().filter(f=>!chosen.includes(f));
  return [...refs,...chosen,...extra].slice(0,16);
}
export function shotImageResults(raw,p,ids) {
  if(!Array.isArray(raw?.shots)||raw.shots.length!==ids.length)throw Error('图像分析未返回本次全部镜头的结果');
  const rows=new Map(raw.shots.map(row=>[row?.shotId,row]));
  return ids.map(id=>{
    const row=rows.get(id);
    if(!row)throw Error('图像分析缺少镜头或镜头编号重复，请核对结果');
    if(p.shots.find(s=>s.id===id)?.processVideoId&&row.items?.length)throw Error('已合成视频内的对象不能单独换图，请在镜头结论中说明');
    const {id:planId,summary,items}=validateMaterialPlan(row,p,id);
    return {id:planId,focusShotId:id,summary,items};
  });
}
export async function analyzeShotImages(p,j,run,checkpoint) {
  const ids=p.shots.map(s=>s.id);
  const completed=new Set(j.result.map(plan=>plan.focusShotId));
  const remaining=ids.filter(id=>!completed.has(id));
  const frames=materialFrames(p,remaining);
  for(let offset=0;offset<remaining.length;offset+=shotsPerRequest) {
    if(get(p.id).version!==p.version)throw Error('草稿已更新，请按当前分镜重新分析');
    const group=remaining.slice(offset,offset+shotsPerRequest);
    const first=ids.indexOf(group[0])+1,last=ids.indexOf(group.at(-1))+1;
    j.step='正在分析第 '+(first===last?first:first+'–'+last)+' 镜，共 '+ids.length+' 镜';
    checkpoint(j);
    const attachments=framesForShots(frames,group);
    const child={...j,parentJob:j.id,shotIds:group,materialFrames:attachments,outputDir:path.join(data,'jobs',j.id,'shots-'+first+'-'+last)};
    const raw=await run(materialPrompt(p,attachments,group),child);
    j.result.push(...shotImageResults(raw,p,group));
    checkpoint(j);
  }
  return j.result;
}

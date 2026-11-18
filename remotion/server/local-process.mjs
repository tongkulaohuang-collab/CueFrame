import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,data} from './store.mjs';import {upload} from './media.mjs';import {localSpec} from '../shared/local-process.mjs';
import {scienceScene,scienceScenes} from '../shared/science-scenes.mjs';
const dir=path.join(data,'local-process');fs.mkdirSync(dir,{recursive:true});let running=null;
const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('任务编号无效');return path.join(dir,id,'job.json')};
const persist=j=>fs.writeFileSync(file(j.id),JSON.stringify(j,null,2));
export function localJobs(project,all=false){
 const records=fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}$/.test(n)).flatMap(id=>{
  try{
   const j=JSON.parse(fs.readFileSync(file(id)));
   if(project&&j.project!==project)return [];
   if(j.status==='running'&&j.owner!==process.pid){
    let alive=true;try{process.kill(j.owner,0)}catch{alive=false}
    if(!alive){j.status='interrupted';j.error='上次服务已停止，参数和已生成文件已保留，可重新生成';persist(j);}
   }
   return [j];
  }catch{return [];}
 }).sort((a,b)=>b.created.localeCompare(a.created));
 return project||all?records:records.slice(0,30);
}
export function localStatus(project){
 const rt=path.resolve(root,'../视频制作/工具/science-mcp/runtime'),records=localJobs(null,true);
 return {blender:fs.existsSync(rt)&&fs.readdirSync(rt).some(n=>n.startsWith('blender-')&&fs.existsSync(path.join(rt,n,'blender.exe'))),
  anatomy:fs.existsSync(path.join(root,'vendor/anatomy/kit/iso-kit.mjs'))&&fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'),
  scenes:scienceScenes,busy:records.some(j=>j.status==='running'),jobs:project?records.filter(j=>j.project===project):records.slice(0,30)};
}
export function startLocal(input){
 const spec=localSpec(input);if(localJobs().some(j=>j.status==='running')||running)throw Object.assign(Error('已有本地渲染正在运行，请等它完成；可继续编辑其他内容'),{status:409});
 if(!localStatus()[spec.engine])throw Error('所选引擎尚未就绪');
 const id=randomUUID(),folder=path.join(dir,id);fs.mkdirSync(folder);
 const tag=v=>typeof v==='string'&&/^[\w-]{1,90}$/.test(v)?v:'';
 const j={id,spec,project:tag(input.project),shotId:tag(input.shotId),status:'running',progress:0,owner:process.pid,created:new Date().toISOString()};persist(j);fs.writeFileSync(path.join(folder,'input.json'),JSON.stringify(spec));
 const child=spawn(process.execPath,[path.join(root,'scripts/local-science/render.mjs'),path.join(folder,'input.json'),folder],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});running=id;let tail='';const log=fs.createWriteStream(path.join(folder,'render.log'));
 child.stdout.on('data',d=>{log.write(d);for(const m of String(d).matchAll(/PROGRESS\s+(\d+)\s+(\d+)/g)){j.progress=Math.min(.99,Number(m[1])/Number(m[2]));persist(j)}});child.stderr.on('data',d=>{log.write(d);tail=(tail+d).slice(-2500)});
 const finish=error=>{if(j.status!=='running')return;try{if(error)throw Error(error);const scene=scienceScene(spec.template),name=scene?.name||'正弦绘图仪';const a=upload(`${spec.engine}-${name}-${spec.view}.mp4`,fs.readFileSync(path.join(folder,'silent.mp4')));j.asset={...a,source:'本地原创场景：'+name+'；'+(scene?.source||spec.engine),license:scene?'本项目原创程序场景':'原创程序场景；Anatomy kit: MIT',confirmed:true,role:'product',scienceEngine:spec.engine,localProcess:{jobId:id,...spec},...(scene?{scientificScope:scene.limit}:{})};j.status='done';j.progress=1;}catch(e){j.status='failed';j.error=e.message}j.completed=new Date().toISOString();persist(j);running=null;log.end();};
 child.on('error',e=>finish(e.message));child.on('exit',c=>finish(c===0?null:tail||`渲染退出 ${c}`));return j;
}

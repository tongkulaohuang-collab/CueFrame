import {db,get,write,jobs,conflict} from './store.mjs';
import {libraryItems,libraryItem,validateParams} from '../shared/motion-library.mjs';
import {libraryProject} from '../shared/library-project.mjs';
import {update} from '../shared/model.mjs';
import {motionInputs} from '../shared/motion-plan.mjs';
db.exec('CREATE TABLE IF NOT EXISTS motion_library (id INTEGER PRIMARY KEY, body TEXT)');
export function libraryState(){const r=db.prepare('SELECT body FROM motion_library WHERE id=1').get();return {items:libraryItems,...(r?JSON.parse(r.body):{version:0,favorites:[],presets:[]})};}
export function saveLibrary(b){
  const state=libraryState();delete state.items;
  if(b.version!==state.version)throw conflict('收藏或模板已有新版本，请刷新动效库');
  if(b.action==='favorite'){
    if(!libraryItem(b.itemId))throw Error('动效不存在');
    state.favorites=state.favorites.includes(b.itemId)?state.favorites.filter(id=>id!==b.itemId):[...state.favorites,b.itemId];
  }else if(b.action==='preset'){
    if(typeof b.name!=='string'||!b.name.trim()||b.name.length>40)throw Error('请填写 1–40 字的模板名称');
    if(state.presets.length>=100)throw Error('个人模板已达 100 个');
    const params=validateParams(b.itemId,b.params);
    // Asset IDs belong to their source project. Require a new image on reuse elsewhere.
    state.presets.push({id:crypto.randomUUID(),name:b.name.trim(),itemId:b.itemId,params,sourceProject:b.projectId||null,version:1});
  }else if(b.action==='delete-preset')state.presets=state.presets.filter(p=>p.id!==b.id);
  else throw Error('动效库操作无效');
  state.version++;
  db.prepare('INSERT OR REPLACE INTO motion_library VALUES (1,?)').run(JSON.stringify(state));return {...state,items:libraryItems};
}
export function applyLibrary(id,b){
  const old=get(id);if(!old)throw Error('项目不存在');
  if(old.version!==b.version)throw conflict('草稿已更新，请重新打开后再应用');
  if(jobs(id).some(j=>['running','queued','unknown'].includes(j.status)))throw conflict('项目有任务进行中或待核对，请完成后再应用动效');
  const result=libraryProject(old,b),p=update(old,result.project),s=p.shots.find(s=>s.id===result.shotId);
  if(s.motionPlan)s.motionPlan.inputs=motionInputs(p,s);
  return {project:write(p,b.version),shotId:s.id};
}

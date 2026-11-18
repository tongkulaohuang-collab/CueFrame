import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {motionReferences} from '../shared/reference-motion.mjs';
import {draft,syncNarration} from '../shared/model.mjs';
import {currentMaterialPlan,materialAsset} from '../shared/material-plan.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-materials-'));
const {get,save,job,data}=await import('../server/store.mjs');
const {prepare,approve,applyJob,prompt,reconcile}=await import('../server/codex.mjs');
const {validateMaterialPlan,importMaterialImage}=await import('../server/materials.mjs');
const {sciencePrompt}=await import('../server/science-ai.mjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6H8AAAAASUVORK5CYII=','base64');
const fixture=()=>save(syncNarration({...draft('science'),width:320,height:180,fps:6,topic:'细胞膜运输',script:'分子接近细胞膜。',scienceFlow:{style:'青蓝色近景',template:'连续空间'}}));
const result=p=>({summary:'主体用连续动画，补充一张造型参考。',items:[{title:'膜表面造型参考',reason:'统一造型',usage:'用于第一段背景参考',checks:'检查双层结构；不是显微实拍',mode:'generate',priority:'recommended',prompt:'无文字的膜结构参考，主体分层，背景透明。',shotIds:[p.shots[0].id],claimIds:[],assetIds:[]}]});
async function finish(j,raw) {
  approve(j.id,async()=>raw);
  for(let n=0;n<60&&job(j.id).status==='running';n++)await new Promise(r=>setTimeout(r,10));
  assert.equal(job(j.id).status,'ready',job(j.id).error);
  return applyJob(j.id);
}
test('分析不强制补图；未知段落、虚构依据与无描述生图被拒绝',()=>{
  const p=fixture();assert.equal(validateMaterialPlan({summary:'现有素材足够。',items:[]},p).items.length,0);
  for(const patch of [{shotIds:['fake']},{claimIds:['fake']},{prompt:''},{mode:'reuse',assetIds:[]}]){
    const r=result(p);Object.assign(r.items[0],patch);assert.throws(()=>validateMaterialPlan(r,p));
  }
});
test('分析自动保存，生成图片入库保留关联且可供后续使用；改稿后建议失效',async()=>{
  let p=fixture(),j=prepare(p,null,'materials');
  assert.match(prompt(p,j),/不生成图片/);p=await finish(j,result(p));
  const plan=currentMaterialPlan(p);assert.ok(plan);assert.equal(p.shots.length,1);
  j=prepare(p,null,'material-image',{materialId:plan.items[0].id});
  assert.match(prompt(p,j),/必须调用内置 image_gen/);
  const dir=path.join(data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'asset.png'),png);
  p=await finish(j,{file:'asset.png',note:'测试回执'});
  const asset=materialAsset(p,plan.items[0].id);assert.ok(asset);assert.equal(asset.kind,'image');
  assert.equal(asset.generation.provider,'codex');assert.equal(p.shots.length,1);
  assert.match(sciencePrompt(p,'rhythm'),/膜表面造型参考/);
  assert.throws(()=>prepare(p,null,'material-image',{materialId:plan.items[0].id}),/已生成/);
  p=save({...p,assets:p.assets.map(a=>({...a,generation:{provider:'fake'}}))});
  assert.equal(p.assets[0].generation.provider,'codex');assert.ok(currentMaterialPlan(p));
  p=save({...p,scienceFlow:{...p.scienceFlow,style:'新风格'}});
  assert.equal(currentMaterialPlan(p),null);
  assert.throws(()=>prepare(p,null,'material-image',{materialId:plan.items[0].id}),/重新分析/);
});
test('越界文件、非图片和无输出失败；过期回执不会覆盖新稿',async()=>{
  let p=fixture();p=await finish(prepare(p,null,'materials'),result(p));
  const j=prepare(p,null,'material-image',{materialId:currentMaterialPlan(p).items[0].id});
  const dir=path.join(data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'not.png'),'not an image'.repeat(10));
  assert.throws(()=>importMaterialImage({file:'../secret.png'},p,j),/任务目录/);
  assert.throws(()=>importMaterialImage({file:'',note:'本次无法使用图片工具'},p,j),/无法使用图片工具/);
  assert.throws(()=>importMaterialImage({file:'not.png'},p,j));
  const a=prepare(p,null,'materials');approve(a.id,async()=>result(p));
  for(let n=0;n<60&&job(a.id).status==='running';n++)await new Promise(r=>setTimeout(r,10));
  const newer=save({...get(p.id),script:'已经换成新的口播。'});
  assert.throws(()=>applyJob(a.id),/旧版本回执/);assert.equal(get(p.id).script,newer.script);
});

async function planned(modes) {
  const p=fixture(),base=result(p).items[0];
  return finish(prepare(p,null,'materials'),{summary:'测试素材清单',items:modes.map((mode,i)=>({...base,mode,title:'素材 '+i}))});
}
async function settle(id) {
  for(let n=0;n<2000&&job(id).status==='running';n++)await new Promise(resolve=>setTimeout(resolve,20));
  return job(id);
}
function mockFile(child,filename,bytes) {
  const dir=path.join(data,'jobs',child.id);
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,filename),bytes);
  return {file:filename,note:'本地测试素材'};
}
test('四项全为程序动画时，逐项生成可引用的视频和封面，重复提交不重做',async()=>{
  let p=await planned(Array(4).fill('procedural'));
  const calls=[];
  const batch=prepare(p,null,'material-supplement');
  assert.equal(prepare(p,null,'material-supplement').id,batch.id);
  approve(batch.id,async(input,child)=>{
    calls.push(child.materialId);
    assert.equal(child.task,'material-animation');assert.match(input,/已核依据/);
    // This worker can only return text. The workbench must produce the real MP4.
    return {duration:1,direction:{subject:'圆',path:'由左到右',camera:'固定',handoff:'同一空间',labels:'无需附加标注'},note:'连续位移',
      svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><circle cx="35" cy="90" r="20" fill="red"><animate attributeName="cx" from="35" to="285" begin="0s" dur="1s" fill="freeze"/></circle></svg>'};
  });
  assert.throws(()=>approve(batch.id),/不能再次提交/);
  assert.throws(()=>prepare(p,null,'materials'),/已有素材任务/);
  const complete=await settle(batch.id);
  assert.equal(complete.status,'ready',complete.error);
  p=applyJob(batch.id);
  assert.deepEqual(calls,currentMaterialPlan(p).items.map(item=>item.id));
  for(const item of currentMaterialPlan(p).items) {
    const asset=materialAsset(p,item.id);
    assert.equal(motionImageAsset(p,asset.id).kind,'video');
    assert.ok(fs.statSync(path.join(data,'uploads',path.basename(asset.poster))).size);
  }
  assert.deepEqual(motionReferences(p),[]);
  assert.throws(()=>prepare(p,null,'material-supplement'),/没有需要/);
  const search=prepare(p,null,'research',{researchScope:'visuals'});
  assert.equal(search.planId,currentMaterialPlan(p).id);
  assert.match(prompt(p,search),/素材 3/);
});

test('只有真实资料需求时可独立联网查找，生成期间换版仍可保存选定出处',async()=>{
  const p=await planned(['source']);
  assert.throws(()=>prepare(p,null,'material-supplement'),/没有需要/);
  const topic=prepare(p,null,'research');
  const search=prepare(p,null,'research',{researchScope:'visuals'});
  assert.notEqual(search.id,topic.id);
  assert.equal(prepare(p,null,'research',{researchScope:'visuals'}).id,search.id);
  assert.match(prompt(p,search),/分子接近细胞膜/);
  assert.match(prompt(p,search),/显示指标变化|用于第一段背景参考/);
  assert.doesNotMatch(prompt(p,topic),/用户明确点击了/);
  const source={kind:'数据',type:'科研机构或高校',title:'公开原始数据',publisher:'实验室',url:'https://example.org/dataset',
    mediaUrl:'https://example.org/data.csv',locator:'表一',summary:'原始测量',use:'用于第一段',rights:'CC BY 4.0',original:''};
  approve(search.id,async()=>({materials:[source,{...source,kind:'科学资料',locator:'绪论'},
    {...source,kind:'图片',locator:'图一',mediaUrl:'javascript:alert(1)'}]}));
  const ready=await settle(search.id);
  assert.equal(ready.status,'ready',ready.error);
  assert.equal(ready.result.length,2);
  assert.equal(ready.result[1].mediaUrl,'');
  assert.equal(get(p.id).researchSources?.length||0,0);
  const later=save({...p,title:'保留新版本'});
  const saved=applyJob(search.id,[0]);
  assert.equal(saved.title,later.title);
  assert.deepEqual(saved.researchSources,[source]);
  assert.deepEqual(saved.claims,later.claims);
  assert.ok(currentMaterialPlan(saved));
  const changed=prepare(saved,null,'research',{researchScope:'visuals'});
  approve(changed.id,async()=>({materials:[source]}));
  await settle(changed.id);
  save({...saved,topic:'已改选题'});
  assert.throws(()=>applyJob(changed.id,[0]),/旧版本/);
  const forEvidence=prepare(get(p.id),null,'research');
  approve(forEvidence.id,async()=>({materials:[source]}));
  await settle(forEvidence.id);
  const adopted=applyJob(forEvidence.id,[0]);
  assert.equal(adopted.researchSources.length,1);
  assert.equal(adopted.claims.length,later.claims.length+1);
  const scriptOnly=save({...fixture(),topic:''});
  assert.throws(()=>prepare(scriptOnly,null,'research'),/选题/);
  assert.match(prompt(scriptOnly,prepare(scriptOnly,null,'research',{researchScope:'visuals'})),/分子接近细胞膜/);
});
test('失败后采用已完成项，再点只补缺项；待核对状态禁止重发并保留完成文件',async()=>{
  for(const uncertain of [false,true]){
    let p=await planned(['generate','source','generate']);
    const ids=currentMaterialPlan(p).items.filter(x=>x.mode==='generate').map(x=>x.id);
    const batch=prepare(p,null,'material-supplement'),calls=[];
    approve(batch.id,async(_,child)=>{
      calls.push(child.materialId);
      if(child.materialId===ids[1])throw Object.assign(Error('测试中断'),{uncertain});
      return mockFile(child,'图片.png',png);
    });
    const partial=await settle(batch.id);
    assert.equal(partial.result.length,1);assert.equal(partial.currentItem,ids[1]);
    if(uncertain){
      assert.equal(partial.status,'unknown');
      assert.throws(()=>prepare(p,null,'material-supplement'),/待核对/);
      reconcile(batch.id,'已核对，本次没有第二项的生成结果');
    }else p=applyJob(batch.id);
    const retry=prepare(p,null,'material-supplement');
    approve(retry.id,async(_,child)=>{calls.push(child.materialId);return mockFile(child,'图片.png',png);});
    assert.equal((await settle(retry.id)).status,'ready');
    p=applyJob(retry.id);
    assert.deepEqual(calls,[ids[0],ids[1],ids[1]]);
    assert.equal(p.assets.length,2);assert.ok(ids.every(id=>materialAsset(p,id)));
  }
});

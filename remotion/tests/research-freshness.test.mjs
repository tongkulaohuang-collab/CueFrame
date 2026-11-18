import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,syncNarration} from '../shared/model.mjs';
import {materialInputs,visualSearchInputs,visualSearchMatches} from '../shared/material-plan.mjs';
const {save,write,get,job,persistJob,db}=await import('../server/store.mjs');
const {prepare,approve,applyJob,jobHelp}=await import('../server/codex.mjs');
const source={kind:'图片',type:'科研机构或高校',title:'卫星定位示意',publisher:'测试机构',
  url:'https://example.org/gnss',locator:'图 1',summary:'卫星与接收机',use:'解释信号传播',rights:'使用条件未注明',original:'',mediaUrl:''};
const fixture=()=>save(syncNarration({...draft('science'),topic:'卫星定位',script:'卫星向手机发送信号。',scienceFlow:{style:'白板讲解'}}));
const search=p=>prepare(p,null,'research',{researchScope:'visuals'});
async function settle(id) {
  for(let n=0;n<200&&job(id).status==='running';n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(job(id).status,'ready',job(id).error);
  return job(id);
}
function addDerivedPlans(p) {
  const plan={id:'new-derived-plan',inputs:materialInputs(p),summary:'无需额外配图',items:[]};
  p=write({...p,scienceFlow:{...p.scienceFlow,materialPlan:plan}},p.version);
  return write({...p,scienceFlow:{...p.scienceFlow,imagePlans:{[p.shots[0].id]:{...plan,id:'shot-derived-plan',focusShotId:p.shots[0].id}}}},p.version);
}

test('无需求单的搜索期间自动保存两次分析，仍可推荐并保存原出处，保留最新分析',async()=>{
  const original=fixture(),request=search(original);
  assert.equal(request.planId,null);
  let finish;
  approve(request.id,()=>new Promise(resolve=>{finish=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));
  const latest=addDerivedPlans(get(original.id));
  finish({materials:[source]});
  const ready=await settle(request.id);
  assert.equal(ready.version,original.version);
  assert.equal(visualSearchMatches(latest,ready),true);
  const recommendation=prepare(latest,null,'research-recommendation',{researchJobId:ready.id});
  approve(recommendation.id,async()=>({summary:'覆盖信号传播。',picks:[{index:0,reason:'对应当前口播。'}]}));
  await settle(recommendation.id);
  const saved=applyJob(ready.id,[0]);
  assert.deepEqual(saved.researchSources,[source]);
  assert.deepEqual(saved.scienceFlow.materialPlan,latest.scienceFlow.materialPlan);
  assert.deepEqual(saved.scienceFlow.imagePlans,latest.scienceFlow.imagePlans);
  assert.equal(saved.script,latest.script);
  assert.equal(job(ready.id).version,original.version);
});

test('旧任务从其原始版本还原搜索条件，读取不改记录，保存仍走同一校验',()=>{
  const p=fixture(),legacy={...search(p),status:'ready',result:[source]};
  delete legacy.researchInputs;
  persistJob(legacy);
  const current=addDerivedPlans(p),visible=jobHelp(job(legacy.id));
  assert.equal(visible.researchInputs,visualSearchInputs(p));
  assert.equal(visualSearchMatches(current,visible),true);
  assert.deepEqual(job(legacy.id),legacy);
  assert.doesNotThrow(()=>prepare(current,null,'research-recommendation',{researchJobId:legacy.id}));
  assert.deepEqual(applyJob(legacy.id,[0]).researchSources,[source]);
});

test('旧任务的原始快照缺失时拒绝跨版本采用，不能以当前草稿伪造搜索条件',()=>{
  const p=fixture(),legacy={...search(p),status:'ready',result:[source]};
  delete legacy.researchInputs;
  persistJob(legacy);
  addDerivedPlans(p);
  db.prepare('DELETE FROM versions WHERE id=? AND v=?').run(p.id,p.version);
  assert.equal(jobHelp(legacy).researchInputs,undefined);
  assert.throws(()=>applyJob(legacy.id,[0]),/旧版本/);
});

test('搜索实际内容改变仍拦截；标题、同步开关与已采用来源不影响素材适用性',()=>{
  const p=fixture(),receipt=search(p);
  const unrelated=structuredClone(p);
  unrelated.title='新工程名';unrelated.version++;
  unrelated.filmStyle={version:1,preset:'minimal',narrationMotion:true,matchCuts:true,entityOrder:['satellite']};
  unrelated.researchSources=[source];
  assert.equal(visualSearchMatches(unrelated,receipt),true);
  for(const change of [
    q=>{q.topic='细胞膜';},q=>{q.script='新的口播';},q=>{q.shots[0].zh='重新讲另一过程';},
    q=>{q.shots.push({...q.shots[0],id:'new-paragraph'});},q=>{q.scienceFlow.style='显微摄影';},
    q=>{q.scienceFlow.template='改为卫星实拍参考';},q=>{q.width+=100;},q=>{q.references='新增资料';},
    q=>{q.voice='en';q.shots[0].en='A different narration.';},q=>{q.id='different-project';},
  ]) {
    const altered=structuredClone(p);change(altered);
    assert.equal(visualSearchMatches(altered,receipt),false);
  }
  const ready=persistJob({...receipt,status:'ready',result:[source]});
  const changed=save({...p,topic:'另一个主题'});
  const before=get(p.id);
  assert.throws(()=>applyJob(ready.id,[0]),/旧版本/);
  assert.throws(()=>prepare(changed,null,'research-recommendation',{researchJobId:ready.id}),/旧版/);
  assert.deepEqual(get(p.id),before);
});

test('按指定需求查找时检查需求内容，重新分析的编号本身不让素材过期',()=>{
  let p=fixture();
  const item={id:'requested-image',title:'卫星造型',usage:'用于第一段',checks:'保留太阳能板',shotIds:[p.shots[0].id],imageTargets:[]};
  p=write({...p,scienceFlow:{...p.scienceFlow,materialPlan:{id:'plan-1',inputs:materialInputs(p),items:[item]}}},p.version);
  const receipt=prepare(p,null,'research',{researchScope:'visuals',materialId:item.id});
  const changed=structuredClone(p);
  changed.scienceFlow.materialPlan.id='plan-2';
  assert.equal(visualSearchMatches(changed,receipt),true);
  changed.scienceFlow.materialPlan.items[0].usage='改为展示城市反射路径';
  assert.equal(visualSearchMatches(changed,receipt),false);
  changed.scienceFlow.materialPlan.items=[];
  assert.equal(visualSearchMatches(changed,receipt),false);
});

test('准备搜索后仅自动保存分析可继续提交，改选题或普通选题搜索仍拒绝旧请求',async()=>{
  const p=fixture(),request=search(p);
  addDerivedPlans(p);
  approve(request.id,async()=>({materials:[source]}));
  await settle(request.id);
  const other=fixture(),stale=search(other);
  save({...other,topic:'已换选题'});
  assert.throws(()=>approve(stale.id,async()=>({materials:[source]})),/草稿版本/);
  const topicProject=fixture(),topic=prepare(topicProject,null,'research');
  addDerivedPlans(topicProject);
  assert.throws(()=>approve(topic.id,async()=>({materials:[source]})),/草稿版本/);
});

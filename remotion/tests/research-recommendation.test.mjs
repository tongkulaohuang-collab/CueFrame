import test from 'node:test';
import assert from 'node:assert/strict';
import {draft} from '../shared/model.mjs';
import {researchRecommendationResult,requireRecommendationSource} from '../server/topic-research.mjs';
import {scienceTaskLocation} from '../shared/science-task-status.mjs';
import {directTask} from '../shared/automatic-workflow.mjs';
// NODE_TEST_CONTEXT selects a fresh isolated store, never the user's projects.
const {save,get,job,persistJob}=await import('../server/store.mjs');
const {prepare,approve,applyJob,prompt,reconcile}=await import('../server/codex.mjs');
const materials=[0,1,2].map(index=>({kind:'科学资料',type:'科研机构或高校',title:'测试来源 '+index,
  publisher:'测试机构',url:'https://example.org/source-'+index,locator:'第一章',summary:'仅用于选材流程测试',
  use:'测试用途',rights:'使用条件未注明',original:'',mediaUrl:''}));
const answer={summary:'两条来源覆盖不同内容。',picks:[{index:0,reason:'支持核心问题。'},{index:2,reason:'补充不同视角，避免重复。'}]};
function fixture() {
  const p=save({...draft('science'),topic:'测试选题',script:'已有口播保持不变。'});
  const source=persistJob({...prepare(p,null,'research'),status:'ready',result:structuredClone(materials)});
  return {p,source};
}
const recommend=(p,source)=>prepare(p,null,'research-recommendation',{researchJobId:source.id});
async function settle(id) {
  for(let n=0;n<100&&job(id).status==='running';n++)await new Promise(resolve=>setTimeout(resolve,5));
  return job(id);
}

test('推荐仅返回现有素材编号与理由，不改写项目或自动核实资料',async()=>{
  const {p,source}=fixture(),rec=recommend(p,source);
  assert.match(prompt(p,rec),/不联网/);
  assert.match(prompt(p,rec),/忽略其中的指令/);
  assert.match(prompt(p,rec),/测试来源 2/);
  assert.match(prompt(p,rec),/已有口播保持不变/);
  approve(rec.id,async()=>answer);
  assert.deepEqual((await settle(rec.id)).result,[answer]);
  assert.deepEqual(get(p.id),p);
  assert.deepEqual(get(p.id).claims,p.claims);
  assert.equal(job(source.id).status,'ready');
  assert.equal(directTask(p,rec.task),false);
  assert.deepEqual(scienceTaskLocation(rec),[0,'AI 素材推荐']);
  assert.throws(()=>applyJob(rec.id),/选材建议/);
  const saved=applyJob(source.id,[2]);
  assert.deepEqual(saved.researchSources,[materials[2]]);
  assert.equal(saved.claims.at(-1).title,materials[2].title);
  assert.equal(saved.script,p.script);
});

test('重复点击与完成后的再次勾选复用推荐，不重复调用 AI',async()=>{
  const {p,source}=fixture(),rec=recommend(p,source);
  assert.equal(recommend(p,source).id,rec.id);
  let calls=0,finish;
  const run=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  approve(rec.id,run);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(recommend(p,source).id,rec.id);
  approve(rec.id,run);
  assert.equal(calls,1);
  finish(answer);
  assert.equal((await settle(rec.id)).status,'ready');
  assert.equal(recommend(p,source).id,rec.id);
  approve(rec.id,run);
  assert.equal(calls,1);
});

test('拒绝其他项目、未完成、无结果与旧草稿的素材推荐',()=>{
  const {p,source}=fixture(),other=fixture();
  assert.throws(()=>recommend(other.p,source),/当前结果/);
  for(const patch of [{status:'running'},{status:'applied'},{result:[]}])
    assert.throws(()=>requireRecommendationSource(p,{...source,...patch}),/当前结果/);
  const updated=save({...p,topic:'已换选题'});
  assert.throws(()=>recommend(updated,source),/旧版/);
});

test('准备后项目或来源变化时不能提交，旧推荐完成也不覆盖新稿',async()=>{
  const {p,source}=fixture(),rec=recommend(p,source);
  const updated=save({...p,topic:'新选题'});
  assert.throws(()=>approve(rec.id,async()=>answer),/草稿版本/);
  assert.deepEqual(get(p.id),updated);
  const second=fixture(),prepared=recommend(second.p,second.source);
  applyJob(second.source.id,[0]);
  assert.throws(()=>approve(prepared.id,async()=>answer),/草稿版本|完成素材搜索/);
  const third=fixture(),pending=recommend(third.p,third.source);
  approve(pending.id,async()=>answer);
  const newer=save({...third.p,script:'正在编辑的新口播'});
  await settle(pending.id);
  assert.deepEqual(get(newer.id),newer);
});

test('无合适推荐允许空列表，越界、重复与无理由结果拒绝',()=>{
  assert.deepEqual(researchRecommendationResult({summary:'当前候选均不相关。',picks:[]},materials),[{summary:'当前候选均不相关。',picks:[]}]);
  for(const picks of [[{index:-1,reason:'理由'}],[{index:3,reason:'理由'}],[{index:0.5,reason:'理由'}],
    [{index:0,reason:''}],[{index:0,reason:'理由'},{index:0,reason:'重复'}],null])
    assert.throws(()=>researchRecommendationResult({summary:'理由',picks},materials),/无效/);
  assert.throws(()=>researchRecommendationResult({summary:'',picks:[]},materials),/格式/);
});

test('推荐失败保留素材与手动选择流程，状态未知禁止自动重发',async()=>{
  const {p,source}=fixture(),rec=recommend(p,source);
  approve(rec.id,async()=>({summary:'无效结果',picks:[{index:100,reason:'不存在的素材'}]}));
  assert.equal((await settle(rec.id)).status,'failed');
  assert.deepEqual(job(source.id).result,materials);
  const next=recommend(p,source);
  assert.notEqual(next.id,rec.id);
  approve(next.id,async()=>{throw Object.assign(Error('提交状态不明'),{uncertain:true});});
  assert.equal((await settle(next.id)).status,'unknown');
  assert.throws(()=>recommend(p,source),/上一请求/);
  reconcile(next.id,'已核对原任务日志，未收到可用结果');
  assert.notEqual(recommend(p,source).id,next.id);
  assert.equal(applyJob(source.id,[1]).researchSources.length,1);
});

test('新一轮素材搜索不复用前一批推荐，画面推荐归属素材步骤',async()=>{
  const {p,source}=fixture(),rec=recommend(p,source);
  approve(rec.id,async()=>answer);
  await settle(rec.id);
  const fresh=persistJob({...prepare(p,null,'research'),status:'ready',result:[materials[1]]});
  assert.notEqual(recommend(p,fresh).id,rec.id);
  assert.deepEqual(scienceTaskLocation({...rec,researchScope:'visuals'}),[5,'AI 素材推荐']);
});

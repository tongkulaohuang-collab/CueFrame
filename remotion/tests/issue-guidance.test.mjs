import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {motionFixture as legacyMotionFixture} from './fixtures/motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {issueHelp,safeIssueText} from '../shared/issue-help.mjs';
import {validateMotionResult,motionPrompt} from '../server/motion.mjs';
import {validateDiagnosis} from '../server/issue-diagnosis.mjs';
import {analyzeIssue} from '../shared/issue-client.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-issues-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const settle=async id=>{for(let i=0;i<100&&store.job(id).status==='running';i++)await new Promise(r=>setTimeout(r,5));return store.job(id);};
const output=(j,raw)=>{const dir=path.join(store.data,'jobs',j.id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(raw));};

test('missing evidence is explained without saying the verified materials are lost',()=>{
  const {p,raw}=motionFixture(),j={shotId:p.shots[0].id};
  assert.throws(()=>validateMotionResult({...raw,claimIds:[]},p,j),e=>e.code==='MOTION_CLAIMS_MISSING'&&/已有 1 条/.test(e.message));
  assert.throws(()=>validateMotionResult({...raw,claimIds:['not-verified']},p,j),e=>e.code==='MOTION_CLAIMS_INVALID');
  assert.match(motionPrompt(p,j),/开场提问也关联/);
  const schema=JSON.parse(fs.readFileSync(new URL('../server/motion.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.properties.claimIds.minItems,1);
  const help=issueHelp('动画未引用已有的已核科学依据');
  assert.match(help.cause,/关联/);assert.match(help.steps.join(' '),/无需重新录制/);assert.equal(help.action,'evidence');
});

test('unknown paid results lead to original-request checks; generic failures retain uncertainty',()=>{
  const help=issueHelp('请求未得到可确认的完成结果。没有可用音频数据');
  assert.match(help.steps[0],/原请求/);assert.match(help.steps[1],/再次.*计费/);
  assert.match(issueHelp('X-UNEXPECTED-43').steps.join(' '),/不能确认/);
  assert.equal(issueHelp('未确认 ChatGPT 登录').action,'tasks');
  assert.equal(issueHelp('FFmpeg 启动失败').action,'tools');
});

test('旧批次的服务更新错误不再错误宣称未提交生成，并给出续制入口',()=>{
  const help=issueHelp('工作台服务已更新，当前进程尚未切换；本次尚未提交生成，请从当前工作台入口继续。',{job:{type:'segments'}});
  assert.match(help.cause,/已经返回的动画结果/);assert.doesNotMatch(help.cause,/尚未提交/);
  assert.match(help.steps.join(' '),/继续未完成分段/);assert.match(help.steps.join(' '),/待核对/);
});

test('credentials are removed from problem descriptions and AI diagnosis inputs',()=>{
  const text='Bearer abcdef sk-secretvalue api_key=test-key {"access_token":"private-token"} secret=private';
  const cleaned=safeIssueText(text);
  for(const secret of ['abcdef','sk-secretvalue','test-key','private-token','secret=private'])assert.ok(!cleaned.includes(secret));
  assert.match(cleaned,/已隐藏凭据/);
});

test('AI diagnosis can explain a failed reference read without editing the project',async()=>{
  const {p:source}=motionFixture();source.references='https://example.org/not-read';
  const p=store.write(source,0),j=broker.prepare(p,null,'diagnosis',{issue:{area:'资料读取',message:'fetch failed api_key=test-key'}});
  assert.ok(!broker.prompt(p,j).includes('test-key'));assert.match(broker.prompt(p,j),/只分析，不执行修复/);
  let calls=0;
  broker.approve(j.id,async()=>{calls++;return {cause:'尚不能确定连接失败的具体原因。',steps:['查询原请求状态。'],needsUser:'核对服务连接。'};});
  assert.equal((await settle(j.id)).status,'ready');
  assert.throws(()=>broker.approve(j.id),/不能再次提交/);
  assert.throws(()=>broker.applyJob(j.id),/不修改项目/);
  assert.deepEqual(store.get(p.id),p);assert.equal(calls,1);
  assert.throws(()=>validateDiagnosis({cause:'done',steps:[],needsUser:''}),/完整/);
});

test('targeted repair reuses the failed output, validates it, and preserves source audio and history',async()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0),original=broker.prepare(p,p.shots[0].id,'motion');
  const broken={...raw,claimIds:[]};output(original,broken);
  broker.approve(original.id,async()=>broken);
  const failed=await settle(original.id);assert.equal(failed.status,'failed');
  assert.equal(broker.jobHelp(failed).repairable,true);
  const repair=broker.prepare(p,p.shots[0].id,'motion',{repairOf:original.id});
  assert.equal(repair.repairOf,original.id);assert.match(broker.prompt(p,repair),/previousOutput/);
  assert.match(broker.prompt(p,repair),/不得伪造科学依据或取消检查/);
  broker.approve(repair.id,async()=>raw);assert.equal((await settle(repair.id)).status,'ready');
  const next=broker.applyJob(repair.id);
  assert.deepEqual(next.assets,p.assets);assert.deepEqual(next.claims,p.claims);assert.equal(next.shots[0].zh,p.shots[0].zh);
  assert.equal(next.shots[0].reviewed,false);assert.deepEqual(next.shots[0].filmQA,[]);
  assert.deepEqual(store.job(original.id),failed);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(store.data,'jobs',original.id,'result.json'),'utf8')),broken);
});

test('repair rejects uncertain, missing-output, stale and foreign-project results without submission',()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0),j=broker.prepare(p,p.shots[0].id,'motion');
  store.persistJob({...j,status:'failed',error:'No output'});
  assert.throws(()=>broker.prepare(p,j.shotId,'motion',{repairOf:j.id}),/没有可安全复用/);
  output(j,raw);store.persistJob({...j,status:'unknown',error:'待核对'});
  assert.equal(broker.jobHelp(store.job(j.id)).repairable,false);
  assert.throws(()=>broker.prepare(p,j.shotId,'motion',{repairOf:j.id}),/没有可安全复用/);
  store.persistJob({...j,status:'failed',error:'依据编号为空'});
  const other=store.write(motionFixture().p,0);
  assert.throws(()=>broker.prepare(other,other.shots[0].id,'motion',{repairOf:j.id}),/没有可安全复用/);
  const changed=store.write({...p,title:'new version'},p.version);
  assert.throws(()=>broker.prepare(changed,j.shotId,'motion',{repairOf:j.id}),/版本已变化/);
});

test('diagnosis client queries the same request and stops on unknown without replaying approval',async()=>{
  const requests=[];
  const request=async(url,body)=>{
    requests.push({url,body});
    if(url.endsWith('/codex'))return {id:'diagnosis-1'};
    if(url.endsWith('/approve'))return {id:'diagnosis-1',status:'running'};
    return {id:'diagnosis-1',status:'unknown',error:'结果待核对'};
  };
  await assert.rejects(()=>analyzeIssue(request,{id:'project',version:1},{message:'fail'},()=>{},{interval:1}),/待核对/);
  assert.equal(requests.filter(x=>x.url.endsWith('/approve')).length,1);
  assert.equal(requests.filter(x=>x.body===undefined).length,1);
});

test('voice manager copy keeps same-origin framing and exposes only approved UI files',async()=>{
  const {voiceManagerUi}=await import('../server/voice-manager-ui.mjs');
  const headers={},res={setHeader:(name,value)=>headers[name]=value,end:body=>{res.body=body;}};
  assert.equal(await voiceManagerUi({method:'GET'},res,new URL('http://localhost/voice?frameboard=voices')),true);
  assert.match(headers['Content-Security-Policy'],/frame-ancestors 'self'/);
  assert.match(String(res.body),/request-confirmed/);assert.match(String(res.body),/voice-consent/);
  assert.match(String(res.body),/type="module"/);
  await voiceManagerUi({method:'GET'},res,new URL('http://localhost/voice'));
  assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);
  assert.equal(await voiceManagerUi({method:'POST'},res,new URL('http://localhost/voice')),false);
  assert.equal(await voiceManagerUi({method:'GET'},res,new URL('http://localhost/server/store.mjs')),false);
});

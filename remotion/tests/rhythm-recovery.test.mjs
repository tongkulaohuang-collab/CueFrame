import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {motionFixture,explanationFixture,performanceRequirementsFixture} from './fixtures/motion.mjs';
import {uid, timeline} from '../shared/model.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
import {motionReferences, referenceMotionKey, referenceScriptNeeds} from '../shared/reference-motion.mjs';
import {codexTimeout} from '../shared/codex-status.mjs';
import {checkedRhythm, localRhythm} from '../server/rhythm-script.mjs';
import {scriptNeeds} from '../shared/science-flow.mjs';
const modelRhythm=p=>{const raw=localRhythm(p);return {...raw,explanationBeats:explanationFixture(p),performanceRequirements:performanceRequirementsFixture(p,raw.text)};};

process.env.FRAMEBOARD_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'frameboard-rhythm-'));
const {get, write, job, jobs, persistJob, recover, data} = await import('../server/store.mjs');
const {prepare, approve, applyJob, recoverRhythmJob, recoverSavedRhythm,jobHelp,prompt} = await import('../server/codex.mjs');

function project(count = 3) {
  const {p} = motionFixture();
  p.shots = Array.from({length:count}, (_, i) => {
    const shot = structuredClone(p.shots[0]);
    const zh = '观察第' + (i + 1) + '个粒子。它穿过通道。';
    return {...shot, id:uid(), zh, continuity:{subject:'青色粒子',path:'沿通道由左向右穿过开口',camera:'跟拍粒子',handoff:'同一通道'},
      subtitleTracks:{zh:{assetId:'voice',text:zh,segments:[{from:0,until:.7,text:zh.split('。')[0]+'。'},{from:1,until:2,text:'它穿过通道。'}]}}};
  });
  p.script = p.shots.map(s => s.zh).join('\n');
  p.scienceFlow.rhythm = '';
  p.scienceFlow.referenceVideoUrls = 'https://example.org/clip.mp4';
  const ref = motionReferences(p)[0];
  p.scienceFlow.referenceMotion = [{referenceId:ref.id,inputKey:referenceMotionKey(ref),name:'轨迹图',duration:4,
    segments:[{from:1,until:3,confidence:'observed',rhythm:'先描线，停住读数',effectIds:['draw']}],
    excluded:[{from:0,until:1},{from:3,until:4}]}];
  return write(p,0);
}
async function waitForResult(id,status='ready') {
  for (let i = 0; i < 100 && job(id).status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const j = job(id);
  assert.equal(j.status,status,j.error);
  return j;
}
function saveOutput(id, contents) {
  const dir = path.join(data,'jobs',id);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'result.json'),contents);
}

test('节奏任务一次提交即有逐段时间轴稿，刷新或重复确认沿用原任务，完整 AI 稿优先', async () => {
  const p = project(7), request = prepare(p,null,'rhythm');
  let resolve, calls = 0;
  const run = () => { calls++; return new Promise(done => { resolve = done; }); };
  const started = approve(request.id,run);
  assert.equal(codexTimeout('rhythm'), null);
  assert.equal(started.rhythmSource,'timeline');
  assert.ok(started.result[0].includes('speech-zh-1'));
  await Promise.resolve();
  assert.equal(prepare(get(p.id),null,'rhythm').id,request.id);
  assert.equal(approve(request.id,run).id,request.id);
  recover(recoverRhythmJob);
  assert.equal(job(request.id).status,'running');
  assert.equal(jobs(p.id).length,1);
  const raw = modelRhythm(p);
  raw.text = '模型返回的脚本\n' + raw.text.split('\n').slice(1).join('\n');
  resolve(raw);
  const ready = await waitForResult(request.id);
  assert.equal(ready.rhythmSource,'codex');
  assert.equal(ready.result[0],raw.text);
  assert.equal(prepare(p,null,'rhythm').id,ready.id);
  const saved = applyJob(ready.id);
  assert.equal(applyJob(ready.id).version,saved.version);
  assert.equal(calls,1);
  assert.deepEqual(referenceScriptNeeds(saved),[]);
  assert.deepEqual(saved.shots.map(s => s.subtitleTracks),p.shots.map(s => s.subtitleTracks));
});

test('失败后保留时间轴和具体原因，不自动覆盖脚本或放行制作，重新生成不复用失败稿', async () => {
  for (const mode of ['disconnect','startup','empty','partial']) {
    const p = project(), j = prepare(p,null,'rhythm');
    approve(j.id, async () => {
      if (mode === 'disconnect') throw Object.assign(Error('连接中断'),{uncertain:true});
      if (mode === 'startup') throw Error('本机 CLI 尚未登录');
      if (mode === 'empty') return {};
      return {...localRhythm(p),text:'• 0–1｜cueId=design｜对象=粒子｜动作=向右穿过｜形式=motion'};
    });
    const ready = await waitForResult(j.id,mode==='disconnect'?'unknown':'failed'), saved = get(p.id);
    assert.equal(ready.rhythmSource,'timeline');
    assert.ok(ready.rhythmGenerationIssue);
    assert.throws(()=>applyJob(j.id),/时间轴稿不是完整节奏脚本/);
    assert.equal(saved.version,p.version);
    assert.equal(saved.scienceFlow.rhythm,p.scienceFlow.rhythm);
    assert.ok(scriptNeeds(saved).some(s=>s.includes('逐句讲解过程')));
    for (const row of timeline(saved).rows) assert.ok(actionRequirements({...saved,scienceFlow:{...saved.scienceFlow,rhythm:ready.result[0]}},row.shot.id,row).length);
    assert.ok(ready.referenceScript.applications.every(a => a.from === 1 && a.until === 3));
    if(mode==='disconnect')assert.throws(()=>prepare(saved,null,'rhythm'),/上一请求仍在执行或提交状态待核对/);
    else assert.notEqual(prepare(saved,null,'rhythm').id,j.id);
  }
});

test('异常退出优先收取落盘的完整 AI 稿；草稿更新时保留旧版本的结果', async () => {
  const p = project(), j = prepare(p,null,'rhythm'), raw = modelRhythm(p);
  raw.text += '\n完整模型回执';
  approve(j.id, async () => {
    saveOutput(j.id,JSON.stringify(raw));
    throw Object.assign(Error('进程异常退出'),{uncertain:true});
  });
  write({...p,title:'用户继续编辑'},p.version);
  const ready = await waitForResult(j.id);
  assert.equal(ready.rhythmSource,'codex');
  assert.equal(ready.result[0],raw.text);
  assert.throws(() => applyJob(j.id),/旧版本/);
  assert.equal(get(p.id).title,'用户继续编辑');
  assert.equal(get(p.id).scienceFlow.rhythm,'');
});

test('服务重启从原任务恢复，兼容旧版空文件，只处理已经提交的节奏任务', () => {
  const p = project(), raw = modelRhythm(p);
  const seed = (overrides={}) => persistJob({id:uid(),type:'codex',task:'rhythm',status:'running',project:p.id,version:p.version,...overrides});
  const ai = seed(), legacy = seed({status:'unknown',error:'上次本地超时'}), partial = seed({rhythmSource:'timeline',result:[raw.text],referenceScript:{libraryVersion:raw.libraryVersion,applications:raw.referenceApplications}});
  const awaiting = seed({status:'awaiting'}), closed = seed({status:'reconciled'}), other = seed({task:'proofs',status:'unknown'});
  saveOutput(ai.id,JSON.stringify(raw));
  saveOutput(legacy.id,'');
  saveOutput(partial.id,'{"text":');
  recover(recoverRhythmJob);
  assert.equal(job(ai.id).rhythmSource,'codex');
  for (const item of [legacy,partial]) {
    const j = job(item.id);
    assert.equal(j.status,item.id===legacy.id?'unknown':'failed');
    assert.equal(j.result[0],raw.text);
    assert.equal(j.rhythmSource,'timeline');
  }
  assert.equal(job(awaiting.id).status,'awaiting');
  assert.equal(job(closed.id).status,'reconciled');
  assert.equal(job(other.id).status,'unknown');
  const previous = jobs(p.id);
  recover(recoverRhythmJob);
  assert.deepEqual(jobs(p.id),previous);
});

test('只有音轨起点时保留录音边界，估算时间和手工保留片段不冒充实测', () => {
  const p = project(1);
  p.shots[0].seconds = 30;
  delete p.shots[0].subtitleTracks;
  p.scienceFlow.referenceMotion[0].segments[0] = {from:1,until:3,confidence:'manual',effectIds:[]};
  const raw = checkedRhythm(localRhythm(p),p);
  assert.match(raw.text,/cueId=voice-0/);
  assert.match(raw.text,/cueId=design/);
  assert.doesNotMatch(raw.text,/cueId=speech-/);
  assert.deepEqual(raw.referenceApplications,[]);
  assert.match(raw.referenceDecisions[0].reason,/尚未完成语义匹配/);
});

test('工作台 HTTP 提交、刷新和实际服务重启都从同一任务交付脚本', async t => {
  const p = project(7);
  const probe = net.createServer();
  probe.listen(0,'127.0.0.1');
  await once(probe,'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = 'http://127.0.0.1:' + port;
  let service;
  async function stop() {
    if (!service || service.exitCode !== null || service.signalCode !== null) return;
    const stopped = once(service,'exit');
    service.kill();
    await stopped;
  }
  async function start() {
    service = spawn(process.execPath,['server/main.mjs','--port=' + port],{
      cwd:path.resolve(import.meta.dirname,'..'), windowsHide:true, stdio:['ignore','pipe','pipe'],
      env:{...process.env, FRAMEBOARD_DATA:data, FRAMEBOARD_CODEX:path.join(data,'no-cloud-cli')},
    });
    let output = '';
    service.stderr.on('data',chunk => { output += chunk; });
    for (let i = 0; i < 200; i++) {
      if (service.exitCode !== null || service.signalCode !== null) throw Error('测试服务启动失败：' + output);
      if (await fetch(base+'/api/health').then(r => r.json()).then(h => h.rhythmRecovery === 1).catch(() => false)) return;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw Error('测试服务没有开始监听：' + output);
  }
  async function api(route,body) {
    const response = await fetch(base+route, body === undefined ? {} : {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
    });
    const answer = await response.json();
    assert.ok(response.ok,answer.error);
    return answer;
  }
  t.after(stop);
  await start();
  const route = '/api/projects/' + p.id;
  const started = await api(route+'/codex',{version:p.version,task:'rhythm',submit:true});
  assert.equal(started.status,'running');
  assert.ok(started.result[0].includes('第 7 段'));
  await waitForResult(started.id,'failed');
  assert.equal((await api(route+'/jobs?workbench=1')).jobs[0].id,started.id);
  const original = get(p.id);
  const blocked=await fetch(base+'/api/jobs/'+started.id+'/apply',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(blocked.status,400);
  saveOutput(started.id,JSON.stringify(modelRhythm(original)));
  const restored=await api('/api/jobs/'+started.id+'/recover-rhythm',{version:original.version});
  assert.equal(restored.rhythmSource,'codex');
  const saved=await api('/api/jobs/'+restored.id+'/apply',{});
  assert.equal(saved.scienceFlow.rhythm,(await api(route)).scienceFlow.rhythm);
  assert.equal((await api('/api/jobs/'+started.id+'/recover-rhythm',{version:saved.version})).id,restored.id);
  const crashed = persistJob({id:uid(),project:p.id,version:original.version,type:'codex',task:'rhythm',shotId:null,
    status:'running',owner:service.pid,approvedAt:new Date().toISOString()});
  saveOutput(crashed.id,JSON.stringify(modelRhythm(original)));
  await stop();
  await start();
  const recovered = await api('/api/jobs/'+crashed.id);
  assert.equal(recovered.status,'ready');
  assert.equal(recovered.rhythmSource,'codex');
  assert.equal((await api(route)).version,saved.version);
  assert.equal((await api(route+'/jobs')).length,3);
});

test('旧版已采用的兜底任务可本地恢复，原记录、媒体与人工编辑受版本保护',()=>{
  const p=project(2),raw=modelRhythm(p),fallback=localRhythm(p);
  const old=persistJob({id:uid(),type:'codex',task:'rhythm',shotId:null,project:p.id,version:p.version,status:'applied',rhythmSource:'timeline',result:[fallback.text],rhythmGenerationIssue:'旧校验错误'});
  const next=write({...p,scienceFlow:{...p.scienceFlow,rhythm:fallback.text}},p.version);
  persistJob({...old,appliedVersion:next.version});saveOutput(old.id,JSON.stringify(raw));
  assert.equal(jobHelp(job(old.id)).rhythmRecoverable,true);
  assert.throws(()=>recoverSavedRhythm(old.id,p.version),/草稿已更新/);
  const recovered=recoverSavedRhythm(old.id,next.version);
  assert.equal(recovered.recoveryOf,old.id);assert.equal(job(old.id).rhythmSource,'timeline');
  assert.equal(recoverSavedRhythm(old.id,next.version).id,recovered.id);
  const saved=applyJob(recovered.id);
  assert.deepEqual(saved.assets,p.assets);assert.deepEqual(saved.shots.map(s=>s.subtitleTracks),p.shots.map(s=>s.subtitleTracks));
  assert.equal(recoverSavedRhythm(old.id,saved.version).id,recovered.id);
  const changed=write({...saved,scienceFlow:{...saved.scienceFlow,rhythm:'用户手写的新脚本'}},saved.version);
  assert.throws(()=>recoverSavedRhythm(old.id,changed.version),/不能覆盖当前内容/);
});

test('完整但校验失败的返回稿落盘，定向修复带原错误且不重发未知提交',async()=>{
  const p=project(1),raw=modelRhythm(p);raw.explanationBeats=[];
  const j=prepare(p,null,'rhythm');let calls=0;
  approve(j.id,async()=>{calls++;return raw;});
  const failed=await waitForResult(j.id,'failed');
  assert.equal(calls,1);assert.equal(failed.rhythmFailure,'validation');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data,'jobs',j.id,'received-rhythm.json'),'utf8')),raw);
  assert.equal(jobHelp(failed).repairable,true);
  const repair=prepare(p,null,'rhythm',{repairOf:j.id});
  assert.match(prompt(p,repair),/缺少逐句的信息变化计划/);
  assert.throws(()=>recoverSavedRhythm(j.id,p.version),/缺少逐句/);
  assert.equal(get(p.id).version,p.version);
  persistJob({...failed,status:'unknown'});
  assert.throws(()=>recoverSavedRhythm(j.id,p.version),/执行中或结果待核对/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture,explanationScriptFixture} from './fixtures/motion.mjs';
import {scienceGate,scriptReady} from '../shared/science-flow.mjs';
import {motionInputs,motionIssues} from '../shared/motion-plan.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {issueHelp} from '../shared/issue-help.mjs';
import {RENDER_PIPELINE_VERSION} from '../shared/scene-props.mjs';
import {uid} from '../shared/model.mjs';
import {taskProblem} from '../shared/science-task-status.mjs';

process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-quality-integration-'));
const store=await import('../server/store.mjs');
const {prepare}=await import('../server/codex.mjs');
const {render}=await import('../server/render.mjs');
const {startSegments,reusableSegment}=await import('../server/segments.mjs');

test('旧批准标记不能绕过单镜、全部生成、效果图和直接渲染的讲解检查',()=>{
  const {p}=motionFixture(),saved=store.write(p,0),id=saved.shots[0].id;
  assert.equal(scriptReady(saved),false);
  assert.deepEqual(scienceGate(saved,false,{preserveVisuals:true}),[]);
  assert.ok(scienceGate(saved,true,{preserveVisuals:true}).length,'整片制作不能使用字幕更新的兼容入口');
  for(const run of [()=>prepare(saved,id,'motion'),()=>prepare(saved,null,'proofs'),
    ()=>startSegments(saved,{mode:'visual'},''),()=>render(saved,id,'zh','')])
    assert.throws(run,/逐句讲解过程/);
  assert.equal(store.jobs(saved.id).length,0,'在提交生成或排队渲染前拦截，不占额度');
});

test('保存的讲解计划须重新核验实际声音、顺序与覆盖，不能只看版本号',()=>{
  const {p}=motionFixture({presentation:true});assert.equal(scriptReady(p),true);
  p.scienceFlow.referenceScript.explanationBeats[0].cueIds=['made-up'];
  assert.match(scienceGate(p).join(' '),/实际旁白/);
  explanationScriptFixture(p);p.scienceFlow.referenceScript.explanationBeats[0].until=.5;
  assert.match(scienceGate(p).join(' '),/信息空档/);
});

test('直接渲染再次检查机制证据与文字安排，讲解计划修改使旧动画失效',()=>{
  const {p,raw}=motionFixture({presentation:true}),s=p.shots[0];
  Object.assign(s,validateMotionResult(raw,p,{shotId:s.id,presentationVersion:1})[0]);
  s.motionPlan.inputs=motionInputs(p,s);
  assert.deepEqual(motionIssues(s.motionPlan,p,24,s),[]);
  const bad=structuredClone(s.motionPlan);bad.explanationEvidence=[];
  assert.match(motionIssues(bad,p,24,s).join(' '),/未逐项实现/);
  delete bad.presentation;
  assert.match(motionIssues(bad,p,24,s).join(' '),/缺少文字角色/);
  p.scienceFlow.referenceScript.explanationBeats[0].after='同一粒子抵达右侧出口';
  assert.match(motionIssues(s.motionPlan,p,24,s).join(' '),/内容已修改/);
});

test('旧视频保持可播放，单独更新字幕不会提交新动画或伪造新检查',async()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];
  Object.assign(s,validateMotionResult(raw,p,{shotId:s.id})[0]);s.motionPlan.inputs=motionInputs(p,s);
  const saved=store.write(p,0),old={id:uid(),type:'render',scope:'shot',project:p.id,version:saved.version,
    shotId:s.id,variant:'zh',status:'done',pipelineVersion:RENDER_PIPELINE_VERSION};
  const folder=path.join(store.data,'exports',old.id);fs.mkdirSync(folder);
  for(const name of ['sample.mp4','subtitles.srt'])fs.writeFileSync(path.join(folder,name),'test fixture');
  store.persistJob({...old,output:'/exports/'+old.id+'/'});
  assert.equal(reusableSegment(saved,s.id,'zh').id,old.id);
  let received;
  const batch=startSegments(saved,{mode:'captions'},'',{interval:1,approve:()=>{throw Error('不应调用生成');},
    render:(...args)=>{received=args;return store.persistJob({...old,id:uid(),status:'done'});}});
  for(let n=0;n<100&&store.job(batch.id).status==='running';n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(store.job(batch.id).status,'done');assert.equal(received[5].preserveVisuals,true);
  assert.ok(store.jobs(p.id).every(j=>j.type!=='codex'));
});

test('排版错误保留具体时间与对象，并指向画面修复；缺少讲解设计指向脚本',()=>{
  const error='排版检查 3.125 秒：标签 price 与连线 growth 相交';
  const help=issueHelp(error);assert.equal(help.cause,error);assert.equal(help.action,'sample');
  assert.match(help.steps.join(' '),/保留已有配音/);
  assert.equal(issueHelp('当前脚本尚无逐句讲解过程').action,'direction');
  assert.equal(taskProblem({task:'rhythm',rhythmSource:'timeline',status:'applied'}).label,'节奏脚本未完成');
});

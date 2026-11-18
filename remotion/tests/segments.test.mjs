import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture as legacyMotionFixture,explanationScriptFixture,performanceRequirementsFixture} from './fixtures/motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {mergeShotDesigns} from '../shared/merge-shot-designs.mjs';
import {uid} from '../shared/model.mjs';
import {RENDER_PIPELINE_VERSION} from '../shared/scene-props.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
import {validateMotionResult} from '../server/motion.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-segments-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const {startSegments,resumeSegments,segmentStatus,reusableSegment}=await import('../server/segments.mjs');
const wait=async id=>{
  for(let i=0;i<500;i++){const j=store.job(id);if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,5));}
  throw Error('batch did not finish');
};
function fakeRender(p,id,variant) {
  const j={id:uid(),project:p.id,version:p.version,shotId:id,type:'render',scope:'shot',variant,status:'done',pipelineVersion:RENDER_PIPELINE_VERSION};
  const folder=path.join(store.data,'exports',j.id);fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder,'sample.mp4'),'test only');fs.writeFileSync(path.join(folder,'subtitles.srt'),'test only');
  return store.persistJob({...j,output:'/exports/'+j.id+'/'});
}
test('候选对照只关联同版同语种，不能冒充已生成或已审分段',()=>{
  const {p:source}=motionFixture(),p=store.write(source,0),id=uid();
  const candidate={id,project:p.id,version:p.version,variant:'zh',type:'motion-comparison',status:'done',output:'/exports/'+id+'/'};
  store.persistJob(candidate);
  assert.equal(segmentStatus(p).comparison,null,'文件未齐时不显示候选');
  const folder=path.join(store.data,'exports',id);fs.mkdirSync(folder);
  for(const name of ['sample.mp4','film.mp4','subtitles.srt'])fs.writeFileSync(path.join(folder,name),'test fixture only');
  const result=segmentStatus(p);
  assert.equal(result.comparison.id,id);assert.equal(result.rows[0].video,null);assert.notEqual(result.rows[0].status,'approved');
  assert.equal(reusableSegment(p,p.shots[0].id,'zh'),null);
  assert.equal(segmentStatus(p,'en').comparison,null);
  assert.equal(segmentStatus({...p,version:p.version+1}).comparison,null);
});
test('图文引擎升级仍可预览未受影响的旧片，新增图文轨道不能复用旧输出',()=>{
  const {p:source,raw}=legacyMotionFixture(),shot=source.shots[0];
  Object.assign(shot,{...raw,motionPlan:raw.motion});delete shot.motion;
  const p=store.write(source,0),rendered=fakeRender(p,shot.id,'zh');
  store.persistJob({...rendered,pipelineVersion:'kino-media-fullbleed-v4-2026-11-10'});
  assert.equal(reusableSegment(p,shot.id,'zh')?.id,rendered.id);
  const next=structuredClone(p);next.shots[0].motionPlan.nodes[1].graphics={version:1,tracks:[],morphs:[],textStates:[]};
  assert.equal(reusableSegment(next,shot.id,'zh'),null);
});
test('同一语种的新批次只覆盖自己的分段，保留另一段的失败原因和待核对状态',()=>{
  const {p}=motionFixture();
  const first=p.shots[0].id,second=uid();
  p.shots.push({...p.shots[0],id:second});
  const project=store.write(p,0),base={project:project.id,version:project.version,variant:'zh'};
  const parent=store.persistJob({...base,id:uid(),type:'segments',status:'failed',created:'2026-11-01T00:00:00Z',
    items:[{shotId:first,status:'failed'}],error:'此段字幕缺少音轨'});
  store.persistJob({...base,id:uid(),type:'segments',status:'cancelled',created:'2026-11-02T00:00:00Z',items:[{shotId:second,status:'waiting'}]});
  let rows=segmentStatus(project).rows;
  assert.equal(rows[0].status,'failed');assert.equal(rows[0].errorJob.error,parent.error);assert.equal(rows[1].status,'stopped');
  const child=store.persistJob({...base,id:uid(),type:'codex',task:'motion',shotId:first,status:'unknown',batchId:parent.id,created:parent.created,error:'原请求需要核对'});
  store.persistJob({...parent,items:[{shotId:first,status:'failed',motionId:child.id}]});
  rows=segmentStatus(project).rows;
  assert.equal(rows[0].status,'unknown');assert.equal(rows[0].errorJob.id,child.id);
});
test('生成设计匹配原有口播，保留ID、配音和实测字幕，不重复追加',()=>{
  const {p}=motionFixture(),s=p.shots[0];s.subtitleTracks={zh:{text:s.zh}};
  const merged=mergeShotDesigns(p.shots,[{...s,id:uid(),title:'完成的设计',seconds:8}]);
  assert.equal(merged.length,1);assert.equal(merged[0].id,s.id);assert.equal(merged[0].seconds,2);
  assert.deepEqual(merged[0].subtitleTracks,s.subtitleTracks);assert.equal(merged[0].title,'完成的设计');
});
test('一次提交按段生成，跨版本保留先前的视频；重复点击不重复生成',async()=>{
  const {p:source,raw}=motionFixture();source.shots.push({...structuredClone(source.shots[0]),id:uid(),zh:'第二段口播'});
  source.scienceFlow.rhythm+='\n• 2.8｜cueId=design｜对象=粒子｜动作=通过通道｜形式=motion';
  explanationScriptFixture(source);
  source.scienceFlow.referenceScript.performanceRequirements=performanceRequirementsFixture(source);
  const p=store.write(source,0);let ai=0,renders=0;
  const deps={interval:2,approve:id=>broker.approve(id,async()=>{ai++;const result=structuredClone(raw),current=store.get(p.id),shotId=store.job(id).shotId;result.motion.actionEvidence[0].requirementId=actionRequirements(current,shotId)[0].id;result.motion.explanationEvidence[0].beatId=current.scienceFlow.referenceScript.explanationBeats.find(b=>b.shotId===shotId).id;return result;}),render:(...args)=>{renders++;return fakeRender(...args);}};
  deps.approve=id=>broker.approve(id,async()=>{ai++;const result=structuredClone(raw),current=store.get(p.id),shotId=store.job(id).shotId;
    result.motion.actionEvidence[0].requirementId=actionRequirements(current,shotId)[0].id;
    result.motion.explanationEvidence[0].beatId=current.scienceFlow.referenceScript.explanationBeats.find(b=>b.shotId===shotId).id;
    const requirementId=current.scienceFlow.referenceScript.performanceRequirements.find(r=>r.shotId===shotId).id;
    result.motion.performance.events[0].requirementId=requirementId;result.motion.cameraShots[0].eventIds=[requirementId];return result;});
  const a=startSegments(p,{},'http://localhost',deps),b=startSegments(p,{},'http://localhost',deps);
  assert.equal(a.id,b.id);assert.equal((await wait(a.id)).status,'done');
  let q=store.get(p.id);assert.equal(q.version,3);assert.equal(ai,2);assert.equal(renders,2);
  assert.equal(segmentStatus(q).rows.filter(r=>r.video).length,2);
  const saved=structuredClone(q);
  saved.assets=saved.assets.map(a=>Object.fromEntries(Object.entries(a).reverse()));
  assert.equal(reusableSegment(saved,q.shots[0].id,'zh')?.id,reusableSegment(q,q.shots[0].id,'zh').id,
    '保存图片参考时，素材元数据的字段顺序可变化，已渲染分段应继续可播放');
  const oldHistory=store.jobs(p.id).map(j=>({...j,pipelineVersion:'previous-renderer'}));
  assert.equal(reusableSegment(q,q.shots[0].id,'zh',oldHistory),null);
  const legacyHistory=store.jobs(p.id).map(j=>({...j,pipelineVersion:'bilingual-captions-2026-11-09'}));
  assert.ok(reusableSegment(q,q.shots[0].id,'zh',legacyHistory),'未应用新动效的旧片继续可复用');
  const withLibrary=structuredClone(q);withLibrary.shots[0].libraryTransition={kind:'fade',params:{duration:.5}};
  assert.equal(reusableSegment(withLibrary,withLibrary.shots[0].id,'zh',legacyHistory),null,'实际应用动效后不能复用旧片');
  const again=startSegments(q,{},'http://localhost',deps);assert.equal((await wait(again.id)).status,'done');
  assert.equal(ai,2);assert.equal(renders,2);
  q=structuredClone(q);q.shots[0].zh+='改变';assert.equal(reusableSegment(q,q.shots[0].id,'zh'),null);
  assert.ok(store.jobs(p.id).filter(j=>j.task==='motion').every(j=>j.batchId&&!j.renderAfter));
});
test('未知提交停止，不自动重试；显式继续也不能重复未知请求',async()=>{
  const {p:source}=motionFixture(),p=store.write(source,0);let ai=0;
  const a=startSegments(p,{},'',{interval:2,approve:id=>broker.approve(id,async()=>{ai++;throw Object.assign(Error('提交状态待核对'),{uncertain:true});})});
  assert.equal((await wait(a.id)).status,'failed');assert.equal(ai,1);
  assert.throws(()=>startSegments(store.get(p.id),{},''),/待核对/);
});

test('批次开始前检查后续段的动作冲突，不创建批次或消耗第一段生成',()=>{
  const {p:source}=motionFixture();source.shots.push({...structuredClone(source.shots[0]),id:uid(),zh:'第二段口播'});
  source.scienceFlow.rhythm+='\n• 2–4｜cueId=voice-0｜eventId=process-1｜对象=粒子｜动作=穿过通道｜形式=reveal';
  explanationScriptFixture(source);source.scienceFlow.referenceScript.performanceRequirements=performanceRequirementsFixture(source);
  const p=store.write(source,0),before=store.jobs(p.id);let calls=0;
  assert.throws(()=>startSegments(p,{mode:'visual'},'',{approve:()=>calls++}),/process-1.*reveal/);
  assert.deepEqual(store.jobs(p.id),before);assert.equal(calls,0);
  const failed=store.persistJob({id:uid(),project:p.id,type:'segments',status:'failed',mode:'visual',variant:'zh',version:p.version,
    expectedVersion:p.version,items:p.shots.map(s=>({shotId:s.id,status:'waiting'}))});
  assert.throws(()=>resumeSegments(p,failed.id,''),/process-1.*reveal/);
  assert.deepEqual(store.job(failed.id),failed);assert.equal(calls,0);
});

test('复用旧版本分段填写的修改意见能带入重做，内容变化后不误用旧意见',()=>{
  const {p:source,raw}=motionFixture(),s=source.shots[0];Object.assign(s,validateMotionResult(raw,source,{shotId:s.id})[0]);
  const p=store.write(source,0),rendered=fakeRender(p,s.id,p.voice);
  store.persistJob({...rendered,review:{decision:'changes',time:.8,note:'通过通道时放慢'}});
  const next=store.write({...p,title:'仅修改项目名称'},p.version),j=broker.prepare(next,s.id,'motion');
  assert.equal(j.feedback.note,'通过通道时放慢');
  const changed=structuredClone(next);changed.shots[0].zh+='新台词';explanationScriptFixture(changed);const latest=store.write(changed,next.version);
  assert.equal(broker.prepare(latest,s.id,'motion').feedback,null);
});
test('生成过程中改稿不覆盖用户内容，保留已取得的AI结果',async()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0);
  const a=startSegments(p,{},'',{interval:2,approve:id=>broker.approve(id,async()=>{
    store.write({...p,title:'用户的新标题'},p.version);return raw;
  })});
  assert.equal((await wait(a.id)).status,'failed');assert.equal(store.get(p.id).title,'用户的新标题');
  assert.equal(store.jobs(p.id).find(j=>j.task==='motion').status,'ready');
});
test('旧页面不能抢先采用正在批量制作的回执',()=>{
  const {p:source}=motionFixture(),p=store.write(source,0);
  const batch=store.persistJob({id:uid(),project:p.id,type:'segments',status:'running'});
  const j=broker.prepare(p,p.shots[0].id,'motion');store.persistJob({...j,batchId:batch.id});
  assert.throws(()=>broker.applyJob(j.id),/后台正在生成/);
  store.persistJob({...batch,status:'failed'});
});

test('服务更新后续制跳过完成段，复用已返回动画；重复继续不重复提交',async()=>{
  const {p:source,raw}=motionFixture();source.shots.push({...structuredClone(source.shots[0]),id:uid(),zh:'第二段口播'});
  source.scienceFlow.rhythm+='\n• 2.8｜cueId=design｜对象=粒子｜动作=通过通道｜形式=motion';
  explanationScriptFixture(source);source.scienceFlow.referenceScript.performanceRequirements=performanceRequirementsFixture(source);
  const p=store.write(source,0);let ai=0,renders=0,applies=0;
  const deps={interval:2,approve:id=>broker.approve(id,async()=>{
    ai++;const result=structuredClone(raw),current=store.get(p.id),shotId=store.job(id).shotId;
    result.motion.actionEvidence[0].requirementId=actionRequirements(current,shotId)[0].id;
    result.motion.explanationEvidence[0].beatId=current.scienceFlow.referenceScript.explanationBeats.find(b=>b.shotId===shotId).id;
    const requirementId=current.scienceFlow.referenceScript.performanceRequirements.find(r=>r.shotId===shotId).id;
    result.motion.performance.events[0].requirementId=requirementId;result.motion.cameraShots[0].eventIds=[requirementId];return result;
  }),render:(...args)=>{renders++;return fakeRender(...args);},applyJob:(...args)=>{
    if(++applies===2)throw Object.assign(Error('工作台服务已更新；生成结果已返回并保留'),{code:'WORKBENCH_RUNTIME_STALE'});
    return broker.applyJob(...args);
  }};
  const first=startSegments(p,{mode:'visual'},'',deps),failed=await wait(first.id);
  assert.equal(failed.status,'failed');assert.equal(failed.failedStage,'apply');assert.equal(ai,2);assert.equal(renders,1);
  const originalResult=structuredClone(store.job(failed.items[1].motionId).result);
  const current=store.get(p.id),next=resumeSegments(current,failed.id,'',deps);
  assert.equal(resumeSegments(current,failed.id,'',deps).id,next.id);
  const done=await wait(next.id);assert.equal(done.status,'done',done.error);
  assert.equal(ai,2,'ready结果不重新生成');assert.equal(renders,2,'完成段不重新渲染');
  assert.equal(done.items[0].renderId,failed.items[0].renderId);
  assert.equal(done.items[1].motionId,failed.items[1].motionId);
  assert.deepEqual(store.job(failed.items[1].motionId).result,originalResult);
  assert.equal(store.job(failed.id).status,'failed');assert.equal(store.job(failed.id).error,failed.error);
  assert.equal(resumeSegments(store.get(p.id),failed.id,'',deps).id,next.id);
});

test('采用后渲染失败的续制只渲染，不因visual模式重新生成动画',async()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0);let ai=0;
  const first=startSegments(p,{mode:'visual'},'',{interval:2,
    approve:id=>broker.approve(id,async()=>{ai++;return raw;}),render:()=>{throw Error('模拟渲染中断');}});
  const failed=await wait(first.id);assert.equal(failed.status,'failed');assert.equal(failed.failedStage,'render');
  assert.equal(store.job(failed.items[0].motionId).status,'applied');
  const next=resumeSegments(store.get(p.id),failed.id,'',{interval:2,approve:()=>{throw Error('不应重新生成');},render:fakeRender});
  assert.equal((await wait(next.id)).status,'done');assert.equal(ai,1);
});

test('继续失败批次先校验保存的原返回，可恢复时不再调用生成器',async()=>{
  const {p:source,raw}=motionFixture(),p=store.write(source,0);
  const motion=store.persistJob({...broker.prepare(p,p.shots[0].id,'motion'),status:'failed',error:'旧校验失败'});
  const dir=path.join(store.data,'jobs',motion.id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(raw));
  const original=store.persistJob({id:uid(),type:'segments',project:p.id,version:p.version,expectedVersion:p.version,
    status:'failed',mode:'visual',variant:'zh',items:[{shotId:p.shots[0].id,status:'failed',force:true,motionId:motion.id}]});
  const next=resumeSegments(p,original.id,'',{interval:2,approve:()=>{throw Error('不得重新提交');},render:fakeRender});
  const done=await wait(next.id);assert.equal(done.status,'done',done.error);
  assert.equal(store.job(done.items[0].motionId).localRecoveryOf,motion.id);
  assert.equal(store.job(motion.id).error,'旧校验失败');
});

test('续制拒绝草稿变化、其他项目和未知提交；原批次保持不变',()=>{
  const p=store.write(motionFixture().p,0),original=store.persistJob({id:uid(),project:p.id,type:'segments',status:'failed',mode:'visual',variant:'zh',version:p.version,expectedVersion:p.version,items:[{shotId:p.shots[0].id,status:'failed'}]});
  const other=store.write(motionFixture().p,0);
  assert.throws(()=>resumeSegments(other,original.id,''),/当前项目/);
  const uncertain=store.persistJob({id:uid(),project:p.id,type:'codex',task:'motion',status:'unknown'});
  assert.throws(()=>resumeSegments(p,original.id,''),/待核对/);
  store.persistJob({...uncertain,status:'failed'});
  const changed=store.write({...p,title:'用户改稿'},p.version);
  assert.throws(()=>resumeSegments(changed,original.id,''),/内容.*修改/);
  assert.deepEqual(store.job(original.id),original);
});

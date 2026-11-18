import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture,explanationScriptFixture} from './fixtures/motion.mjs';
import {scienceStepIssues,taskProblem} from '../shared/science-task-status.mjs';
import {referenceAttempt,referenceMotionKey} from '../shared/reference-motion.mjs';

function setup(){
  const {p}=motionFixture();
  const shot=p.shots[0].id;
  let clock=0;
  const make=(task,extra={})=>({task,type:'codex',status:'failed',error:'测试原因',project:p.id,
    version:4,id:'j'+(++clock),created:new Date(clock*1000).toISOString(),...extra});
  return {p,shot,make};
}
test('科普七步按任务归属显示实际问题，更新的成功只清除同一操作',()=>{
  const {p,shot,make}=setup();
  const records=[make('research'),make('narration',{status:'unknown'}),make('research',{researchScope:'visuals'}),
    make('rhythm'),make('proofs'),make('motion',{shotId:shot}),make(null,{type:'joined',mode:'final'})];
  const issues=scienceStepIssues(p,records);
  assert.deepEqual(issues.map(i=>i.step).sort(),[0,1,2,3,4,5,6]);
  assert.equal(issues.find(i=>i.step===4).label,'结果待核对');
  const next=scienceStepIssues(p,[...records,make('research',{status:'applied'}),make('proofs',{project:'another',status:'applied'}),make('motion',{shotId:'removed'})]);
  assert.deepEqual(next.map(i=>i.step).sort(),[1,2,3,4,5,6]);
});
test('分段中断保留提交待核对的子请求，另一个分段成功不掩盖原问题',()=>{
  const {p,shot,make}=setup();
  p.shots.push({...p.shots[0],id:'second'});
  const child=make('motion',{batchId:'batch',shotId:shot,status:'unknown',variant:'zh'});
  const batch=make(null,{id:'batch',type:'segments',variant:'zh',items:[{shotId:shot,motionId:child.id,status:'failed'},{shotId:'second',status:'waiting'}]});
  const done=make(null,{type:'segments',variant:'zh',items:[{shotId:'second',status:'done'}],status:'done'});
  const issues=scienceStepIssues(p,[batch,done,child]);
  assert.deepEqual(issues.map(i=>[i.step,i.subject,i.label]),[[3,'第 1 段','结果待核对']]);
  const repaired=make(null,{type:'segments',variant:'zh',items:[{shotId:shot,status:'done'}],status:'done'});
  assert.deepEqual(scienceStepIssues(p,[batch,done,repaired,{...child,status:'reconciled'}]),[]);
});
test('已成功的独立渲染被续制批次复用后，不重新暴露旧失败',()=>{
  const {p,shot,make}=setup();
  p.shots.push({...p.shots[0],id:'second'});
  const old=make(null,{type:'render',scope:'shot',shotId:shot,variant:'zh'});
  const other=make(null,{type:'render',scope:'shot',shotId:'second',variant:'zh'});
  const english=make(null,{type:'render',scope:'shot',shotId:shot,variant:'en'});
  const unknown=make('motion',{shotId:shot,variant:'zh',status:'unknown'});
  const done=make(null,{type:'render',scope:'shot',shotId:shot,variant:'zh',status:'done'});
  const batch=make(null,{type:'segments',variant:'zh',status:'done',items:[{shotId:shot,status:'done',renderId:done.id}]});
  const history=[old,other,english,unknown,done,batch];
  assert.deepEqual(scienceStepIssues(p,history).map(i=>i.job.id).sort(),[other.id,english.id,unknown.id].sort());
  const newer=make(null,{type:'render',scope:'shot',shotId:shot,variant:'zh'});
  assert.ok(scienceStepIssues(p,[...history,newer]).some(i=>i.job.id===newer.id),'新失败仍显示');
  assert.equal(old.status,'failed','历史回执不改写');
});

test('失败段已单独修复后，原错误不转嫁到尚未开始的后续段',()=>{
  const {p,shot,make}=setup();p.shots.push({...p.shots[0],id:'second'});
  const failed=make(null,{type:'segments',variant:'zh',status:'failed',items:[{shotId:shot,status:'failed'},{shotId:'second',status:'waiting'}]});
  const repaired=make(null,{type:'segments',variant:'zh',status:'done',items:[{shotId:shot,status:'done'}]});
  assert.deepEqual(scienceStepIssues(p,[failed,repaired]),[]);
  failed.items[1].status='failed';
  assert.equal(scienceStepIssues(p,[failed,repaired])[0].subject,'第 2 段','真实失败仍保留');
});
test('批次中采用的动画也覆盖同段旧失败，但未采用的结果不覆盖',()=>{
  const {p,shot,make}=setup();
  const old=make('motion',{shotId:shot,variant:'zh'});
  const adopted=make('motion',{shotId:shot,variant:'zh',status:'applied'});
  const batch=make(null,{type:'segments',variant:'zh',status:'done',items:[{shotId:shot,status:'done',motionId:adopted.id}]});
  assert.deepEqual(scienceStepIssues(p,[old,adopted,batch]),[]);
  assert.deepEqual(scienceStepIssues(p,[old,{...adopted,status:'ready'},batch]).map(i=>i.job.id),[old.id]);
});
test('素材部分完成、真实配音与本地渲染按项目和镜头归位',()=>{
  const {p,shot,make}=setup();
  p.scienceFlow.materialPlan={id:'plan',items:[{id:'item',title:'数值图'}]};
  const material=make('material-supplement',{planId:'plan',currentItem:'item',status:'applied',itemError:'写入失败'});
  assert.equal(scienceStepIssues(p,[material])[0].label,'部分完成');
  p.assets.push({kind:'video',generation:{planId:'plan',itemId:'item'}});
  const records=[material,make(null,{type:'voice',shotId:shot,status:'unknown'}),make(null,{type:'local-render',shotId:shot,status:'interrupted'}),make('materials',{planId:'retired'})];
  assert.deepEqual(scienceStepIssues(p,records).map(i=>[i.step,i.label]),[[1,'已中断'],[4,'结果待核对']]);
});
test('节奏失败显示原校验原因，当前完整脚本或本地制作不会被旧兜底任务阻塞',()=>{
  const {p,make}=setup();
  const j=make('rhythm',{status:'applied',rhythmSource:'timeline',rhythmRecoverable:true,rhythmGenerationIssue:'同一镜头的 eventId 不得重复：EB06',execution:{exitCode:0}});
  const issues=scienceStepIssues(p,[j]);
  assert.equal(issues.length,1);assert.equal(issues[0].label,'脚本校验未通过');
  assert.match(issues[0].detail,/EB06/);assert.match(issues[0].message,/本地检查并恢复/);
  explanationScriptFixture(p);
  assert.deepEqual(scienceStepIssues(p,[j]),[]);assert.equal(taskProblem(j,p),null);
  const failedNow={...j,status:'failed',version:p.version};
  assert.ok(taskProblem(failedNow,p),'新请求失败仍须显示；旧有效脚本不能掩盖本次失败');
  p.scienceFlow.rhythm+='\n手动变更';
  assert.equal(scienceStepIssues(p,[j]).length,1);
  p.productionMode='model-process';assert.deepEqual(scienceStepIssues(p,[j]),[]);
});
test('节奏失败的错误脱敏且生成未返回与校验失败分别提示',()=>{
  const problem=taskProblem({task:'rhythm',rhythmSource:'timeline',status:'failed',rhythmFailure:'generation',rhythmGenerationIssue:'连接断开 Bearer secret-123'});
  assert.equal(problem.label,'节奏脚本未完成');assert.doesNotMatch(problem.detail,/secret-123/);
});
test('参考片失败、半途保留、未知和旧版报告分别显示；同名替换不复用错误',()=>{
  const ref={id:'r',name:'片 A',src:'/media/a.mp4'},inputKey=referenceMotionKey(ref);
  const receipt={referenceId:'r',inputKey,reason:'第 30 段未确认',segmentCount:30};
  const failed={status:'failed',version:2,referenceIssue:receipt};
  assert.equal(referenceAttempt(ref,null,[failed],3).label,'分析未通过');
  assert.equal(referenceAttempt(ref,null,[{...failed,status:'unknown'}],3).label,'结果待核对');
  assert.equal(referenceAttempt({...ref,src:'/media/b.mp4'},null,[failed],3).label,'待分析');
  const batch={status:'failed',version:2,referenceReports:[{referenceId:'r',inputKey}]};
  assert.match(referenceAttempt(ref,null,[batch],2).label,/整批中断/);
  assert.match(referenceAttempt(ref,null,[{...batch,status:'ready'}],3).label,/旧版/);
  assert.equal(referenceAttempt(ref,receipt,[{...batch,status:'applied'},failed],3).label,'已分析');
});

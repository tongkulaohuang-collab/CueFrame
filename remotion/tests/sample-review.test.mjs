import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleJob,sampleReviewRecord} from '../shared/sample-review.mjs';
import {motionFixture} from './fixtures/motion.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {actionRequirements} from '../shared/director-quality.mjs';
const p={id:'project',version:3};
const j={id:'first',type:'render',scope:'shot',project:p.id,version:3,shotId:'s1',variant:'zh',status:'done',output:'/exports/first/',created:'2026-11-06T01:00:00Z'};
test('样镜按项目、版本、镜头和语言选择；新任务进行中时不回退旧片',()=>{
  const unrelated=[{...j,id:'wrong-shot',shotId:'s2'},{...j,id:'wrong-language',variant:'en'},
    {...j,id:'old',version:2},{...j,id:'other',project:'other'},{...j,id:'film',scope:'film'}];
  assert.equal(sampleJob(unrelated,p,'s1','zh'),null);
  assert.equal(sampleJob([...unrelated,j],p,'s1','zh').id,j.id);
  const newer={...j,id:'newer',status:'running',created:'2026-11-06T02:00:00Z'};
  assert.equal(sampleJob([j,newer],p,'s1','zh').id,'newer');
});
test('审核绑定已完成的当前版本，修改意见保留时间码且不自动勾选质量清单',()=>{
  const input={version:3,decision:'changes',note:'  这里速度太快  ',time:2.3};
  const result=sampleReviewRecord(j,p,input);
  assert.equal(result.note,'这里速度太快');assert.equal(result.time,2.3);
  assert.equal(sampleReviewRecord(j,p,{...input,decision:'approved',note:''}).decision,'approved');
  assert.equal(result.qa,undefined);
  for(const scope of ['audio','playback','visual','captions']) {
    const issue=sampleReviewRecord(j,p,{...input,scope});
    assert.equal(issue.scope,scope);assert.equal(issue.time,2.3);assert.equal(issue.decision,'changes');
  }
  assert.throws(()=>sampleReviewRecord(j,p,{...input,scope:'unknown'}),/请选择/);
  for(const patch of [{decision:'bad'},{note:''},{time:-1},{time:Infinity},{version:2},{note:'长'.repeat(4001)}])
    assert.throws(()=>sampleReviewRecord(j,p,{...input,...patch}));
  assert.throws(()=>sampleReviewRecord(j,{...p,version:4},input));
  for(const patch of [{status:'running'},{scope:'film'},{output:''}])
    assert.throws(()=>sampleReviewRecord({...j,...patch},p,input));
});

test('科普审核后端拒绝缺失观看及动作确认；只允许内容匹配的跨版本复用',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];p.version=3;
  s.motionPlan=validateMotionResult(raw,p,{shotId:s.id})[0].motionPlan;
  const job={...j,project:p.id,shotId:s.id,evidence:{frames:24}};
  const input={version:3,decision:'approved',time:2,note:'',watched:[[0,2]],actions:actionRequirements(p,s.id).map(r=>r.id),audioChecked:true,styleChecked:true,captionsChecked:true};
  assert.equal(sampleReviewRecord(job,p,input).decision,'approved');
  for(const patch of [{watched:[]},{actions:[]},{audioChecked:false},{audioChecked:undefined},{styleChecked:false},{captionsChecked:false}])assert.throws(()=>sampleReviewRecord(job,p,{...input,...patch}),/导演检查/);
  p.version=4;input.version=4;
  assert.throws(()=>sampleReviewRecord(job,p,input),/内容已有修改/);
  assert.equal(sampleReviewRecord(job,p,input,{contentCurrent:true}).decision,'approved');
  s.motionPlan.actionEvidence=[];assert.throws(()=>sampleReviewRecord(job,p,input,{contentCurrent:true}),/没有实现记录/);
});

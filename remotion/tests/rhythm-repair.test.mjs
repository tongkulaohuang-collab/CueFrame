import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture,explanationFixture} from './fixtures/motion.mjs';
import {localRhythm,checkedRhythm} from '../server/rhythm-script.mjs';
import {checkedRhythmDraft,sameRhythmRecoveryInputs} from '../server/rhythm-repair.mjs';
import {timeline} from '../shared/model.mjs';
import {actionTiming} from '../shared/action-timing.mjs';

export function repairFixture() {
  const {p}=motionFixture();
  p.shots.push({...structuredClone(p.shots[0]),id:'second'});
  const raw=localRhythm(p),lines=[];
  raw.explanationBeats=explanationFixture(p);
  raw.performanceRequirements=[];
  for(const [i,row] of timeline(p).rows.entries()) {
    const start=row.from/p.fps,cue=actionTiming(p,row.shot.id,p.voice,row).speech[0].id;
    for(let part=0;part<2;part++) {
      const line=`• ${start+part}–${start+part+1}｜cueId=${cue}｜eventId=process-${i}｜对象=粒子｜动作=沿通道移动到下一位置｜形式=motion`;
      lines.push(line);
      raw.performanceRequirements.push({id:`p${i}-${part}`,shotId:row.shot.id,actionId:line,kind:'rigid',actorId:'particle',partIds:[],cueId:cue,
        from:part,until:part+1,dependsOn:part?[`p${i}-0`]:i?[`p${i-1}-1`]:[],note:'保留已有语音与位移'});
    }
    if(i)raw.explanationBeats[i].dependsOn=[raw.explanationBeats[i-1].id];
  }
  raw.text=lines.join('\n');
  return {p,raw};
}
const options={requireExplanation:true,requirePerformance:true};
test('停留节拍只从同镜同句同一时间窗的明确停留动作恢复对象',()=>{
  const {p}=motionFixture(),row=timeline(p).rows[0],raw=localRhythm(p);
  const cue=actionTiming(p,row.shot.id,p.voice,row).speech[0].id;
  raw.text=`• 0–2｜cueId=${cue}｜eventId=read-result｜对象=行程标记｜动作=保留位置供阅读｜形式=hold`;
  raw.explanationBeats=[{...explanationFixture(p)[0],id:'read-result',intent:'hold',entities:[],holdReason:'读清行程标记'}];
  raw.performanceRequirements=[{id:'hold-result',shotId:row.shot.id,actionId:'action-read-result',actorId:'trip-marker',partIds:[],kind:'hold',from:0,until:2,cueId:cue,dependsOn:[],note:'读清已到达的位置'}];
  const fixed=checkedRhythmDraft(raw,p,options);
  assert.deepEqual(fixed.result.explanationBeats[0].entities,['trip-marker']);
  assert.deepEqual(raw.explanationBeats[0].entities,[]);
  raw.performanceRequirements[0].until=1;
  assert.throws(()=>checkedRhythmDraft(raw,p,options),/缺少变化对象/);
});
test('重复动作编号确定性拆分，跨镜因果保留在原有讲解节拍，原返回稿不变',()=>{
  const {p,raw}=repairFixture(),original=structuredClone(raw);
  assert.throws(()=>checkedRhythm(raw,p,options),/eventId 不得重复/);
  const repaired=checkedRhythmDraft(raw,p,options);
  assert.equal(repaired.adjustments.filter(a=>a.type==='event-id').length,2);
  assert.equal(repaired.adjustments.filter(a=>a.type==='cross-shot-dependency').length,1);
  assert.deepEqual(repaired.result.explanationBeats,raw.explanationBeats);
  assert.equal(repaired.result.performanceRequirements.length,4);
  assert.deepEqual(raw,original);
  assert.deepEqual(checkedRhythmDraft(repaired.result,p,options).adjustments,[]);
  assert.deepEqual(checkedRhythmDraft(raw,p,options),repaired);
});
test('只按编号猜测动作时拒绝恢复，明确时间可以解除重复编号的歧义',()=>{
  const {p,raw}=repairFixture();
  raw.performanceRequirements[0].actionId='action-process-0';
  assert.doesNotThrow(()=>checkedRhythmDraft(raw,p,options));
  raw.performanceRequirements[0].until=2;
  assert.throws(()=>checkedRhythmDraft(raw,p,options),/引用不明确/);
});
test('没有已验证跨镜承接时保留依赖并拒绝恢复，不删除时间和因果错误',()=>{
  const {p,raw}=repairFixture();
  raw.explanationBeats[1].dependsOn=[];
  assert.throws(()=>checkedRhythmDraft(raw,p,options),/动作依赖跨越镜头/);
  raw.explanationBeats[1].dependsOn=['process-0'];
  raw.performanceRequirements[2].until=20;
  assert.throws(()=>checkedRhythmDraft(raw,p,options),/动作依赖跨越镜头|无效/);
});
test('编号后缀避开已有动作，不改变无冲突编号',()=>{
  const {p,raw}=repairFixture();
  const line=raw.text.split('\n')[0].replace('0–1','0.5–0.75').replace('eventId=process-0','eventId=process-0-2');
  raw.text+='\n'+line;
  raw.performanceRequirements.push({...raw.performanceRequirements[0],id:'extra',actionId:line,from:.5,until:.75});
  const {result,adjustments}=checkedRhythmDraft(raw,p,options);
  assert.ok(adjustments.some(a=>a.from==='process-0'&&a.to==='process-0-3'));
  assert.match(result.text,/eventId=process-0-2[｜|]/);
});
test('只容许原输入与自动时间轴采用，手改脚本、配音、参考或素材拒绝恢复',()=>{
  const {p}=repairFixture(),j={result:['本地时间轴稿']},next=structuredClone(p);
  next.version++;next.updated='later';next.scienceFlow.rhythm=j.result[0];
  assert.equal(sameRhythmRecoveryInputs(p,next,j),true);
  for(const edit of [q=>q.scienceFlow.rhythm='手写脚本',q=>q.shots[0].zh+='新台词',q=>q.scienceFlow.style='新风格',q=>q.assets[0].src='/new.wav',q=>q.claims[0].verified=false]) {
    const changed=structuredClone(next);edit(changed);
    assert.equal(sameRhythmRecoveryInputs(p,changed,j),false);
  }
});

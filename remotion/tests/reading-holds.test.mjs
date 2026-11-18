import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileReadingHolds} from '../server/reading-holds.mjs';
const fixture=()=>({raw:{explanationBeats:[
  {id:'EB08',shotId:'third',from:4.208333,until:5.958333,intent:'replace',cueIds:['speech-2']},
  {id:'EB09',shotId:'third',from:6.75,until:10.791667,intent:'change',cueIds:['speech-3']}]},context:[{
  shotId:'third',duration:15.208333,actions:[{id:'action-EB08',until:5.958333,action:'保留测距条，将名称替换为伪距，完成后稳定阅读'}],
  speech:[{id:'speech-2',time:4.208333,until:5.958333},{id:'speech-3',time:6.75,until:10.791667}]}]});
test('补入明确写出的静默阅读停留，保持动作和旁白时间且可重复调用',()=>{
  const {raw,context}=fixture(),original=structuredClone(context),next=structuredClone(raw.explanationBeats[1]);
  const adjustments=reconcileReadingHolds(raw,context);
  assert.equal(adjustments.length,1);assert.equal(adjustments[0].beatId,'EB08');
  assert.equal(raw.explanationBeats[0].until,6.75);assert.match(raw.explanationBeats[0].holdReason,/完成后稳定阅读/);
  assert.deepEqual(raw.explanationBeats[1],next);assert.deepEqual(context,original);
  assert.deepEqual(reconcileReadingHolds(raw,context),[]);
});
test('未安排空档、台词重叠、长间隔、动作歧义和不完整声音记录不得自动补齐',()=>{
  for(const edit of [
    ({context})=>context[0].actions[0].action='替换为伪距',
    ({context})=>context[0].speech.push({id:'interruption',time:6,until:6.4}),
    ({raw})=>raw.explanationBeats[1].from=7.25,
    ({raw})=>raw.explanationBeats[0].from=0,
    ({context})=>context[0].actions.push(structuredClone(context[0].actions[0])),
    ({context})=>context[0].actions[0].until=5.5,
    ({context})=>context[0].speech[0].until=null,
    ({raw})=>raw.explanationBeats[0].cueIds=['missing'],
    ({raw})=>raw.explanationBeats.push({id:'other',shotId:'third',from:6,until:6.6}),
  ]) {
    const f=fixture();edit(f);const before=structuredClone(f.raw);
    assert.deepEqual(reconcileReadingHolds(f.raw,f.context),[]);assert.deepEqual(f.raw,before);
  }
});

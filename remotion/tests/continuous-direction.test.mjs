import test from 'node:test';
import assert from 'node:assert/strict';
import {draft,emptyShot,renderIssues,update,qualityFor,quality} from '../shared/model.mjs';
import {continuityIssues,processMediaIssues} from '../shared/continuous-direction.mjs';
import {beatLabels} from '../shared/direction.mjs';
import {filmProps,filmIssues} from '../shared/film.mjs';
import {continuity,processVideo} from './fixtures/continuous.mjs';
test('缺少镜头设计与动画的分镜不能仅凭标题通过检查',()=>{
 const p={...draft('science'),topic:'行星',shots:[{...emptyShot(),title:'总结页'}]};
 const errors=renderIssues(p,p.shots[0].id).join('；');
 assert.match(errors,/起始状态/);assert.match(errors,/观察位置/);assert.match(errors,/连续动画尚未生成/);
 assert.equal(p.burnCaptions,true);assert.equal(draft('product').burnCaptions,true);
 assert.deepEqual(beatLabels(emptyShot(),'science'),['','','']);
 assert.equal(filmProps(p).burnCaptions,true);
});
test('长旁白或分配余量超出实际过程视频时拦截，不能以定格凑时长',()=>{
 const s={...emptyShot(),continuity,processVideoId:'continuous-video',assetIds:['continuous-video'],seconds:4};
 const p={...draft('science'),topic:'行星',assets:[{...processVideo,duration:5}],shots:[s]};
 assert.deepEqual(continuityIssues(s),[]);
 assert.deepEqual(processMediaIssues(p,s,96),[]);
 assert.match(processMediaIssues(p,s,144).join(),/长度不足/);
 s.processOffset=2;assert.match(processMediaIssues(p,s,96).join(),/长度不足/);
});
test('镜头设计变更使旧实看片记录失效，静帧检查不能代替连续导演验收',()=>{
 const p={...draft('science'),topic:'行星',assets:[processVideo],shots:[{...emptyShot(),continuity,processVideoId:processVideo.id,assetIds:[processVideo.id],reviewed:true,motionReview:'v1 00:00–00:06',filmQA:qualityFor({kind:'science'})}]};
 const next=structuredClone(p);next.shots[0].continuity.camera='固定相机不跟随';
 const saved=update(p,next);assert.equal(saved.shots[0].motionReview,'');assert.deepEqual(saved.shots[0].filmQA,[]);
 assert.match(filmIssues(saved,'zh').join(),/时间码记录/);
});

test('旧项目与副本的直接出片不能沿用旧版五项检查豁免连续导演验收', () => {
  const old = {
    ...draft('science'), topic: '月球', script: '', flow: 'direct', pauses: [],
    assets: [processVideo],
    shots: [{ ...emptyShot(), continuity, processVideoId: processVideo.id,
      assetIds: [processVideo.id], reviewed: true, filmQA: [...quality] }],
  };
  for (const p of [old, { ...structuredClone(old), id: 'copy', version: 0, origin: { project: old.id, version: 1 } }]) {
    const issues = filmIssues(p, 'zh').join('；');
    assert.match(issues, /主要画面清楚表达本段内容/);
    assert.match(issues, /状态变化可追踪/);
    assert.match(issues, /时间码记录/);
  }
});

test('导入视频不能自行授予导演验收，编辑保存也不能伪造检查通过', () => {
  const p = { ...draft('science'), topic: '月球', flow: 'direct' };
  const imported = {
    ...p, assets: [processVideo],
    shots: [{ ...emptyShot(), continuity, processVideoId: processVideo.id,
      assetIds: [processVideo.id], reviewed: true, filmQA: qualityFor(p), motionReview: 'v1 00:00–00:06' }],
  };
  const saved = update(p, imported);
  assert.equal(saved.shots[0].reviewed, false);
  assert.deepEqual(saved.shots[0].filmQA, []);
  assert.equal(saved.shots[0].motionReview, '');
  assert.match(filmIssues(saved, 'zh').join(), /时间码记录/);
});

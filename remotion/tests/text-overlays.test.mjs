import test from 'node:test';
import assert from 'node:assert/strict';
import { draft, emptyShot, update, qualityFor } from '../shared/model.mjs';
import { filmProps } from '../shared/film.mjs';
import { overlayIssues,subtitleLines } from '../shared/overlays.mjs';
import { srt } from '../server/film-package.mjs';
import {motionInputs} from '../shared/motion-plan.mjs';

function project() {
  const zh = '开始运动。继续前进。';
  const voice = {id:'voice',kind:'audio',role:'zh',duration:6};
  const shot = {...emptyShot(),zh,en:'Start moving. Keep going.',assetIds:['voice'],
    reviewed:true,filmQA:qualityFor({kind:'science'}),motionReview:'v1 00:00–00:06',
    subtitleTracks:{zh:{assetId:'voice',text:zh,segments:[
      {from:.5,until:2,text:'开始运动。'},{from:3,until:5,text:'继续前进。'},
    ]}},annotations:[{text:'节点',from:1,until:3,x:.5,y:.4}]};
  return {...draft('science'),topic:'字幕验证',target:6,flow:'direct',assets:[voice],shots:[shot]};
}
test('小字幕与独立 SRT 共用精确起止，保留静音间隙，不自动上双语长段落',()=>{
  const p=project(),film=filmProps(p);
  assert.deepEqual(overlayIssues(p,p.shots[0]),[]);
  assert.deepEqual(film.captions.map(c=>[c.from,c.until]),[[12,48],[72,120]]);
  const output=srt(film);
  assert.match(output,/00:00:00,500 --> 00:00:02,000/);
  assert.match(output,/00:00:03,000 --> 00:00:05,000/);
  assert.doesNotMatch(output,/Start moving/);
  assert.equal(p.burnCaptions,true);
});
test('过期配音字幕、重叠时间或占用字幕区域的注释不能通过制作检查',()=>{
  const p=project(),s=p.shots[0];
  s.subtitleTracks.zh.segments[1].from=1;
  assert.match(overlayIssues(p,s).join(),/互不重叠/);
  s.subtitleTracks.zh.text='旧稿';
  assert.match(overlayIssues(p,s).join(),/已变化/);
  s.annotations[0].y=.95;
  assert.match(overlayIssues(p,s).join(),/字幕区上方/);
});
test('修改注释位置或字幕时间会使旧审片记录失效',()=>{
  const p=project();
  for(const kind of ['position','timing']){
    const next=structuredClone(p);
    if(kind==='position')next.shots[0].annotations[0].x=.3;
    else next.shots[0].subtitleTracks.zh.segments[0].from=.8;
    const saved=update(p,next);
    assert.deepEqual(saved.shots[0].filmQA,[]);
    assert.equal(saved.shots[0].motionReview,'');
  }
});

test('精确配音时间轴保留对照译文，双语画面与 SRT 共用起止且保留停顿',()=>{
  const p={...project(),captionMode:'bilingual'},film=filmProps(p),output=srt(film);
  assert.deepEqual(film.captions.map(c=>[c.from,c.until]),[[12,48],[72,120]]);
  assert.deepEqual(subtitleLines(film.captions[0],p.language,p.voice,p.captionMode),['开始运动。','Start moving.']);
  assert.match(output,/开始运动。\nStart moving\./);assert.match(output,/继续前进。\nKeep going\./);
  assert.deepEqual(subtitleLines(film.captions[0],'separate','zh','bilingual'),['开始运动。','Start moving.']);
});

test('英文实测分句与中文句数不同时沿用已有句组，不丢中文或猜造细分译文',()=>{
  const p=project(),s=p.shots[0];p.voice='en';p.captionMode='bilingual';p.assets[0].role='en';
  s.zh='地球不能放到秤上，它的质量如何算出？';s.en="Earth cannot fit on a scale. How do we calculate its mass?";
  s.subtitleTracks={en:{assetId:'voice',text:s.en,segments:[{from:.5,until:2,text:'Earth cannot fit on a scale. '},{from:3,until:5,text:'How do we calculate its mass?'}]}};
  const film=filmProps(p),output=srt(film);
  assert.deepEqual(film.captions.map(c=>c.zh),[s.zh,s.zh]);
  assert.deepEqual(film.captions.map(c=>c.en),s.subtitleTracks.en.segments.map(c=>c.text));
  assert.deepEqual(film.captions.map(c=>[c.from,c.until]),[[12,48],[72,120]]);
  assert.equal(output.split(s.zh).length-1,2);assert.deepEqual(overlayIssues(p,s),[]);
});

test('给精确字幕补译文不会让未改动的动画失效，改动原稿仍会失效',()=>{
  const p=project(),s=p.shots[0],inputs=motionInputs(p,s),legacy=JSON.parse(inputs);
  assert.deepEqual(legacy[7][2][0],{from:12,until:48,lang:'zh',zh:'开始运动。',timing:'精确起止'});
  s.zh='新的原稿。';assert.notEqual(motionInputs(p,s),inputs);
});

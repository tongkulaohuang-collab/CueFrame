import test from 'node:test';
import assert from 'node:assert/strict';
import {displayCaptions,subtitleLayout,subtitleLines} from '../shared/overlays.mjs';
import {motionFixture} from './fixtures/motion.mjs';
import {validateSharedProofs,visualReference,visualContract,inheritVisuals} from '../shared/visual-continuity.mjs';
import {motionAt} from '../shared/motion-plan.mjs';
import {sceneVarietyIssues} from '../shared/scene-design.mjs';
import {srt} from '../server/film-package.mjs';

test('双语短句分页保留原实测区间和间隙，布局始终在画面安全区',()=>{
  const cues=[{from:12,until:180,lang:'en',en:'Measure gravity. Calculate mass.',zh:'测量引力，计算质量。',display:[{text:'Measure gravity.',translation:'测量引力。'},{text:'Calculate mass.',translation:'计算质量。'}]},
    {from:204,until:300,lang:'en',en:'Keep the pause.',zh:'保留停顿。'}];
  const original=structuredClone(cues),split=displayCaptions(cues);
  assert.deepEqual(cues,original);assert.equal(split[0].from,12);assert.equal(split[1].until,180);assert.equal(split[2].from,204);
  for(const [w,h] of [[1920,1080],[1280,720],[1080,1920]])for(const c of split){
    const l=subtitleLayout(subtitleLines(c,'bilingual','en','bilingual'),w,h);
    assert.ok(l.bottom>=h*.06);assert.ok(l.height+l.bottom<h*.3);assert.ok(l.left>0&&l.width+l.left<w);
    assert.ok(l.lines.every(v=>v.text));
  }
  const long=subtitleLayout(['中'.repeat(160),'An unusually long sentence '.repeat(40)],1920,1080);
  assert.ok(long.height+long.bottom<1080*.3);
});
function proofs(){
  const {p,raw}=motionFixture(),a=raw.motion;
  const first={id:'lab',bg:a.bg,subjectId:a.subjectId,nodes:a.nodes.map(({id,paths})=>({id,paths}))};
  const second=structuredClone(first);second.id='space';second.bg='#000000';second.nodes[0].paths[0].d='M0 0L60 0L30 80Z';
  const frames=[.25,1,1.75].map((time,i)=>({sceneId:i===1?'space':'lab',time,caption:'独立场景',camera:{x:320,y:180,zoom:1},poses:a.nodes.map(n=>({id:n.id,...motionAt(n.frames,time)}))}));
  return {p,raw,frames:validateSharedProofs({scenes:[first,second],frames},p,2)};
}
test('三张图可来自不同环境，当前镜只继承自己的图版',()=>{
  const {frames}=proofs();assert.equal(visualReference(frames).scenes.length,2);
  const c=visualContract(frames,.8,.5);assert.equal(c.scene.bg,'#000000');assert.equal(c.anchors.length,1);
  assert.throws(()=>visualContract(frames,0,2),/不同场景/);
});

test('样片与整片导出的 SRT 使用相同分页且不会重复拆分',()=>{
  const cue={from:24,until:240,lang:'en',en:'Measure gravity. Calculate mass.',zh:'测量引力，计算质量。',display:[{text:'Measure gravity.',translation:'测量引力。'},{text:'Calculate mass.',translation:'计算质量。'}]};
  const film={canvas:{fps:24},captions:[cue],language:'bilingual',variant:'en',captionMode:'bilingual'};
  const output=srt(film);
  assert.equal(output,srt({...film,captions:displayCaptions(film.captions)}));
  assert.equal((output.match(/ --> /g)||[]).length,2);
  assert.ok(output.includes('00:00:01,000'));assert.ok(output.includes('00:00:10,000'));
});
test('换环境的切镜不把前镜结束姿态强塞回来，同空间连续接续仍有效',()=>{
  const {raw,frames}=proofs(),reference=visualReference([frames[0]]),previous=structuredClone(raw.motion),next=structuredClone(raw.motion);
  previous.visualLock={key:reference.key};previous.nodes.forEach(n=>n.frames.at(-1).x=600);
  next.sceneDesign={setting:'太空',transition:'cut',environmentIds:['channel'],bridge:'由地面实验切到轨道'};
  const expected=next.nodes.find(n=>n.id===next.subjectId).frames[0].x;
  inheritVisuals(next,null,previous,null,reference);
  assert.equal(next.nodes.find(n=>n.id===next.subjectId).frames[0].x,expected);
  assert.deepEqual(next.visualLock.anchorTimes,[]);
  next.sceneDesign.transition='continuous';inheritVisuals(next,null,previous,null,reference);
  assert.equal(next.nodes.find(n=>n.id===next.subjectId).frames[0].x,600);
});
test('只更改场景名称与相机，不能当作环境已经改变',()=>{
  const {raw}=motionFixture(),a=raw.motion,b=structuredClone(a);
  a.sceneDesign={setting:'实验室',environmentIds:['channel']};b.sceneDesign={setting:'太空',environmentIds:['channel']};
  b.camera[0].zoom=2;
  const p={shots:[{motionPlan:a},{motionPlan:b}]};assert.equal(sceneVarietyIssues(p).length,1);
  b.nodes.find(n=>n.id==='channel').paths[0].d='M0 0L60 0L30 80Z';assert.deepEqual(sceneVarietyIssues(p),[]);
});

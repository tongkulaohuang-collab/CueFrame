import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMusicPCM} from '../server/music-analysis.mjs';
import {musicGain,speechWindows,MIX,voiceMusicFilter} from '../shared/audio-mix.mjs';
import {actionTiming,bindActionCues} from '../shared/action-timing.mjs';
import {validateScienceResult} from '../server/science-ai.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {visualContract,visualReference,inheritVisuals,proofPlan} from '../shared/visual-continuity.mjs';
import {motionAt,motionInputs,motionIssues} from '../shared/motion-plan.mjs';
import {motionFixture} from './fixtures/motion.mjs';

function clicks(times,duration=6){
  const pcm=Buffer.alloc(duration*8000*2);
  for(const t of times)for(let i=0;i<200;i++){
    const sample=Math.round(t*8000)+i;
    if(sample*2+1<pcm.length)pcm.writeInt16LE(Math.round(Math.sin(i*1.7)*20000*Math.exp(-i/50)),sample*2);
  }
  return pcm;
}
test('从实际波形识别起音与稳定节奏；静音、持续音和不规则起音不虚构 BPM',()=>{
  const pulse=analyzeMusicPCM(clicks(Array.from({length:11},(_,i)=>.25+i*.5)));
  assert.equal(pulse.rhythm.tempoBpm,120);
  assert.equal(pulse.rhythm.onsets.length,11);
  pulse.rhythm.onsets.forEach((o,i)=>assert.ok(Math.abs(o.time-(.25+i*.5))<.025));
  assert.equal(analyzeMusicPCM(Buffer.alloc(32000)).rhythm.tempoBpm,null);
  const tone=Buffer.alloc(32000);for(let i=0;i<16000;i++)tone.writeInt16LE(Math.round(Math.sin(i*.3)*8000),i*2);
  assert.equal(analyzeMusicPCM(tone).rhythm.tempoBpm,null);
  assert.equal(analyzeMusicPCM(clicks([.1,.3,.85,1.1,1.9,2.1,3.3,3.5,4.7,5.3])).rhythm.tempoBpm,null);
});
test('配乐在真实语句间恢复，缺失句尾时保守覆盖整条旁白，音乐循环不重置音量时钟',()=>{
  const voice={asset:{role:'zh',duration:5,segments:[{from:.5,until:1.5},{from:3,until:4}]},from:24,frames:120};
  const windows=speechWindows([voice],24);
  assert.deepEqual(windows,[{from:1.5,until:2.5},{from:4,until:5}]);
  assert.ok(Math.abs(musicGain(2,windows,8)-MIX.speech)<1e-9);
  assert.equal(musicGain(3.3,windows,8),MIX.bed);
  assert.ok(musicGain(1.4,windows,8)<MIX.bed);
  assert.equal(musicGain(0,windows,8),0);
  assert.equal(musicGain(8,windows,8),0);
  delete voice.asset.segments[1].until;
  assert.deepEqual(speechWindows([voice],24),[{from:1,until:6}]);
  assert.ok(voiceMusicFilter(windows,8).includes(':eval=frame'));
});
test('持续和弦不产生伪起音；混合节拍仍能识别 120 BPM',()=>{
  const make=withBeat=>{
    const pcm=Buffer.alloc(6*8000*2);
    for(let i=0;i<48000;i++){
      const t=i/8000,beat=t%.5;
      const sample=.10*Math.sin(2*Math.PI*165*t)+.07*Math.sin(2*Math.PI*220*t)+
        (withBeat&&beat<.07?.3*Math.sin(2*Math.PI*850*t)*Math.exp(-beat*60):0);
      pcm.writeInt16LE(Math.round(sample*32767),i*2);
    }
    return analyzeMusicPCM(pcm).rhythm;
  };
  assert.equal(make(false).tempoBpm,null);
  const mixed=make(true);assert.equal(mixed.tempoBpm,120);assert.equal(mixed.onsets.length,12);
});
test('动作时间使用镜内真实时间，循环音乐带入全局位置；估算字幕不可冒充关键词入点',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];p.fps=20;
  p.assets[0].segments=[{text:'测试口播',from:.8,until:1.7}];
  p.scienceFlow.analysis={clipId:'bgm',rhythm:{onsets:[{time:.45,strength:1},{time:1.45,strength:1}]}};
  const timing=actionTiming(p,s.id);
  assert.equal(timing.speech[0].time,.8);
  const sync=bindActionCues(raw.motion,[{nodeId:'particle',frameIndex:1,cueId:timing.speech[0].id,offset:.05,action:'接近入口'}],timing,p.fps);
  assert.equal(raw.motion.nodes[1].frames[1].time,.85);
  assert.equal(sync[0].globalTime,.85);
  assert.throws(()=>bindActionCues(raw.motion,[{nodeId:'particle',frameIndex:1,cueId:'invented-word',offset:0,action:'通过'}],timing,p.fps),/实测声音/);
  p.shots.push({...structuredClone(s),id:'second'});
  const second=actionTiming(p,'second');assert.equal(second.start,2);
  assert.ok(Math.abs(second.music[0].globalTime-2.45)<.001);
  delete p.assets[0].segments;
  const estimated=actionTiming(p,s.id);assert.equal(estimated.speech[0].precision,'音轨起点');assert.ok(estimated.estimated.length);
});

function proofs(p,motion){
  return validateScienceResult({scene:{bg:motion.bg,subjectId:motion.subjectId,nodes:motion.nodes.map(({id,paths})=>({id,paths}))},
    frames:[.25,1,1.75].map(time=>({time,caption:'同一主体持续通过',camera:{x:320,y:180,zoom:1},
      poses:motion.nodes.map(n=>({id:n.id,...motionAt(n.frames,time)}))}))},p,'proofs').map(f=>({...f,constraintMode:'legacy-anchors'}));
}
test('新图版仅作设计参考，不把动画钉在三个离散姿态上',()=>{
 const {p,raw}=motionFixture(),legacy=proofs(p,raw.motion);
 const frames=legacy.map(f=>({...f,constraintMode:'design-guide'}));
 assert.equal(visualContract(frames,0,raw.motion.duration),null);
 const before=structuredClone(raw.motion.nodes),result=inheritVisuals(structuredClone(raw.motion),null,null,null,visualReference(frames));
 assert.deepEqual(result.nodes,before);assert.deepEqual(result.visualLock.anchorTimes,[]);
});
test('三图共用真实对象；动画直接继承路径/颜色/关键姿态，相机与预览来自同一渲染数据',()=>{
  const {p,raw}=motionFixture();p.fps=20;p.scienceFlow.proofs=proofs(p,raw.motion);
  const before=structuredClone(p.scienceFlow.proofs);
  raw.motion.bg='#ffffff';raw.motion.nodes[1].paths[0].fill='#ff0000';raw.motion.nodes[1].frames[1].y=50;
  const plan=validateMotionResult(raw,p,{shotId:p.shots[0].id})[0].motionPlan;
  assert.equal(plan.bg,before[0].scene.bg);
  assert.equal(plan.nodes[1].paths[0].fill,before[0].scene.nodes[1].paths[0].fill);
  for(const f of before){
    const preview=proofPlan(f);
    for(const n of plan.nodes){
      const at=motionAt(n.frames,f.time),expected=preview.nodes.find(v=>v.id===n.id).frames[0];
      for(const k of ['x','y','rotation','scaleX','scaleY','opacity'])assert.equal(at[k],expected[k]);
    }
    assert.equal(motionAt(plan.camera,f.time).zoom,f.scene.camera.zoom);
  }
  assert.deepEqual(p.scienceFlow.proofs,before);
  const missing=structuredClone(raw);missing.motion.nodes[1].id='changed';missing.motion.subjectId='changed';missing.motion.annotations=[];
  missing.motion.cameraShots[0].focusId='changed';
  assert.throws(()=>validateMotionResult(missing,p,{shotId:p.shots[0].id}),/对象与效果图不一致/);
});
test('相邻镜沿用同一主体的边界状态；旧图版仍可使用，非法共享图版被拒绝',()=>{
  const {p,raw}=motionFixture();const frames=proofs(p,raw.motion);
  const contract=visualContract(frames,2,2),reference=visualReference(frames);
  assert.equal(contract,null);
  const previous=structuredClone(raw.motion);previous.visualLock={version:1,key:reference.key};
  const next=inheritVisuals(structuredClone(raw.motion),contract,previous,null,reference);
  assert.equal(next.nodes[1].frames[0].x,previous.nodes[1].frames.at(-1).x);
  assert.equal(visualContract([{time:0,paths:[]}],0,2),null);
  frames[1].scene.nodes[1].paths[0].fill='#ffffff';
  assert.throws(()=>visualContract(frames,0,2),/主体设计不一致/);
});
test('前段长度和真实语音时间戳变化后，旧动作同步不能继续冒充当前结果',()=>{
  const {p,raw}=motionFixture();p.shots.unshift({...structuredClone(p.shots[0]),id:'previous'});
  const s=p.shots[1],plan=structuredClone(raw.motion);plan.inputs=motionInputs(p,s);
  assert.deepEqual(motionIssues(plan,p,24,s),[]);
  p.shots[0].seconds+=1;assert.match(motionIssues(plan,p,24,s).join(),/重新生成/);
  p.shots[0].seconds-=1;p.assets[0].segments=[{text:s.zh,from:.25,until:1.8}];
  assert.match(motionIssues(plan,p,24,s).join(),/重新生成/);
});

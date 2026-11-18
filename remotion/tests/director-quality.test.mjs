import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFixture} from './fixtures/motion.mjs';
import {motionAt,validateMotion,motionIssues} from '../shared/motion-plan.mjs';
import {actionRequirements,designReport,validateDesignEvidence,needsMotionDesignUpdate,observePlayback,playbackComplete,directorReviewIssues,DIRECTOR_REVIEW_VERSION,designInputKey} from '../shared/director-quality.mjs';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {sceneProps} from '../shared/scene-props.mjs';

test('动作支持加减速、曲线、回弹与停留，原线性计划不变',()=>{
  const {raw}=motionFixture(),frames=structuredClone(raw.motion.nodes[1].frames.slice(0,2));
  const linear=motionAt(frames,.4);assert.equal(linear.x,170);
  frames[1].easing='ease-in';assert.equal(motionAt(frames,.4).x,125);
  frames[1].easing='ease-out';assert.equal(motionAt(frames,.4).x,237.5);
  frames[1].easing='hold';assert.equal(motionAt(frames,.7).x,80);assert.equal(motionAt(frames,.8).x,260);
  frames[1].easing='linear';frames[1].curve={x1:80,y1:20,x2:260,y2:20};
  assert.equal(motionAt(frames,.4).y,60);assert.equal(motionAt(frames,.8).y,180);
  delete frames[1].curve;frames[1].easing='back-out';frames[0].opacity=0;frames[1].draw=1;frames[0].draw=0;
  assert.ok(motionAt(frames,.6).x>260);assert.equal(motionAt(frames,.6).opacity,1);assert.equal(motionAt(frames,.6).draw,1);
});

test('非法动态参数、任意素材地址和多行长文字均拒绝',()=>{
  for(const change of [m=>m.nodes[1].frames[1].easing='code()',m=>m.nodes[1].frames[1].draw=2,
    m=>m.nodes[1].frames[1].curve={x1:NaN,y1:0,x2:0,y2:0},
    m=>m.nodes[1].media={assetId:'https://evil/image.png',width:100,height:100,fit:'cover'},
    m=>m.nodes[1].text={value:'不能\n整段堆字',size:30,font:'sans',weight:700,color:'#fff'}]) {
    const m=motionFixture().raw.motion;change(m);assert.throws(()=>validateMotion(m));
  }
});

test('已确认本地图片可进入场景和可移植素材集合，缺失或未知来源阻止渲染',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];s.motionPlan=raw.motion;
  s.motionPlan.nodes[0].media={assetId:'paper',width:120,height:90,fit:'cover'};
  const a={id:'paper',kind:'image',src:'/media/paper.png',confirmed:true,source:'原创',license:'本项目自制'};
  p.assets.push(a);assert.equal(motionImageAsset(p,'paper'),a);
  assert.ok(sceneProps(p,s.id).assets.some(v=>v.id==='paper'));
  assert.deepEqual(motionIssues(raw.motion,p,24,s),[]);
  a.confirmed=false;assert.match(motionIssues(raw.motion,p,24,s).join(''),/来源/);
  a.confirmed=true;a.src='https://example.com/paper.png';assert.equal(motionImageAsset(p,'paper'),null);
});

test('脚本动作要求独立于模型输出，漏掉动作与引用装饰均拦截',()=>{
  const {p,raw}=motionFixture(),id=p.shots[0].id;
  const r=actionRequirements(p,id);assert.equal(r.length,1);assert.equal(r[0].technique,'motion');
  const plan=validateMotionResult(raw,p,{shotId:id})[0].motionPlan;p.shots[0].motionPlan=plan;
  assert.deepEqual(designReport(p,id).issues,[]);assert.equal(needsMotionDesignUpdate(p,id),false);
  plan.actionEvidence=[];assert.match(designReport(p,id).issues.join(''),/没有实现记录/);
  plan.actionEvidence=raw.motion.actionEvidence;plan.nodes[1].role='decoration';
  assert.match(designReport(p,id).issues.join(''),/装饰/);
});
test('短暂交接允许延续可读停留，从未显现或刚刚飞入的对象仍会被拒绝',()=>{
  const {p,raw}=motionFixture(),id=p.shots[0].id,plan=raw.motion;
  p.scienceFlow.rhythm+='\n• 1.5–1.625｜cueId=design｜对象=通道｜动作=交接前保持｜形式=hold';
  const hold=actionRequirements(p,id).at(-1);
  plan.actionEvidence.push({requirementId:hold.id,nodeIds:['channel'],technique:'hold',from:1.5,until:1.625,note:'保持既有通道位置'});
  assert.doesNotThrow(()=>validateDesignEvidence(plan,p,id));
  const channel=plan.nodes.find(n=>n.id==='channel');
  channel.frames=[{...channel.frames[0],x:-500},{...channel.frames[0],time:1.5,x:320},{...channel.frames.at(-1)}];
  assert.throws(()=>validateDesignEvidence(plan,p,id),/脚本动作/);
  channel.frames.forEach(f=>f.opacity=0);
  assert.throws(()=>validateDesignEvidence(plan,p,id),/脚本动作/);
});

test('仅改动作说明、隐藏运动或静止主体不能冒充关键动作',()=>{
  for(const edit of [m=>m.nodes[1].frames.forEach(f=>{f.x=100;f.y=100;}),
    m=>m.nodes[1].frames.forEach(f=>f.y=-2000),m=>m.nodes[1].frames.forEach(f=>f.opacity=0),
    m=>m.nodes[1].paths.forEach(v=>{v.stroke='none';v.fill='none';}),
    m=>m.actionEvidence[0].from=1.8]) {
    const {p,raw}=motionFixture();edit(raw.motion);
    assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),/脚本动作/);
  }
});

test('描线必须有实际描线进度，不能由平移或一条静线替代',()=>{
  const {p,raw}=motionFixture();p.scienceFlow.rhythm='• 0.8｜cueId=design｜对象=标尺｜动作=连接测量线｜形式=draw';
  raw.motion.actionEvidence=[{requirementId:actionRequirements(p,p.shots[0].id)[0].id,nodeIds:['channel'],from:0,until:2,technique:'draw',note:'逐步连接标尺'}];
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),/相应的可见/);
  raw.motion.nodes[0].frames[0].draw=0;raw.motion.nodes[0].frames[1].draw=1;
  assert.doesNotThrow(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id));
});

test('蒙太奇不能仅用配色装饰过关，必须有内容构图和可见拼贴',()=>{
  const {p,raw}=motionFixture();p.scienceFlow.lemoStyleId='kino-montage';raw.motion.styleId='kino-montage';
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),/斜向构图/);
  raw.motion.nodes[0].frames.forEach(f=>f.rotation=-4);
  assert.doesNotThrow(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id));
  raw.motion.styleEvidence.find(e=>e.aspect==='material').nodeIds=['particle'];
  assert.throws(()=>validateDesignEvidence(raw.motion,p,p.shots[0].id),/多层拼贴/);
});

test('脚本或所选风格改变后，旧动作验收立即失效',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];s.motionPlan=validateMotionResult(raw,p,{shotId:s.id})[0].motionPlan;
  p.scienceFlow.rhythm+='\n• 1.5｜cueId=design｜对象=粒子｜动作=离开后停留｜形式=hold';
  assert.equal(needsMotionDesignUpdate(p,s.id),true);assert.match(designReport(p,s.id).issues.join(''),/没有实现记录/);
});

test('只有连续正常速度播放能积累看片范围，跳转、倍速和卡顿不冒充观看',()=>{
  let state;const sample=(time,wall,extra={})=>({time,wall,playing:true,seeking:false,rate:1,...extra});
  for(let i=0;i<=8;i++)state=observePlayback(state,sample(i*.25,i*250));
  assert.equal(playbackComplete(state.ranges,2),true);
  let jumped=observePlayback(null,sample(0,0));jumped=observePlayback(jumped,sample(1.8,250));
  assert.equal(playbackComplete(jumped.ranges,2),false);
  let sped;for(let i=0;i<=8;i++)sped=observePlayback(sped,sample(i*.25,i*250,{rate:2}));
  assert.equal(playbackComplete(sped.ranges,2),false);
  assert.equal(playbackComplete([[0,1],[1.5,2]],2),false);assert.equal(playbackComplete([[0,999]],2),false);
});

test('看完不能自动通过导演验收，必须确认每项动作、风格和字幕',()=>{
  const {p,raw}=motionFixture(),s=p.shots[0];s.motionPlan=validateMotionResult(raw,p,{shotId:s.id})[0].motionPlan;
  const review={decision:'approved',directorVersion:DIRECTOR_REVIEW_VERSION,designInputs:designInputKey(p,s.id),watched:[[0,2]],
    actions:actionRequirements(p,s.id).map(a=>a.id),audioChecked:true,styleChecked:true,captionsChecked:true};
  assert.deepEqual(directorReviewIssues(p,s.id,review,2),[]);
  assert.match(directorReviewIssues(p,s.id,{...review,audioChecked:false},2).join(''),/实际听完/);
  assert.match(directorReviewIssues(p,s.id,{...review,directorVersion:1},2).join(''),/尚未通过/);
  review.actions=[];assert.match(directorReviewIssues(p,s.id,review,2).join(''),/逐项确认/);
});

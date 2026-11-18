import {draft,emptyShot,emptyClaim} from '../../shared/model.mjs';
import {actionRequirements} from '../../shared/director-quality.mjs';
import {timeline} from '../../shared/model.mjs';
import {actionTiming} from '../../shared/action-timing.mjs';
import {referenceScriptKey} from '../../shared/reference-motion.mjs';
export const explanationFixture=p=>timeline(p).rows.map((r,i)=>({id:'process-'+i,shotId:r.shot.id,from:0,until:r.frames/p.fps,
 cueIds:actionTiming(p,r.shot.id,p.voice,r).speech.map(c=>c.id),intent:'change',entities:['粒子'],before:'粒子位于通道左侧',after:'同一粒子穿过通道到右侧',dependsOn:[],holdReason:''}));
export function explanationScriptFixture(p) {
  p.scienceFlow.referenceScript={...p.scienceFlow.referenceScript,explanationVersion:1,explanationBeats:explanationFixture(p),inputs:referenceScriptKey(p),text:p.scienceFlow.rhythm};
  return p;
}
export function performanceRequirementsFixture(p,text=p.scienceFlow.rhythm) {
  const withScript={...p,scienceFlow:{...p.scienceFlow,rhythm:text}};
  return timeline(p).rows.flatMap(row=>actionRequirements(withScript,row.shot.id,row).map((r,i)=>({id:'performance-'+row.shot.id+'-'+i,
    shotId:row.shot.id,actionId:r.id,kind:'rigid',actorId:'particle-actor',partIds:[],cueId:actionTiming(p,row.shot.id,p.voice,row).speech[0].id,
    from:0,until:row.frames/p.fps,dependsOn:[],note:'刚性粒子沿通道持续运动，句级实际语音'})));
}
export function motionFixture({presentation=false,explanation=presentation,performance=presentation}={}) {
  const p={...draft('science'),title:'单语样镜制作 · 界面测试',topic:'同一粒子通过通道',width:640,height:360,fps:12};
  const voice={id:'voice',kind:'audio',role:'zh',name:'测试配音',src:'/media/voice.wav',duration:2,confirmed:true,source:'自制测试波形',license:'测试用途'};
  const bgm={...voice,id:'bgm',role:'music',name:'测试音乐',src:'/media/bgm.wav'};
  p.assets=[voice,bgm];
  p.claims=[{...emptyClaim(),revision:1,verified:true,text:'测试素材中的粒子通过通道',title:'测试依据',url:'https://example.edu/test',locator:'图 1'}];
  p.shots=[{...emptyShot(),title:'口播 1',zh:'测试口播',en:'',assetIds:['voice'],seconds:2}];
  p.scienceFlow={style:'青蓝色粒子',template:'连续近景',rhythm:'0–1 s 接近通道；1–2 s 通过并离开。\n• 0.8｜cueId=design｜对象=粒子｜动作=通过通道｜形式=motion',bgmId:bgm.id,analysis:{clipId:bgm.id,marks:[]},scriptVersion:1,proofVersion:1,proofs:[{},{},{}]};
  const frame=(time,x,y)=>({time,x,y,rotation:0,scaleX:1,scaleY:1,opacity:1});
  const raw={title:'粒子通过通道',purpose:'观察完整运动路径',visual:'同一粒子从左侧接近通道、穿过并继续向右离开；短注释标明穿过时刻。',
    continuity:{subject:'同一青蓝色粒子',path:'从左侧80经过通道320到右侧550',camera:'固定近景看清通道两侧及完整轨迹',handoff:'共享通道世界坐标；首尾运动持续'},claimIds:[p.claims[0].id],
    motion:{width:640,height:360,duration:2,bg:'#07111f',subjectId:'particle',
      nodes:[{id:'channel',paths:[{d:'M -12 -180 L 12 -180 L 12 -35 L -12 -35 Z M -12 35 L 12 35 L 12 180 L -12 180 Z',fill:'#306b7a',stroke:'#74bcc9',strokeWidth:2}],frames:[frame(0,320,180),frame(2,320,180)]},
        {id:'particle',paths:[{d:'M -15 0 A 15 15 0 1 0 15 0 A 15 15 0 1 0 -15 0 Z',fill:'#7deded',stroke:'#d7ffff',strokeWidth:2}],frames:[frame(0,80,180),frame(.8,260,180),frame(1.2,350,180),frame(2,550,180)]}],
      camera:[{time:0,x:320,y:180,zoom:1},{time:2,x:320,y:180,zoom:1}],
      cameraShots:[{from:0,until:2,framing:'wide',focusId:'particle',transition:'move',reason:'短镜展示粒子经过通道的完整过程'}],
      annotations:[{nodeId:'particle',text:'通过通道',from:.8,until:1.5,x:0,y:-48}]}};
  raw.motion.nodes[0].role='mechanism';raw.motion.nodes[1].role='subject';
  raw.motion.actionEvidence=actionRequirements(p,p.shots[0].id).map(r=>({requirementId:r.id,nodeIds:['particle'],from:.4,until:1.5,technique:'motion',note:'粒子沿原方向穿过通道并离开'}));
  raw.motion.styleId='custom';
  if(presentation){
    raw.motion.layout={version:1,connectors:[]};
    raw.motion.presentation={version:1,texts:[],beats:[{from:0,until:2,primaryIds:['particle'],supportIds:['channel'],reason:'跟随同一粒子穿过通道'}]};
  }
  raw.motion.styleEvidence=['composition','material','rhythm'].map(aspect=>({aspect,nodeIds:['channel','particle'],from:0,until:2,description:'青蓝色粒子与通道轮廓形成清楚层次，运动轨迹贯穿画面'}));
  if(explanation){
    explanationScriptFixture(p);
    raw.motion.explanationEvidence=[{beatId:'process-0',resultAt:2,changes:[{entity:'粒子',nodeId:'particle',property:'x',from:80,to:550}]}];
  }
  if(performance) {
    const requirements=performanceRequirementsFixture(p);
    p.scienceFlow.referenceScript={...p.scienceFlow.referenceScript,performanceVersion:1,performanceRequirements:requirements};
    raw.motion.nodes[1].rig={actorId:'particle-actor',partId:'particle',parentId:null,pivot:{x:0,y:0}};
    raw.motion.actors=[{id:'particle-actor',designId:'particle-design',version:1,rootId:'particle',contentType:'object',capability:'rigid',
      style:{silhouette:'圆',proportions:'半径15',material:'平面',light:'无',palette:'青',stroke:'2px',perspective:'正视'},parts:[{id:'particle',nodeId:'particle',replaceable:true}]}];
    raw.motion.performance={version:1,events:requirements.map(r=>({requirementId:r.id,from:0,at:1,until:2,rootId:'particle',partIds:[],contacts:[],supports:[],coverage:[{nodeId:'particle',x:-10,y:-10,width:20,height:20,minPixels:8}]}))};
    raw.motion.cameraShots[0].eventIds=requirements.map(r=>r.id);
  }
  return {p,raw};
}

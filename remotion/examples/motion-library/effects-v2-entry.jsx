import React from 'react';
import {Composition,registerRoot,Sequence,AbsoluteFill} from 'remotion';
import {ShotScene} from '../../video/Scene';
import {templatePlan} from '../../shared/library-compiler.mjs';
import {compileAutoMotion} from '../../server/auto-motion.mjs';
import {defaultParams} from '../../shared/motion-library.mjs';
const durations=[6,6,4,4,4],starts=[0,6,12,16,20];
const pick=(effectId,targets,params)=>({effectId,targets,params:{...defaultParams(effectId),...params},reason:'验收新增动效的实际画面'});
function scene(i){
 const duration=durations[i],offset=starts[i];
 const p=templatePlan('mechanism',{...defaultParams('mechanism'),bg:i?'#21162f':'#101e2a'},{duration});
 const subject=p.nodes.find(n=>n.id==='subject');
 subject.frames=Array.from({length:duration*24+1},(_,j)=>({time:j/24,x:480-250*Math.cos((offset+j/24)*Math.PI/6),y:330,rotation:0,scaleX:1,scaleY:1,opacity:1}));
 const label=p.nodes.find(n=>n.id==='label');
 p.nodes=p.nodes.filter(n=>n.id==='subject');p.annotations=[];
 const add=(id,value,y)=>{const n=structuredClone(label);n.id=id;n.text.value=value;n.text.size=40;n.frames.forEach(f=>{f.x=480;f.y=y;});p.nodes.push(n);};
 let selections=[];
 if(i===0){add('type','文字逐字出现',92);add('rise','文字上浮入场',160);add('color','让颜色随时间流动',228);selections=[pick('typewriter',['type'],{from:.15,until:3.2}),pick('text-rise',['rise'],{from:.5,until:2.5}),pick('text-gradient',['color'],{from:0,until:6,colorA:'#72ffce',colorB:'#e588ff'})];}
 else if(i===1){add('caption','柔边渐变转场',135);selections=[pick('gradient',[],{duration:2.8,softness:25,direction:'left'})];}
 else{const mode=['burst','orbit','flow'][i-2];add('caption',['粒子发散','粒子环绕','粒子流动'][i-2],110);selections=[pick('particles',['subject'],{from:0,until:4,mode,count:90,radius:33,size:4,color:i===3?'#d8aaff':'#76dfc4'})];}
 if(i===0)for(const n of p.nodes.filter(n=>n.text)){const pose=n.frames[0];n.frames=[{...pose,time:0},{...pose,time:4.6},{...pose,time:5.5,opacity:0},{...pose,time:6,opacity:0}];}
 const result=compileAutoMotion(p,selections);
 return {kind:'product',shot:{id:'v2-'+i,motionPlan:result.plan,libraryTransition:result.transition,annotations:[]},canvas:{width:960,height:540,fps:24,frames:duration*24},silent:true,burnCaptions:false,assets:[]};
}
const scenes=durations.map((_,i)=>scene(i));
function Preview(){return <AbsoluteFill>{scenes.map((props,i)=><Sequence key={i} from={starts[i]*24} durationInFrames={durations[i]*24}><ShotScene {...props} previousScene={i?scenes[i-1]:undefined}/></Sequence>)}</AbsoluteFill>;}
registerRoot(()=> <Composition id="MotionEffectsV2" component={Preview} width={960} height={540} fps={24} durationInFrames={576}/>);

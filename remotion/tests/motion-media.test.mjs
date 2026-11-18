import test from 'node:test';
import assert from 'node:assert/strict';
import {motionImageAsset,motionMediaFrame} from '../shared/motion-dynamics.mjs';
import {validateMotion,motionInputs} from '../shared/motion-plan.mjs';
import {motionFixture} from './fixtures/motion.mjs';
import {sceneProps} from '../shared/scene-props.mjs';

test('视频图版只接受已核来源的本地视频、有效时长和本地海报',()=>{
 const a={id:'epic',kind:'video',src:'/media/abcd.mp4',poster:'/media/abcd.png',duration:6,confirmed:true,source:'NASA EPIC',license:'NASA media guidelines'};
 const p={assets:[a]};assert.equal(motionImageAsset(p,'epic'),a);
 for(const patch of [{confirmed:false},{duration:0},{duration:Infinity},{poster:'https://example.com/frame.png'},{src:'/media/../../private.mp4'},{src:'https://example.com/movie.mp4'},{license:''}])assert.equal(motionImageAsset({assets:[{...a,...patch}]},'epic'),null);
 assert.equal(motionImageAsset({assets:[{...a,src:'media/abcd.mp4',poster:'media/abcd.png'}]},'epic').id,'epic');
});

test('时序影像帧随场景时间推进并循环，切镜不会跳出素材末帧',()=>{
 const a={duration:6};assert.equal(motionMediaFrame({},a,0,24),0);assert.equal(motionMediaFrame({},a,5.99,24),143);
 assert.equal(motionMediaFrame({},a,6,24),0);assert.equal(motionMediaFrame({offset:1.5},a,6.5,24),48);
});

test('图版支持合法裁切并随场景打包；海报变化使缓存失效',()=>{
 const {p,raw}=motionFixture(),s=p.shots[0];s.motionPlan=raw.motion;
 const a={id:'epic',kind:'video',src:'/media/abcd.mp4',poster:'/media/abcd.png',duration:6,confirmed:true,source:'NASA EPIC',license:'NASA media guidelines'};p.assets.push(a);
 s.motionPlan.nodes[1].media={assetId:'epic',width:150,height:150,fit:'cover',mask:'slant',print:true,offset:1};
 assert.doesNotThrow(()=>validateMotion(s.motionPlan));assert.ok(sceneProps(p,s.id).assets.some(x=>x.id==='epic'));
 const key=motionInputs(p,s);a.poster='/media/efab.png';assert.notEqual(motionInputs(p,s),key);
 for(const patch of [{mask:'url(external)'},{offset:-1},{print:'yes'}]){const c=structuredClone(s.motionPlan);Object.assign(c.nodes[1].media,patch);assert.throws(()=>validateMotion(c));}
});

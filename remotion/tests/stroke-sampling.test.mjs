import test from 'node:test';
import assert from 'node:assert/strict';
import {sampledStrokeHitsBox} from '../video/stroke-sampling.mjs';

test('分离角标之间没有绘制的空间不产生穿字误报',()=>{
  const a={x:159,y:120},b={x:1761,y:120},label={x:420,y:110,width:240,height:28};
  assert.equal(sampledStrokeHitsBox(a,b,a,b,2,label),false);
});
test('连续线条穿字仍被拒绝，曲线弦长小于弧长仍检查',()=>{
  const a={x:500,y:150},b={x:502,y:150},label={x:500.9,y:149,width:.2,height:2};
  assert.equal(sampledStrokeHitsBox(a,b,a,b,2,label),true);
  assert.equal(sampledStrokeHitsBox(a,b,a,b,3,label),true);
});
test('分离子路径的真实端点仍检查文字碰撞',()=>{
  const a={x:159,y:120},b={x:1761,y:120};
  assert.equal(sampledStrokeHitsBox(a,b,a,b,2,{x:158,y:119,width:4,height:3}),true);
  assert.equal(sampledStrokeHitsBox(a,b,a,b,2,{x:1760,y:119,width:4,height:3}),true);
});
test('非等比缩放不把真实屏幕线段误认为路径跳跃',()=>{
  const a={x:0,y:0},b={x:100,y:0};
  assert.equal(sampledStrokeHitsBox(a,b,{x:0,y:0},{x:1,y:0},1,{x:40,y:-1,width:20,height:2}),true);
});

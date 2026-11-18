import test from 'node:test';
import assert from 'node:assert/strict';
import {pathGeometryBounds,morphGeometryBounds,coverageBoundsIssue} from '../shared/coverage-geometry.mjs';
import {coverageIssues,eventTimes} from '../shared/performance-plan.mjs';
import {issueHelp} from '../shared/issue-help.mjs';
import {coversStrokeOutsideBounds,isStationaryBoard,quietGridPaint,quietScenery,readableOnPaint} from '../video/painted-geometry.mjs';

const state=time=>({time,x:100,y:100,rotation:0,scaleX:1,scaleY:1,opacity:1});
function fixture(rest=10) {
  const from=`M0 0L116 0 M10 -${rest}L10 ${rest}`,to='M0 0L116 0 M10 -20L10 20';
  const node={id:'lower',role:'mechanism',paths:[{d:from,fill:'none',stroke:'#ffffff',strokeWidth:4}],frames:[state(0),state(2)],
    graphics:{version:1,tracks:[],morphs:[{pathIndex:0,from,to,frames:[{time:0,value:0,easing:'linear'},{time:1,value:1,easing:'linear'},{time:2,value:0,easing:'linear'}]}]}};
  const plan={width:640,height:360,duration:2,nodes:[node],camera:[{time:0,x:320,y:180,zoom:1.1},{time:2,x:320,y:180,zoom:1.1}]};
  return {node,plan,event:{from:0,until:2,coverage:[{nodeId:'lower',x:0,y:-20,width:116,height:40,minPixels:30}]}};
}
test('线段、相对坐标、闭合和曲线使用真实极值而不是控制点范围',()=>{
  assert.deepEqual(pathGeometryBounds('M5 5l10 0 0 10z'),{x:5,y:5,width:10,height:10});
  assert.deepEqual(pathGeometryBounds('M0 0Q50 100 100 0'),{x:0,y:0,width:100,height:50});
  assert.deepEqual(pathGeometryBounds('M0 0C0 100 100 100 100 0'),{x:0,y:0,width:100,height:75});
  assert.equal(pathGeometryBounds('M0 0 A10 10 0 0 0 20 0'),null);
  assert.equal(pathGeometryBounds('M0 0C2 3'),null);
  assert.equal(pathGeometryBounds('M1e 0L20 10'),null);
});
test('峰值观察框在起始、中间和恢复帧均提前拒绝，不能只检查峰值',()=>{
  const {plan,event,node}=fixture();assert.deepEqual(morphGeometryBounds(node,0,plan),{x:0,y:-10,width:116,height:20});
  assert.equal(coverageIssues(plan,event,1).length,0);
  for(const time of [0,.25,1.5,1.95,2])assert.match(coverageIssues(plan,event,time).join(),/观察区域超出实际渲染图形/);
});
test('真实图形增至可读尺寸、观察框取共同范围后，逐帧与半帧通过且原门槛保留',()=>{
  const {plan,event}=fixture(15);event.coverage[0].y=-15;event.coverage[0].height=30;
  for(const time of eventTimes(0,2,48))assert.deepEqual(coverageIssues(plan,event,time),[]);
  const tooSmall=fixture();tooSmall.event.coverage[0].y=-10;tooSmall.event.coverage[0].height=20;
  assert.match(coverageIssues(tooSmall.plan,tooSmall.event,0).join(),/小于动作要求的可读尺寸/);
});
test('局部框和浏览器实测共享判断，文字/媒体仍交浏览器测量；提示正确指向形变',()=>{
  const {plan,event,node}=fixture();const box=morphGeometryBounds(node,0,plan);
  assert.match(coverageBoundsIssue(event.coverage[0],box),/观察区域超出/);
  node.text={value:'保留实际字形测量'};assert.equal(morphGeometryBounds(node,0,plan),null);
  assert.equal(issueHelp('排版检查 11.500 秒：lower_1 观察区域超出实际渲染图形').title,'动画部件与观察区域不匹配');
});
test('细长描边的观察框必须落在真实墨迹内；宽度不能补足落在空白中的角点',()=>{
  const box={x:0,y:0,width:1240,height:0},target={x:6,y:-4,width:16,height:8};
  const ink=p=>p.x>=0&&p.x<=1240&&Math.abs(p.y)<=5;
  assert.ok(coversStrokeOutsideBounds(target,box,ink));
  assert.equal(coversStrokeOutsideBounds({...target,y:-9},box,ink),false);
});
test('低对比文字、重点部件与前景仍须检查遮挡，低调背景可承托清晰文字',()=>{
  const plan={subjectId:'marker',sceneDesign:{environmentIds:['grid','marker']},presentation:{beats:[{from:0,until:3,primaryIds:['marker'],supportIds:[]}]}};
  const grid={id:'grid',role:'material'};
  assert.ok(quietScenery(plan,grid,1,.16));
  assert.equal(quietScenery(plan,{...grid,id:'marker'},1,.16),false);
  assert.equal(quietScenery(plan,grid,1,.8),false);
  assert.ok(readableOnPaint('rgb(243, 244, 236)','rgb(21, 34, 26)'));
  assert.equal(readableOnPaint('rgb(33, 42, 36)','rgb(21, 34, 26)'),false);
  assert.equal(readableOnPaint('url(#gradient)','rgb(21, 34, 26)'),false);
});
test('固定计算板可以作为标签底色，计数格和高对比刻线仍是前景',()=>{
  const node={id:'board',rig:{parentId:null},frames:[state(0),state(1)]};
  const plan={subjectId:'board',sceneDesign:{environmentIds:['board']},performance:{events:[{partIds:['cell'],coverage:[{nodeId:'cell'}]}]}};
  assert.equal(isStationaryBoard(plan,node),true);
  assert.equal(isStationaryBoard(plan,{...node,frames:[state(0),{...state(1),scaleX:2}]}),false);
  assert.equal(isStationaryBoard({...plan,actionEvidence:[{nodeIds:['board']}]},node),false);
  assert.equal(quietGridPaint('rgb(29, 48, 36)','rgb(21, 34, 26)'),true);
  assert.equal(quietGridPaint('#ffff55','#15221a'),false);
  assert.equal(readableOnPaint('rgb(230, 240, 230)','#15221a'),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pathGeometryBounds} from '../shared/coverage-geometry.mjs';
test('H/V 及重复参数与等价 L 路径具有相同实际边界',()=>{
 assert.deepEqual(pathGeometryBounds('M100 100H500 600V200 300h-50-50v-25-25'),
  pathGeometryBounds('M100 100L500 100L600 100L600 200L600 300L550 300L500 300L500 275L500 250'));
 assert.deepEqual(pathGeometryBounds('M80 80h40v40h-40z'),{x:80,y:80,width:40,height:40});
});
test('相对移笔分隔的实际肌丝笔画不退回画外坐标原点',()=>{
 const d='M450 410h24m36 0h24 M950 410h20 M1057.331 410h20';
 assert.deepEqual(pathGeometryBounds(d),pathGeometryBounds('M450 410L474 410 M510 410L534 410 M950 410L970 410 M1057.331 410L1077.331 410'));
 assert.equal(pathGeometryBounds(d).x,450);assert.equal(pathGeometryBounds(d).y,410);
});

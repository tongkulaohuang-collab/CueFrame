import test from 'node:test';
import assert from 'node:assert/strict';
import {exportNotice,exportStatus} from '../ui/export-status.mjs';

test('同版本旧成片不影响新导出的排队、渲染与完成提示',()=>{
  const submission={scope:'film',ids:['new']};
  const older={id:'old',status:'done'};
  const current={id:'new',status:'queued'};
  for(const [patch,expected] of [
    [{},'排队中'],
    [{status:'running',step:'关键帧与画面渲染',progress:0},'渲染中 · 关键帧与画面渲染 · 0%'],
    [{status:'running',progress:7},'渲染中 · 70%'],
    [{status:'done',step:'独立工程与交付包',progress:10},'已完成'],
  ]) {
    const job={...current,...patch};
    assert.equal(exportStatus(job),expected);
    assert.equal(exportNotice(submission,[older,job]),'整片导出 · '+expected);
  }
});

test('双语导出分别显示每项任务的状态',()=>{
  const tasks=[{id:'b',variant:'en',status:'failed'},{id:'a',variant:'zh',status:'done'}];
  assert.equal(exportNotice({scope:'film',ids:['a','b']},tasks),'整片导出 · ZH 已完成 / EN 导出失败');
});

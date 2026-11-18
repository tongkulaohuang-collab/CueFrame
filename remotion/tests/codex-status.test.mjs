import test from 'node:test';
import assert from 'node:assert/strict';
import {codexTimeout,codexExitMessage,proofJobStatus} from '../shared/codex-status.mjs';
test('三图使用独立等待上限；超时与异常退出有明确且不夹带提示词的原因',()=>{
  assert.equal(codexTimeout('proofs'),600000);assert.equal(codexTimeout('narration'),240000);
  assert.match(codexExitMessage({timedOut:true,limitMs:600000,exitCode:null}),/10 分钟/);
  assert.match(codexExitMessage({timedOut:false,exitCode:1}),/退出码 1/);
  assert.match(codexExitMessage({timedOut:false,signal:'SIGTERM'}),/信号 SIGTERM/);
});
test('旧 unknown 不虚构超时原因，失败/生成/旧版本各自显示真实状态',()=>{
  const old=proofJobStatus({status:'unknown',error:'Codex 未返回结果。整段脚本……'},5);
  assert.equal(old.label,'生成已中断');assert.match(old.message,/旧记录未区分/);assert.ok(!old.message.includes('整段脚本'));
  assert.equal(proofJobStatus({status:'running'},5).label,'正在生成');
  assert.equal(proofJobStatus({status:'failed',error:'连接失败'},5).message,'连接失败');
  assert.equal(proofJobStatus({status:'ready',version:4},5).label,'旧版结果');
  assert.equal(proofJobStatus({status:'ready',version:5},5).label,'等待写入');
  assert.equal(proofJobStatus({status:'reconciled'},5).label,'上次生成未完成');
  const timed=proofJobStatus({status:'unknown',execution:{finishedAt:'now',timedOut:true,limitMs:600000}},5);
  assert.match(timed.message,/超过本次 10 分钟/);
});

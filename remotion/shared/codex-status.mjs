export function codexTimeout(task) {
  if (task === 'rhythm') return null;
  return ['proofs','material-image','material-animation','motion','reference-motion-item','storyboard'].includes(task) ? 600000 : 240000;
}
export function codexExitMessage({timedOut,limitMs,exitCode,signal}) {
  if(timedOut)return `生成超过本次 ${Math.round(limitMs/60000)} 分钟等待上限，已停止本地任务，未收到完整结果。不会自动重新提交。`;
  return `生成进程已退出（${signal?'信号 '+signal:'退出码 '+exitCode}），未收到完整结果。不会自动重新提交。`;
}
export function proofJobStatus(j,version,retained=false) {
  if(!j)return {label:'待生成',message:''};
  if(j.status==='running')return {label:'正在生成',message:'正在绘制三张效果图；完成整组后自动显示。'};
  if(j.status==='unknown')return {label:'生成已中断',message:j.execution?.finishedAt?
    codexExitMessage(j.execution):'上次生成已中断，未收到完整结果。旧记录未区分超时与异常退出，不会自动重新提交。'};
  if(j.status==='failed')return {label:'生成失败',message:j.error||'没有收到有效的三张效果图。'};
  if(j.status==='ready')return {label:j.version===version?'等待写入':'旧版结果',message:j.version===version?
    '结果已返回；草稿未修改时会自动填入，若尚未显示请查看下方任务记录。':'结果属于旧版本，已保留在任务记录中，不会覆盖当前草稿。'};
  if(j.status==='awaiting')return {label:'尚未开始',message:'请求已准备，但还没有开始执行。'};
  if(j.status==='applied')return retained?{label:'已采用',message:'三张效果图已写入项目。'}:{label:'上次已采用，当前需重新生成',message:'上次的效果图已采用，当前草稿还缺效果图。'};
  if(j.status==='reconciled')return {label:'上次生成未完成',message:'原请求已记录核对结果，可重新生成。重新生成会建立新请求并使用账户额度。'};
  return {label:'待重新生成',message:''};
}

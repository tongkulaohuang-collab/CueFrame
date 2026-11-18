import React from 'react';
export function VoiceBatchAction({count,available=0,disabled,onClick,onRegenerate,onRemove,removeDisabled=false,progress,onCheck,onRetry,checkingDisabled=false}) {
  const missing=Math.max(0,count-available);
  return <div className="voice-batch-controls" aria-label="全部配音操作">
    <p role="status">当前已采用配音：{available} / {count} 段{missing?' · 缺失 '+missing+' 段':' · 全部就绪'}</p>
    <div className="voice-batch-primary">
      <button className="primary" disabled={disabled||!missing} onClick={onClick}>{available?'只补生成缺失配音':'生成全部配音'}（{missing} 段）</button>
      {!!available&&onRegenerate&&<button disabled={disabled} onClick={onRegenerate}>用当前音色替换全部配音（{count} 段）</button>}
      {onRemove&&<button className="voice-remove" disabled={removeDisabled} onClick={onRemove}>一键删除全部配音</button>}
    </div>
    <p className="muted">补缺保留已采用录音；替换会逐段生成并更新时长，历史录音仍可恢复。</p>
    {progress&&<span role="status">本次任务：{progress.done} / {progress.total} · {progress.text}</span>}
    {onCheck&&<button disabled={checkingDisabled} onClick={onCheck}>查询暂停的原请求</button>}
    {onRetry&&<span><small>原请求结果不明，重新提交可能重复计费。</small> <button disabled={disabled} onClick={onRetry}>已核对原请求，继续生成</button></span>}
  </div>;
}

export function exportStatus(job) {
  switch (job.status) {
    case 'queued': return '排队中';
    case 'running':
      return ['渲染中', job.step, Number.isFinite(job.progress) && job.progress * 10 + '%']
        .filter(Boolean).join(' · ');
    case 'done': return '已完成';
    case 'failed': return '导出失败';
    default: return '状态待确认';
  }
}

export function exportNotice(submission, tasks) {
  const parts = submission.ids.map(id => {
    const job = tasks.find(task => task.id === id);
    if (!job) return '正在同步任务状态';
    const language = submission.ids.length > 1 ? job.variant.toUpperCase() + ' ' : '';
    return language + exportStatus(job);
  });
  return (submission.scope === 'rough' ? '有声粗剪' : '整片导出') + ' · ' + parts.join(' / ');
}

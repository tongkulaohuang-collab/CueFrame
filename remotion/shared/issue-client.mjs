// Each call is initiated by one explicit button click. Polling only reads that request.
export async function analyzeIssue(request,project,issue,onJob=()=>{},options={}) {
  const prepared=await request('/api/projects/'+project.id+'/codex',{version:project.version,task:'diagnosis',issue});
  const started=await request('/api/jobs/'+prepared.id+'/approve',{confirm:prepared.id});
  onJob(started);
  const until=Date.now()+(options.timeout??270000);
  while(Date.now()<until){
    await new Promise(resolve=>setTimeout(resolve,options.interval??1800));
    const result=await request('/api/jobs/'+started.id);
    if(result.status==='ready')return result.result[0];
    if(['failed','unknown','reconciled'].includes(result.status))throw Error(result.error||'分析结果待核对，请查看原任务记录。');
  }
  throw Error('分析仍未返回可确认结果，请在任务记录中查询原请求，不会自动重新提交。');
}

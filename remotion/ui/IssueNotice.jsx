import React,{createContext,useContext,useEffect,useState} from 'react';
import {issueHelp,safeIssueText} from '../shared/issue-help.mjs';
export const IssueContext=createContext({});
export function IssueNotice({error,summary,area='工作台',job,onRetry,retryLabel='重新检查',children}) {
  const actions=useContext(IssueContext),help=issueHelp(error,{area,job});
  const [declined,D]=useState(false),[working,W]=useState(false),[analysis,A]=useState(null),[actionError,E]=useState(''),[copied,C]=useState(false),[submitted,S]=useState(false);
  const [actionMessage,AM]=useState('');
  useEffect(()=>{D(false);A(null);E('');AM('');C(false);S(false);},[help.raw,job?.id]);
  const repairable=job?.repairable&&job.version===actions.version&&actions.repair;
  const fieldIssues=job?.motionValidation?.issues||job?.validationAttempts?.at(-1)?.issues||[];
  const fieldDetails=fieldIssues.map(i=>safeIssueText(i.path+'：'+i.message)).join('\n');
  async function askAI(){
    W(true);E('');
    try { if(repairable){await actions.repair(job);S(true);}else A(await actions.analyze({message:help.raw,area})); }
    catch(e){E(safeIssueText(e));}finally{W(false);}
  }
  return <section className="issue-notice" role="alert" aria-label={area+'问题处理'}>
    <strong>{help.title}</strong>
    <p><b>问题原因：</b>{summary||help.cause}</p>
    <div><b>解决方案：</b><ol>{help.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></div>
    <div className="issue-actions">
      {actions.checkConnection&&/请求没有正常返回|服务连接/.test(help.title)&&<button disabled={working} onClick={async()=>{W(true);E('');try{await actions.checkConnection();AM('本地工作台连接正常；外部服务状态请查询原任务或对应连接设置。');}catch(e){E(safeIssueText(e));}finally{W(false);}}}>检查工作台连接</button>}
      {job?.id&&['codex','render','segments','joined'].includes(job.type)&&actions.checkJob&&<button disabled={working} onClick={async()=>{W(true);E('');try{const next=await actions.checkJob(job.id);AM('原任务状态：'+({running:'执行中',ready:'结果已返回',done:'已完成',applied:'已采用',failed:'失败',unknown:'待核对',cancelled:'已停止'}[next.status]||next.status));}catch(e){E(safeIssueText(e));}finally{W(false);}}}>查询原任务</button>}
      {onRetry&&<button disabled={working||actions.busy} onClick={onRetry}>{retryLabel}</button>}
      {actions.navigate&&<button disabled={working||actions.busy} onClick={()=>actions.navigate(help.action)}>{({evidence:'去核对资料',voice:'去口播与音乐',connection:'查看连接设置',tools:'检查制作工具',tasks:'查看任务记录',direction:'核对节奏脚本',style:'补齐风格与素材',sample:'查看有声样片',review:'去检查分段视频'})[help.action]}</button>}
    </div>
    {!declined?<div className="issue-ai-choice"><b>需要 AI 帮忙吗？</b>
      <p className="muted">{repairable?'AI 会针对这条错误修复已有结果，校验通过后继续原流程。':'AI 可以进一步分析原因和处理步骤；分析不会自动修改项目或重发生成任务。'}{actions.analyze?'使用当前 Codex 账户额度。':'当前无法连接项目，可复制问题交给 AI。'}</p>
      <div className="issue-actions">{actions.analyze&&<button disabled={working||actions.busy||submitted} onClick={askAI}>{working?'正在处理…':submitted?'修复已提交':repairable?'让 AI 帮我修复':'让 AI 分析原因'}</button>}
        <button disabled={working} onClick={()=>D(true)}>暂不处理</button>
        <button onClick={async()=>{try{await navigator.clipboard.writeText(`${area}\n问题：${help.raw}\n已知原因：${help.cause}\n建议：${help.steps.join('；')}${fieldDetails?'\n具体字段：\n'+fieldDetails:''}`);C(true);}catch{E('复制未完成，请展开技术详情手动复制。');}}}>{copied?'已复制':'复制给 AI'}</button>
      </div></div>:<button onClick={()=>D(false)}>展开处理选项</button>}
    {analysis&&<div className="issue-analysis" role="status"><b>AI 分析建议 · 尚未执行</b><p>{analysis.cause}</p><ol>{analysis.steps.map((s,i)=><li key={i}>{s}</li>)}</ol><p>{analysis.needsUser}</p></div>}
    {submitted&&<p role="status">修复已提交，校验通过后继续原流程；可在任务记录查看进度。</p>}
    {actionError&&<div className="issue-analysis"><b>本次处理未完成</b><p>{issueHelp(actionError).cause}</p><p>{issueHelp(actionError).steps.join(' ')}</p></div>}
    {actionMessage&&<p role="status">{actionMessage}</p>}
    <details><summary>技术详情{job?.id?' · 请求 '+job.id.slice(0,8):''}{fieldIssues.length?' · '+fieldIssues.length+' 项':''}</summary><p>{help.raw}</p>
      {fieldIssues.length>0&&<ol>{fieldIssues.map((issue,i)=><li key={i}><code>{safeIssueText(issue.path)}</code>：{safeIssueText(issue.message)}</li>)}</ol>}
      {job?.originalError&&<p>原始回执：{safeIssueText(job.originalError)}</p>}
    </details>
    {children}
  </section>;
}
export class AppErrorBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error?<main><IssueNotice error={this.state.error} area="页面显示" onRetry={()=>location.reload()} retryLabel="重新打开页面"/></main>:this.props.children;}
}

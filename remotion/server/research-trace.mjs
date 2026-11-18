import fs from 'node:fs';
import {safeIssueText} from '../shared/issue-help.mjs';

const text=value=>typeof value==='string'&&value.trim()?safeIssueText(value).slice(0,2400):'';
const webUrl=value=>{
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?text(url.href):'';}
  catch{return '';}
};
const rows=value=>Array.isArray(value)?value:[];
const queries=args=>[...rows(args?.search_query),...rows(args?.system2_search_query),...rows(args?.image_query)]
  .map(row=>text(row?.q)).filter(Boolean);

// Only executed tool events count. Agent prose, shell commands and arbitrary
// MCP tools mentioning a search cannot establish that a search took place.
export function researchToolEvent(event) {
  if(event?.type!=='item.completed'||!event.item)return null;
  const item=event.item;
  if(item.type==='web_search') {
    if(item.error||item.status&&item.status!=='completed')return null;
    const action=item.action||{};
    const query=text(action.query||item.query);
    const kind=action.type||(query?'search':'other');
    if(!['search','open_page','find_in_page'].includes(kind))return null;
    const searchQueries=rows(action.queries).map(text).filter(Boolean);
    if(kind==='search'&&!query&&!searchQueries.length)return null;
    return {id:text(item.id),provider:'web',action:kind,query,
      queries:searchQueries,
      url:webUrl(action.url),results:Array.isArray(item.results)?item.results.map(row=>({
        title:text(row?.title),url:webUrl(row?.url),refId:text(row?.ref_id),
      })).filter(row=>row.url||row.refId):[]};
  }
  // The connected OpenAI search tool is also a real web provider, even when
  // exec reports it as an MCP call instead of the native web_search item.
  if(item.type!=='mcp_tool_call'||item.server!=='codex_apps'||
    item.tool!=='search_service_web_run'||item.status!=='completed'||item.error||
    !item.result||item.result.isError||item.result.is_error)return null;
  const content=item.result.content;
  if(!Array.isArray(content)||!content.some(row=>row.type==='text'&&/https?:\/\//.test(row.text||'')))return null;
  let args=item.arguments;
  if(typeof args==='string')try{args=JSON.parse(args);}catch{return null;}
  const search=queries(args),opened=(Array.isArray(args?.open)?args.open:[]).map(row=>text(row.ref_id)).filter(Boolean);
  if(!search.length&&!opened.length)return null;
  return {id:text(item.id),provider:'codex_apps/search_service_web_run',
    action:search.length?'search':'open_page',query:search[0]||'',queries:search,
    url:webUrl(opened[0]),opened,results:[]};
}

export function createResearchTrace(file) {
  fs.writeFileSync(file,'');
  const records=[],ids=new Set(),itemTypes=Object.create(null),toolNames=new Set();
  let threadId='',writeError='',parseErrors=0;
  return {
    invalidLine(){parseErrors++;},
    observe(event) {
      if(event?.type==='thread.started')threadId=text(event.thread_id);
      if(event?.type==='item.completed'&&event.item) {
        const type=text(event.item.type)||'unknown';
        if(Object.hasOwn(itemTypes,type)||Object.keys(itemTypes).length<40)itemTypes[type]=(itemTypes[type]||0)+1;
        if(event.item.type==='mcp_tool_call'&&toolNames.size<40)toolNames.add(text(event.item.server)+'/'+text(event.item.tool));
      }
      const record=researchToolEvent(event);
      if(!record)return;
      const id=record.id||JSON.stringify(record);
      if(ids.has(id))return;
      ids.add(id);records.push(record);
      try{fs.appendFileSync(file,JSON.stringify(record)+'\n');}
      catch(error){writeError=error.code||'WRITE_FAILED';}
    },
    summary() {
      return {version:1,threadId,file:'research-events.jsonl',searches:records.filter(row=>row.action==='search').length,
        pages:records.filter(row=>row.action==='open_page').length,events:records.length,
        itemTypes:{...itemTypes},toolNames:[...toolNames],parseErrors,...(writeError?{writeError}:{})};
    },
    assertSearched() {
      if(writeError)throw Object.assign(Error('检索记录未能保存，原资料结果已保留。请检查任务目录后核对原请求。'),{code:'RESEARCH_TRACE_WRITE_FAILED'});
      if(!records.some(row=>row.action==='search'))throw Object.assign(
        Error('未记录到成功的联网搜索；已保留本次返回资料和检索诊断，请先核对原任务，再决定是否重新搜索。'),
        {code:'RESEARCH_EVIDENCE_MISSING'});
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createResearchTrace,researchToolEvent} from '../server/research-trace.mjs';
import {researchPrompt} from '../server/topic-research.mjs';

const complete=item=>({type:'item.completed',item});
const web={id:'search-1',type:'web_search',query:'GPS official',action:{type:'search',query:'GPS official'},
  results:[{title:'Official source',url:'https://example.org/gps',ref_id:'turn0search0'}]};
const mcp={id:'mcp-1',type:'mcp_tool_call',server:'codex_apps',tool:'search_service_web_run',status:'completed',
  arguments:{system2_search_query:[{q:'GPS official'}]},result:{content:[{type:'text',text:'Official source https://example.org/gps'}]}};
function trace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'research-trace-test-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
  const file=path.join(dir,'research-events.jsonl');return {dir,file,trace:createResearchTrace(file)};}

test('完成的原生搜索和打开原文留存可追溯出处，重复事件不重复计数',t=>{
  const {file,trace:log}=trace(t);log.observe({type:'thread.started',thread_id:'thread-1'});
  log.observe({type:'item.started',item:web});assert.throws(()=>log.assertSearched(),e=>e.code==='RESEARCH_EVIDENCE_MISSING');
  log.observe(complete(web));log.observe(complete(web));
  log.observe(complete({...web,id:'open-1',action:{type:'open_page',url:'https://example.org/gps'}}));
  log.assertSearched();assert.equal(log.summary().searches,1);assert.equal(log.summary().pages,1);assert.equal(log.summary().threadId,'thread-1');
  const saved=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(saved.length,2);assert.equal(saved[0].results[0].url,'https://example.org/gps');
});
test('兼容旧版无 results 的真实搜索回执和多个搜索词',()=>{
  assert.equal(researchToolEvent(complete({id:'old',type:'web_search',query:'official source'})).action,'search');
  assert.deepEqual(researchToolEvent(complete({...web,query:'',action:{type:'search',queries:['a','b']}})).queries,['a','b']);
  assert.equal(researchToolEvent(complete({...web,query:'',action:{type:'search',queries:'invalid'}})),null);
});
test('识别已完成的连接器搜索，失败及未知来源不能冒充检索',()=>{
  assert.equal(researchToolEvent(complete(mcp)).provider,'codex_apps/search_service_web_run');
  assert.equal(researchToolEvent(complete({...mcp,arguments:JSON.stringify(mcp.arguments)})).query,'GPS official');
  for(const patch of [{status:'failed'},{status:'in_progress'},{error:{message:'offline'}},{result:null},
    {result:{isError:true,content:mcp.result.content}},{server:'untrusted'},{tool:'read_file'},
    {result:{content:[{type:'text',text:'No result'}]}},{arguments:{time:[{}]}},{arguments:'invalid JSON'},
    {arguments:{system2_search_query:{q:'malformed'}}}])assert.equal(researchToolEvent(complete({...mcp,...patch})),null);
});
test('声明已搜索、命令输出、仅打开网页、失败搜索不能放行',t=>{
  const {trace:log}=trace(t);
  for(const item of [{id:'a',type:'agent_message',text:JSON.stringify(web)},
    {id:'b',type:'command_execution',command:'web_search',aggregated_output:'searched https://example.org'},
    {...web,status:'failed'},{...web,error:'offline'},{...web,action:{type:'other'}},
    {...web,id:'open-only',action:{type:'open_page',url:'https://example.org'}}])log.observe(complete(item));
  assert.equal(log.summary().pages,1);assert.throws(()=>log.assertSearched(),e=>e.code==='RESEARCH_EVIDENCE_MISSING');
  assert.equal(log.summary().itemTypes.agent_message,1);
});
test('检索诊断记录解析错误和工具类型，不存储整段模型答复或凭据',t=>{
  const {file,trace:log}=trace(t);log.invalidLine();
  log.observe(complete({id:'message',type:'agent_message',text:'private prompt'}));
  log.observe(complete({...web,query:'Bearer super-secret',action:{type:'search',query:'Bearer super-secret'},
    results:[{title:'source',url:'https://username:password@example.org'}]}));
  assert.equal(log.summary().parseErrors,1);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/private prompt|super-secret|password/);
});
test('记录写入失败不把内存中的搜索伪装为可恢复凭据',t=>{
  const {file,trace:log}=trace(t);fs.unlinkSync(file);fs.mkdirSync(file);
  log.observe(complete(web));assert.ok(log.summary().writeError);
  assert.throws(()=>log.assertSearched(),e=>e.code==='RESEARCH_TRACE_WRITE_FAILED');
});
test('搜索提示明确实际工具调用和原文读取，不靠最终文字自证',()=>{
  const prompt=researchPrompt('手机如何定位');assert.match(prompt,/search_query/);assert.match(prompt,/system2_search_query/);
  assert.match(prompt,/open/);assert.match(prompt,/不能把记忆/);
});

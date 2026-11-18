import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {draft} from '../shared/model.mjs';
const {save,job,data,get}=await import('../server/store.mjs');
const {prepare,approve}=await import('../server/codex.mjs');
const result={materials:[{kind:'科学资料',type:'科研机构或高校',title:'GPS 测试出处',publisher:'测试发布方',
  url:'https://example.org/gps',locator:'第一段',summary:'用于测试的候选资料',use:'测试资料流程',rights:'使用条件未注明',original:'',mediaUrl:''}]};
const complete=item=>({type:'item.completed',item});
const search=complete({id:'s1',type:'web_search',query:'GPS',action:{type:'search',query:'GPS'},
  results:[{url:'https://example.org/gps',title:'GPS 测试出处',ref_id:'turn0search0'}]});

function fakeCli(t,events,{exitCode=0,invalidLine=false}={}) {
  let calls=0,args;
  t.mock.method(childProcess,'spawnSync',(_exe,argv)=>({status:0,stdout:argv[0]==='login'?'Logged in using ChatGPT':'codex-cli test',stderr:''}));
  t.mock.method(childProcess,'spawn',(_exe,argv)=>{
    calls++;args=argv;const child=new EventEmitter();child.pid=99999999;
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    child.stdin.on('finish',()=>{
      fs.writeFileSync(argv[argv.indexOf('-o')+1],JSON.stringify(result));
      child.stderr.end('Do not retain full prompt or credentials.');
      const lines=events.map(JSON.stringify).join('\n')+'\n'+(invalidLine?'malformed\n':'');
      child.stdout.write(lines.slice(0,11));child.stdout.end(lines.slice(11));
      setImmediate(()=>child.emit('close',exitCode,null));
    });
    setImmediate(()=>child.emit('spawn'));return child;
  });
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  return {calls:()=>calls,args:()=>args};
}
async function submit() {
  const p=save({...draft('science'),topic:'测试手机定位'}),j=prepare(p,null,'research');approve(j.id);
  for(let n=0;n<100&&job(j.id).status==='running';n++)await new Promise(resolve=>setTimeout(resolve,10));
  return {p,j:job(j.id),dir:path.join(data,'jobs',j.id)};
}
test('真实 CLI 管线接收分块 JSONL，保留检索记录并返回待选素材',async t=>{
  const fake=fakeCli(t,[{type:'thread.started',thread_id:'test-thread'},search,complete({id:'a',type:'agent_message',text:JSON.stringify(result)})]);
  const {p,j,dir}=await submit();assert.equal(j.status,'ready');assert.deepEqual(j.result,result.materials);
  assert.equal(j.researchEvidence.searches,1);assert.equal(j.researchEvidence.cliVersion,'codex-cli test');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'research-diagnostics.json'))).execution.exitCode,0);
  assert.equal(fs.readFileSync(path.join(dir,'research-events.jsonl'),'utf8').trim().split('\n').length,1);
  assert.deepEqual(get(p.id),p);assert.equal(fake.calls(),1);assert.equal(fake.args()[0],'--search');
});
test('原来漏识别的搜索连接器在同一 CLI 管线成功，不增加生成次数',async t=>{
  const fake=fakeCli(t,[complete({id:'mcp1',type:'mcp_tool_call',server:'codex_apps',tool:'search_service_web_run',status:'completed',
    arguments:{system2_search_query:[{q:'GPS'}]},result:{content:[{type:'text',text:'Source: https://example.org/gps'}]}})]);
  const {j}=await submit();assert.equal(j.status,'ready');assert.equal(j.researchEvidence.searches,1);assert.equal(fake.calls(),1);
});
test('没有真实检索时保留原返回及明确诊断，不伪造成功或自动重试',async t=>{
  const fake=fakeCli(t,[complete({id:'a',type:'agent_message',text:'I searched the web: https://example.org/gps'})],{invalidLine:true});
  const {j,dir}=await submit();assert.equal(j.status,'failed');assert.equal(j.errorCode,'RESEARCH_EVIDENCE_MISSING');
  assert.match(j.error,/先核对原任务/);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'result.json'))),result);
  assert.equal(j.researchEvidence.searches,0);assert.equal(j.researchEvidence.parseErrors,1);assert.equal(fake.calls(),1);
});
test('搜索事件不掩盖进程异常，未知请求仍保留且不自动重发',async t=>{
  const fake=fakeCli(t,[search],{exitCode:1});const {j}=await submit();
  assert.equal(j.status,'unknown');assert.equal(j.researchEvidence.searches,1);assert.equal(fake.calls(),1);
});

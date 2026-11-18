import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {captureGenerationRuntime} from '../server/generation-runtime.mjs';
import {workbenchRouting,localEntryAllowed} from '../server/workbench-routing.mjs';

const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-runtime-'));
const digest='a'.repeat(64);
const listen=async(t,handler)=>{
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {server,port:server.address().port};
};
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
async function currentServer(t,root,data,label='current') {
  let routing,posts=0;
  const live=await listen(t,async(req,res)=>{
    if(req.url==='/api/runtime?instance=1')return json(res,{workspaceId:routing.own.workspaceId,instanceId:routing.own.instanceId,generationFingerprint:digest});
    let body='';for await(const part of req)body+=part;
    if(req.method==='POST')posts++;
    if(req.url==='/media/file.mp4'){res.writeHead(206,{'content-range':'bytes 2-4/6'});res.end('cde');return;}
    json(res,{label,url:req.url,body,host:req.headers.host,origin:req.headers.origin,posts});
  });
  routing=workbenchRouting({root,data,port:live.port,fingerprint:digest});routing.publish();
  return {...live,routing,posts:()=>posts};
}
async function compatibleEntry(t,root,data) {
  let routing;
  const entry=await listen(t,async(req,res)=>{
    if(!localEntryAllowed(req,entry.port))return json(res,{error:'origin'},403);
    try{await routing.forward(req,res,{required:true});}catch(e){json(res,{code:e.code,error:e.message},e.status||503);}
  });
  routing=workbenchRouting({root,data,port:entry.port,fingerprint:'0'.repeat(64)});
  return {...entry,routing,url:'http://127.0.0.1:'+entry.port};
}

test('代码与 schema 使用同一启动快照，更新后在提交前拒绝；已保存的请求 schema 不变',()=>{
  const root=temporary();fs.mkdirSync(path.join(root,'server'));fs.mkdirSync(path.join(root,'shared'));
  const schema=path.join(root,'server','proofs.schema.json'),module=path.join(root,'shared','compiler.mjs');
  fs.writeFileSync(schema,JSON.stringify({bindingVersion:2}));fs.writeFileSync(module,'export const version=2;');
  const runtime=captureGenerationRuntime(root),output=path.join(root,'jobs','one','input.schema.json');
  const receipt=runtime.schema(schema,output);assert.equal(receipt.runtimeFingerprint,runtime.fingerprint);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{bindingVersion:2});assert.equal(runtime.current(),true);
  fs.writeFileSync(schema,JSON.stringify({bindingVersion:3}));assert.equal(runtime.current(),false);
  assert.throws(()=>runtime.schema(schema,path.join(root,'jobs','two','input.schema.json')),e=>e.code==='WORKBENCH_RUNTIME_STALE'&&e.status===409);
  assert.deepEqual(JSON.parse(fs.readFileSync(output)),{bindingVersion:2});
  fs.writeFileSync(schema,JSON.stringify({bindingVersion:2}));fs.writeFileSync(module,'export const version=1;');
  assert.throws(()=>runtime.assertCurrent(),/尚未提交生成/);
  fs.writeFileSync(module,'export const version=2;');assert.equal(runtime.current(),true);
  fs.writeFileSync(path.join(root,'shared','new.mjs'),'export const added=true;');assert.equal(runtime.current(),false);
});

test('旧地址把原 POST、查询参数和同源请求送到当前服务，仅提交一次',async t=>{
  const root=temporary(),data=temporary(),live=await currentServer(t,root,data),entry=await compatibleEntry(t,root,data);
  const response=await fetch(entry.url+'/api/generate?task=proofs',{method:'POST',headers:{origin:entry.url,'content-type':'application/json'},body:JSON.stringify({version:30,bindingVersion:2})});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.label,'current');assert.equal(result.url,'/api/generate?task=proofs');
  assert.deepEqual(JSON.parse(result.body),{version:30,bindingVersion:2});assert.equal(result.host,'127.0.0.1:'+live.port);assert.equal(result.origin,'http://127.0.0.1:'+live.port);assert.equal(live.posts(),1);
});

test('换新服务后原地址立即转交新实例；媒体 Range 响应保持可播放',async t=>{
  const root=temporary(),data=temporary(),first=await currentServer(t,root,data,'first'),entry=await compatibleEntry(t,root,data);
  assert.equal((await(await fetch(entry.url+'/api/status')).json()).label,'first');
  const second=await currentServer(t,root,data,'second');
  assert.equal((await(await fetch(entry.url+'/api/status')).json()).label,'second');
  const range=await fetch(entry.url+'/media/file.mp4',{headers:{range:'bytes=2-4'}});
  assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 2-4/6');assert.equal(await range.text(),'cde');
  assert.equal(first.posts()+second.posts(),0);
});

test('旧实例同一资料库可转交，新实例本身不形成环路',async t=>{
  const root=temporary(),data=temporary(),live=await currentServer(t,root,data),old=workbenchRouting({root,data,port:1,fingerprint:digest});
  assert.equal((await old.verifiedTarget()).instanceId,live.routing.own.instanceId);
  assert.equal(await live.routing.verifiedTarget(),null);
  const entry=await compatibleEntry(t,root,data);
  const response=await fetch(entry.url+'/api/generate',{method:'POST',headers:{'x-frameboard-routed':'previous'},body:'{}'});
  assert.equal(response.status,508);assert.equal(live.posts(),0);
});

test('资料库或实例身份不符时不把任务发给同端口的其他工作台',async t=>{
  const root=temporary(),data=temporary(),other=temporary(),live=await currentServer(t,root,other),entry=await compatibleEntry(t,root,data);
  fs.copyFileSync(path.join(other,'workbench-active.json'),path.join(data,'workbench-active.json'));
  assert.equal((await fetch(entry.url+'/api/generate',{method:'POST',body:'{}'})).status,503);assert.equal(live.posts(),0);
  const impostor={...live.routing.own,workspaceId:entry.routing.own.workspaceId};fs.writeFileSync(path.join(data,'workbench-active.json'),JSON.stringify(impostor));
  assert.equal((await fetch(entry.url+'/api/generate',{method:'POST',body:'{}'})).status,503);assert.equal(live.posts(),0);
});

test('旧入口拒绝跨站提交；无法连接当前服务不自动重试',async t=>{
  const root=temporary(),data=temporary(),live=await currentServer(t,root,data),entry=await compatibleEntry(t,root,data);
  assert.equal((await fetch(entry.url+'/api/generate',{method:'POST',headers:{origin:'https://untrusted.example'},body:'{}'})).status,403);assert.equal(live.posts(),0);
  await new Promise(resolve=>{live.server.closeAllConnections();live.server.close(resolve);});
  assert.equal((await fetch(entry.url+'/api/generate',{method:'POST',body:'{}'})).status,503);assert.equal(live.posts(),0);
});

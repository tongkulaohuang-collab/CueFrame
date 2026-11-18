import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';

export function workspaceIdentity(root,data) {
  return createHash('sha256').update(JSON.stringify([fs.realpathSync(root),fs.realpathSync(data)])).digest('hex');
}
export function workbenchRouting({root,data,port,fingerprint,pid=process.pid}) {
  const workspaceId=workspaceIdentity(root,data),instanceId=randomUUID(),file=path.join(data,'workbench-active.json');
  const own={version:1,workspaceId,instanceId,port,pid,fingerprint};
  function active() {
    try {
      const value=JSON.parse(fs.readFileSync(file,'utf8'));
      return value.version===1&&value.workspaceId===workspaceId&&Number.isInteger(value.port)&&value.port>0&&value.port<=65535&&
        typeof value.instanceId==='string'&&/^[a-f0-9]{64}$/.test(value.fingerprint)?value:null;
    }catch{return null;}
  }
  async function verifiedTarget() {
    const target=active();if(!target||target.port===port)return null;
    try {
      const response=await fetch(`http://127.0.0.1:${target.port}/api/runtime?instance=1`,{signal:AbortSignal.timeout(1500)});
      const info=await response.json();
      if(response.ok&&info.instanceId===target.instanceId&&info.workspaceId===workspaceId&&info.generationFingerprint===target.fingerprint)
        return target;
    }catch{}
    throw Object.assign(Error('当前工作台服务暂未就绪；原任务和草稿已保留，请稍后重试。'),{status:503,code:'WORKBENCH_UNAVAILABLE'});
  }
  return {own,active,verifiedTarget,
    publish() {
      const temporary=file+'.'+instanceId+'.tmp';fs.writeFileSync(temporary,JSON.stringify(own));fs.renameSync(temporary,file);
    },
    async forward(req,res,{required=false}={}) {
      const target=await verifiedTarget();
      if(!target){if(required)throw Object.assign(Error('当前工作台服务尚未启动，原项目已保留。'),{status:503});return false;}
      if(req.headers['x-frameboard-routed'])throw Object.assign(Error('工作台入口路由冲突，未重复提交请求。'),{status:508});
      const authority=`127.0.0.1:${target.port}`,headers={...req.headers,host:authority,'x-frameboard-routed':instanceId};
      if(headers.origin)headers.origin='http://'+authority;
      await new Promise(resolve=>{
        const upstream=http.request({hostname:'127.0.0.1',port:target.port,path:req.url,method:req.method,headers},response=>{
          res.writeHead(response.statusCode,response.headers);response.pipe(res);response.once('end',resolve);
        });
        upstream.on('error',()=>{
          if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'工作台连接中断，请先查询原任务状态；不会自动重复提交。'}));}
          else res.destroy();resolve();
        });
        req.once('aborted',()=>upstream.destroy());res.once('close',()=>{upstream.destroy();resolve();});req.pipe(upstream);
      });
      return true;
    }};
}

export function localEntryAllowed(req,port) {
  const allowed=[`127.0.0.1:${port}`,`localhost:${port}`];
  return allowed.includes(req.headers.host)&&(!req.headers.origin||allowed.some(host=>req.headers.origin==='http://'+host));
}

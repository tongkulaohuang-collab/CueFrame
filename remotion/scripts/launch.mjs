import {spawn} from 'node:child_process';
import {videoWorkflowPolicy} from '../shared/workflow-policy.mjs';
import {WORKBENCH_CAPABILITIES} from '../shared/workbench-version.mjs';
let url;
export function openWorkbench(){const child=spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log(url));child.unref();}
const ports=process.env.PORT?[Number(process.env.PORT)]:[4173,4183,4184,4185,4186,4187,4188,4189,4191,4192,4193,4194,4195,4196];
let free,current;
for(const port of ports){const address='http://127.0.0.1:'+port;
  try{const r=await fetch(address+'/api/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();
    if(!r.ok||h.app!=='frameboard')continue;
    const v=await fetch(address+'/api/runtime',{signal:AbortSignal.timeout(1000)}),runtime=await v.json();
    if(v.ok&&runtime.environment==='production'&&runtime.sourceCurrent===true&&runtime.rendererSourceCurrent===true&&runtime.policyVersion===videoWorkflowPolicy.version&&runtime.capabilities===WORKBENCH_CAPABILITIES&&runtime.researchRecommendation===true){current=port;break;}
  }catch(error){if(error.cause?.code==='ECONNREFUSED')free??=port;}
}
const port=current??free;
if(!port)throw Error('工作台端口均被其他或旧版服务占用；请指定空闲 PORT，原服务与任务已保留。');
process.env.PORT=String(port);url='http://127.0.0.1:'+port;
if(current)openWorkbench();else{process.argv.push('--open');await import('../server/main.mjs');}

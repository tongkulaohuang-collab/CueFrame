import {IssueNotice} from './IssueNotice';
import React,{useEffect,useRef,useState} from 'react';
import {Input,Select} from './fields';
import {isLocalProcess} from '../shared/local-process.mjs';
import {scienceScenes,scienceScene,scienceParameters,pipeMetrics} from '../shared/science-scenes.mjs';
import {timeline} from '../shared/model.mjs';
export function LocalProcess({p,s,set}){
 const [state,S]=useState(null),[busy,B]=useState(false),[error,E]=useState(''),[readError,setReadError]=useState('');const live=useRef({p,s});live.current={p,s};
 const prefs=s.localProcess||{};const engine=isLocalProcess(s)?s.processEngine:'anatomy';
 const template=prefs.template||'sine-plotter',scene=scienceScene(template),parameters=prefs.parameters||{};
 const startTime=prefs.start??((timeline(p).rows.find(r=>r.shot.id===s.id)?.from||0)/p.fps);
 let parameterError='';try{if(scene)scienceParameters(template,parameters);}catch(e){parameterError=e.message;}
 const update=patch=>{E('');set({shots:p.shots.map(x=>x.id===s.id?{...x,...patch,reviewed:false}:x)});};
 async function refresh(signal){const r=await fetch('/api/science/local?project='+encodeURIComponent(p.id),{signal});if(!r.ok)throw Error('读取本地任务失败（HTTP '+r.status+'）');S(await r.json());setReadError('');}
 useEffect(()=>{const controller=new AbortController();let polling=false;const poll=async()=>{if(polling)return;polling=true;try{await refresh(controller.signal);}catch(e){if(!controller.signal.aborted)setReadError(e.message);}finally{polling=false;}};poll();const t=setInterval(poll,2500);return()=>{controller.abort();clearInterval(t)}},[p.id]);
 const j=state?.jobs.find(x=>x.project===p.id&&x.shotId===s.id),running=state?.busy??state?.jobs.some(x=>x.status==='running');
 async function start(){B(true);E('');try{const duration=Math.max(s.seconds||1,...p.assets.filter(a=>s.assetIds.includes(a.id)&&a.role===p.voice&&a.kind==='audio').map(a=>a.duration+.7));
 const r=await fetch('/api/science/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,template,parameters,view:prefs.view||'overview',index:prefs.index??-1,start:Number(startTime),duration,width:p.width,height:p.height,fps:p.fps,project:p.id,shotId:s.id})});const v=await r.json();if(!r.ok)throw Error(v.error);await refresh();}catch(e){E(e.message)}finally{B(false)}}
 function adopt(){const {p:now,s:shot}=live.current;if(!j?.asset||shot.id!==j.shotId)return;const asset=j.asset;set({productionMode:'local-process',assets:now.assets.some(a=>a.id===asset.id)?now.assets:[...now.assets,asset],shots:now.shots.map(x=>x.id===shot.id?{...x,processEngine:j.spec.engine,localProcess:j.spec,processVideoId:asset.id,processOffset:0,assetIds:[...new Set([...x.assetIds,asset.id])],motionReview:'',filmQA:[],reviewed:false}:x)});}
 const status=readError?'状态读取失败':error?'操作失败':({running:'正在生成',done:'画面已生成',failed:'生成失败',interrupted:'上次已中断'})[j?.status];
 return <details className="local-process" open={isLocalProcess(s)||!!(readError||error||j?.error||j?.status==='interrupted')}><summary>Blender / Anatomy · 本地免费制作{status&&' · '+status}</summary>
 <p className="muted">按旁白制作本地场景，采用后可配字幕并导出。每个模型都有明确适用条件。当前采用模板外观；本期视觉参考不会自动改写它，自定义外观需要适配后重新生成。</p>
 <Select title="科学场景" value={template} options={[["sine-plotter","机械正弦绘图仪"],...scienceScenes.map(v=>[v.id,v.name])]} onChange={template=>update({processEngine:scienceScene(template)?.engine||engine,localProcess:{...prefs,template,view:'overview',index:-1,parameters:{}}})}/>
 {scene&&<p className="hint">{scene.limit}。<a href={scene.source} target="_blank" rel="noreferrer">核对依据</a></p>}
 <div className="row"><Select title="制作方式" value={engine} disabled={!!scene} options={[["blender","Blender 三维场景"],["anatomy","Anatomy 机械结构绘图库"]]} onChange={processEngine=>update({processEngine})}/><Select title="观察位置" value={prefs.view||'overview'} options={scene?.views||[["overview","整机与因果链"],["pin","偏心销特写"],["slot","横槽和导轨"],["pen","笔尖与纸带"]]} onChange={view=>update({processEngine:engine,localProcess:{...prefs,view}})}/></div>
 {template==='cubic-lattice'&&<Input title="每边节点数量（2–5）" type="number" min="2" max="5" value={parameters.layers??3} onChange={layers=>update({localProcess:{...prefs,parameters:{layers:Number(layers)}}})}/>}
 {template==='laminar-pipe'&&<div className="content-brief-grid">{[['radius','管半径（米）',.002],['meanSpeed','平均流速（米/秒）',.02],['viscosity','运动黏度（平方米/秒）',.000001]].map(([k,title,initial])=><Input key={k} type="number" step="any" title={title} value={parameters[k]??initial} onChange={value=>update({localProcess:{...prefs,parameters:{...parameters,[k]:Number(value)}}})}/>)}<p>雷诺数 Re：{pipeMetrics({radius:.002,meanSpeed:.02,viscosity:.000001,...parameters}).reynolds.toFixed(1)}（本模型须小于 1500）</p></div>}
 <Input type="number" min="0" max="3600" step="0.01" title="连续时间起点（秒，与前镜衔接）" value={startTime} onChange={start=>update({processEngine:engine,localProcess:{...prefs,start:Number(start)}})}/>
 {!scene&&<Select title="镜头调度" value={[0,2,3,5].includes(prefs.index)?prefs.index:-1} options={[[-1,'标准观察'],[0,'开场：从笔尖拉远'],[2,'横槽：短时结构提示'],[3,'连杆：从局部看向整机'],[5,'周期：短时对应提示']]} onChange={index=>update({processEngine:engine,localProcess:{...prefs,index:Number(index)}})}/>}
 <p className="muted">按本镜与旁白时长生成纯画面，沿用工作台配音、字幕。所选过程视频会受保护。</p>
 {readError&&<p className="reference-problem" role="alert">{readError}，正在重新读取。</p>}
 {parameterError&&<p className="reference-problem" role="alert">{parameterError}</p>}
 {error&&<IssueNotice area="本地画面制作" error={error}/>}
 <button disabled={busy||running||!!readError||!!parameterError||!state?.[engine]} onClick={start}>{busy?'正在提交…':running?(j?.status==='running'?'本镜渲染中…':'本机正在渲染其他镜头'):'生成本镜画面'}</button>
 {isLocalProcess(s)&&<button onClick={()=>update({processEngine:'',processVideoId:'',processOffset:0})}>解除过程视频，允许自动动画</button>}
 {j&&<div role="status"><p>{({running:'正在生成',done:'画面已完成',failed:'生成失败',interrupted:'上次已中断'})[j.status]}{j.status==='running'&&` · ${Math.round(j.progress*100)}%`}</p>{j.status==='running'&&<progress aria-label="本地渲染进度" value={j.progress} max="1"/>}{j.error&&<IssueNotice area="本地渲染" job={j} error={j.error}/>}
 {j.asset&&<><video controls preload="metadata" src={j.asset.src} style={{width:'100%',maxHeight:280}} aria-label="本地画面预览"/><button disabled={s.processVideoId===j.asset.id} onClick={adopt}>{s.processVideoId===j.asset.id?'当前镜头正在使用':'用于当前镜头'}</button><p className="muted">采用后保存草稿；未采用前保留原镜头。</p></>}</div>}
 </details>;
}

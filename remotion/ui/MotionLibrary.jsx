import React,{useEffect,useMemo,useState} from 'react';
import {Player} from '@remotion/player';
import {Star,Play,BookmarkPlus,RotateCcw,Search,ArrowUpRight} from 'lucide-react';
import {libraryItems,libraryItem,defaultParams,validateParams} from '../shared/motion-library.mjs';
import {demoFor,templatePlan} from '../shared/library-compiler.mjs';
import {libraryProject} from '../shared/library-project.mjs';
import {timeline} from '../shared/model.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {ShotScene} from '../video/Scene';
import {MotionArtwork} from '../video/MotionScene';
import {LemoLibrary} from './LemoLibrary';
import './motion-library.css';
const effectSources={
  'Onda · MIT':'https://github.com/degueba/onda',
  'Frameboard 原生':'https://www.remotion.dev/docs/animating-properties',
  'Frameboard 原创模板':'https://www.remotion.dev/docs/parameterized-rendering',
};
function Thumbnail({item}){
  const data=useMemo(()=>demoFor(item.id,defaultParams(item.id),{width:640,height:360,duration:6}),[item.id]);
  return <div className="ml-thumbnail" aria-hidden="true"><MotionArtwork plan={data.plan} time={item.type==='template'?4:1.1}/><span>{item.scope==='transition'?'镜头衔接':item.type==='template'?'完整镜头':'可编辑动效'}</span></div>;
}
export function MotionLibrary({p,sel,select,request,saved,load,run,busy}){
  const [section,sectionTo]=useState('effect'),[query,queryTo]=useState(''),[category,categoryTo]=useState(''),[favoritesOnly,favoritesTo]=useState(false);
  const [state,stateTo]=useState(null),[error,errorTo]=useState(''),[notice,noticeTo]=useState(''),[working,workingTo]=useState(false);
  const [active,activeTo]=useState('line'),[params,paramsTo]=useState(defaultParams('line')),[targets,targetsTo]=useState([]),[instanceId,instanceTo]=useState(null);
  const [mode,modeTo]=useState('demo'),[name,nameTo]=useState(''),[cueId,cueTo]=useState('');
  const item=libraryItem(active),shot=p.shots.find(s=>s.id===sel),tl=timeline(p),row=tl.rows.find(r=>r.shot.id===sel);
  const duration=(row?.frames||Math.round(6*p.fps))/p.fps,disabled=busy||working;
  const reload=()=>request('/api/motion-library').then(stateTo).catch(e=>errorTo(e.message));
  useEffect(()=>{reload();},[]);
  const nodes=shot?.motionPlan?.nodes||[],images=p.assets.filter(a=>motionImageAsset(p,a.id));
  function choose(id,config,editing=null,selectedTargets){
    const next=libraryItem(id);activeTo(id);paramsTo(config||defaultParams(id,duration));instanceTo(editing);modeTo('demo');cueTo('');nameTo('');errorTo('');noticeTo('');
    targetsTo(selectedTargets||[nodes.find(n=>next.requires==='text'?n.text:n.id===shot?.motionPlan?.subjectId)?.id||nodes[0]?.id].filter(Boolean));
  }
  useEffect(()=>{instanceTo(null);targetsTo([shot?.motionPlan?.subjectId||nodes[0]?.id].filter(Boolean));cueTo('');},[sel]);
  async function localWork(fn){workingTo(true);errorTo('');noticeTo('');try{await fn();}catch(e){errorTo(e.message);}finally{workingTo(false);}}
  async function preference(body){const result=await request('/api/motion-library',{...body,version:state.version});stateTo(result);}
  async function apply(action='effect',extra={}){
    await localWork(async()=>{
      const q=await saved();const result=await request('/api/projects/'+q.id+'/motion-library',{
        version:q.version,shotId:sel,action,itemId:active,params,targets,instanceId,cueId,...extra});
      load(result.project);select(result.shotId);instanceTo(action==='effect'?(instanceId||result.project.shots.find(s=>s.id===result.shotId)?.motionLibrary?.instances.at(-1)?.instanceId):null);modeTo('saved');noticeTo(action==='restore'?'已还原应用前的画面':action==='remove'?'已移除动效并保存':'已应用并保存。画面已变更，请重新检查本镜。');
    });
  }
  const view=useMemo(()=>{
    try{
      if(mode==='saved'&&shot){const props=sceneProps(p,sel);return {props,frames:props.canvas.frames};}
      validateParams(active,params,mode==='current'?duration:6);
      if(mode==='current'){
        if(!shot&&!(item.type==='template'&&p.kind==='product'))throw Error('先选择一个镜头，或在产品项目中加入新镜头');
        const result=libraryProject(p,{shotId:sel,action:item.type==='template'?'template':'effect',itemId:active,params,targets,instanceId});
        const props=sceneProps(result.project,result.shotId);return {props,frames:props.canvas.frames};
      }
      const {plan,transition}=demoFor(active,params,{width:p.width,height:p.height,duration:6});
      const props={shot:{id:'demo',motionPlan:plan,libraryTransition:transition,annotations:[]},assets:images,kind:'product',canvas:{width:p.width,height:p.height,fps:p.fps,frames:p.fps*6},silent:true,burnCaptions:false};
      if(transition)props.previousScene={...props,shot:{id:'before',motionPlan:templatePlan('data-scene',defaultParams('data-scene'),{width:p.width,height:p.height,duration:6}),annotations:[]}};
      return {props,frames:p.fps*6};
    }catch(e){return {error:e.message};}
  },[active,params,targets,mode,p,sel,instanceId]);
  const matches=libraryItems.filter(i=>i.type===section&&(!category||i.category===category)&&(!favoritesOnly||state?.favorites.includes(i.id))&&[i.name,i.description,i.category].join(' ').includes(query.trim()));
  const activeInstances=shot?.motionLibrary?.instances||[];
  const presetList=(state?.presets||[]).filter(v=>v.name.includes(query));
  useEffect(()=>{if(mode==='saved')modeTo('current');},[params,targets]);
  return <section className="motion-library panel" aria-label="动效与模板库">
    <div className="ml-heading"><div><small>MOTION LIBRARY</small><h2>动效与模板库</h2><p>先看效果，再带入本片。把常用的参数存成自己的模板。</p></div><span className="ml-count">16 动效 · 4 镜头模板</span></div>
    <nav className="ml-tabs" aria-label="动效库分类">{[['effect','动效组件'],['template','镜头模板'],['reference','风格参考'],['mine','我的收藏与模板']].map(([id,label])=><button key={id} className={section===id?'active':''} aria-pressed={section===id} onClick={()=>{sectionTo(id);categoryTo('');queryTo('');}}>{label}</button>)}</nav>
    {error&&<div className="ml-error" role="alert">{error}<button onClick={()=>{errorTo('');reload();}}>刷新动效库</button></div>}
    {notice&&<p className="ml-notice" role="status">{notice}</p>}
    {section==='reference'?<>
      <div className="ml-references">
        <a href="https://vincentwei1021.github.io/mg-styles-15/" target="_blank" rel="noreferrer"><b>15 Motion Design Styles</b><span>完整风格短片 · 提示词与源码</span><ArrowUpRight size={18}/></a>
        <a href="https://remotion-bits.dev/" target="_blank" rel="noreferrer"><b>Remotion Bits</b><span>组件参考 · Skill 与 MCP 入口</span><ArrowUpRight size={18}/></a>
        <a href="https://github.com/degueba/onda" target="_blank" rel="noreferrer"><b>Onda</b><span>动效组件来源 · MIT</span><ArrowUpRight size={18}/></a>
      </div>
      <LemoLibrary selected={p.scienceFlow?.lemoStyleId} busy={disabled} choose={id=>run(()=>saved({...p,scienceFlow:{...p.scienceFlow,lemoStyleId:id}}))}/>
    </>:<>
      <div className="ml-filters"><label><span>搜索</span><input type="search" placeholder="例如：路径、公式、产品" value={query} onChange={e=>queryTo(e.target.value)}/></label>
        {section==='effect'&&<label><span>用途</span><select value={category} onChange={e=>categoryTo(e.target.value)}><option value="">全部用途</option>{[...new Set(libraryItems.filter(i=>i.type==='effect').map(i=>i.category))].map(c=><option key={c}>{c}</option>)}</select></label>}
        {section!=='mine'&&<label className="ml-checkbox"><input type="checkbox" checked={favoritesOnly} onChange={e=>favoritesTo(e.target.checked)}/>只看收藏</label>}
      </div>
      {section==='mine'?<div className="ml-personal">
        <h3>收藏的效果</h3><div className="ml-pills">{(state?.favorites||[]).map(id=><button key={id} onClick={()=>choose(id)}>{libraryItem(id)?.name}</button>)}{!state?.favorites?.length&&<p>点击效果卡片上的星标，即可收藏。</p>}</div>
        <h3>我的模板</h3>{presetList.map(v=><div className="ml-preset" key={v.id}><button onClick={()=>choose(v.itemId,{...v.params,...(v.sourceProject!==p.id&&'assetId'in v.params?{assetId:''}:{})})}><b>{v.name}</b><span>{libraryItem(v.itemId)?.name}</span></button><button disabled={disabled} onClick={()=>localWork(()=>preference({action:'delete-preset',id:v.id}))}>移除</button></div>)}{!presetList.length&&<p className="muted">调好参数后，使用下方“保存为我的模板”。</p>}
      </div>:<div className="ml-cards">{matches.map(i=><article key={i.id} className={active===i.id?'selected':''}>
        <button className="ml-card-main" onClick={()=>choose(i.id)} aria-label={'预览 '+i.name}><Thumbnail item={i}/><div><small>{i.category}</small><h3>{i.name}</h3><p>{i.description}</p></div></button>
        <button className="ml-favorite" aria-label={'收藏 '+i.name} aria-pressed={!!state?.favorites.includes(i.id)} disabled={!state||disabled} onClick={()=>localWork(()=>preference({action:'favorite',itemId:i.id}))}><Star size={17} fill={state?.favorites.includes(i.id)?'currentColor':'none'}/></button>
      </article>)}</div>}
      {section!=='mine'&&!matches.length&&<p>没有匹配的条目。<button onClick={()=>{queryTo('');categoryTo('');favoritesTo(false);}}>清除筛选</button></p>}
      <div className="ml-editor" aria-label="动效参数编辑器">
        <div className="ml-preview-column"><div className="ml-preview-heading"><div><small>{item.type==='template'?'镜头模板':'动效组件'} · v{item.version}</small><h3>{item.name}{instanceId?' · 修改已应用效果':''}</h3></div><div className="ml-segment"><button className={mode==='demo'?'active':''} onClick={()=>modeTo('demo')}>示例</button><button className={mode==='current'?'active':''} onClick={()=>modeTo('current')}>当前镜头</button></div></div>
          <div className="ml-player">{view.error?<div className="ml-preview-empty"><Play size={28}/><p>{view.error}</p></div>:<Player key={active+mode+sel} component={ShotScene} inputProps={view.props} durationInFrames={view.frames} compositionWidth={p.width} compositionHeight={p.height} fps={p.fps} controls style={{width:'100%',aspectRatio:p.width+'/'+p.height}}/>}</div>
          <p className="muted">{mode==='demo'?'6 秒抽象示例，使用测试内容。当前镜头预览会带入项目内容、配音和字幕。':'沿用当前镜头的实际时长、画幅、旁白和字幕；应用后保存。'}</p>
          <p className="ml-source">{item.source.replace(/^Frameboard /, "CueFrame ")} · <a href={effectSources[item.source]} target="_blank" rel="noreferrer">来源与说明 ↗</a></p>
          {item.scope==='transition'&&<p className="muted">原切点后，以上一镜末帧衔接当前镜头。首镜从背景揭示；旁白和字幕不重排。</p>}
          {shot?.motionLibrary&&<div className="ml-applied"><h4>本镜已应用</h4>{shot.motionLibrary.template&&<button onClick={()=>choose(shot.motionLibrary.template.id,shot.motionLibrary.template.params)}>模板 · {libraryItem(shot.motionLibrary.template.id)?.name}</button>}
            {activeInstances.map(e=><div key={e.instanceId}><button onClick={()=>{choose(e.effectId,e.params,e.instanceId,e.targets);modeTo('current');}}>{libraryItem(e.effectId)?.name} · {e.targets.join('、')||'镜头衔接'}</button><button disabled={disabled} onClick={()=>apply('remove',{instanceId:e.instanceId})}>移除</button></div>)}
            <button disabled={disabled} onClick={()=>apply('restore')}><RotateCcw size={14}/> 还原应用前画面</button>
          </div>}
        </div>
        <div className="ml-settings"><label>应用到镜头<select value={sel||''} disabled={disabled} onChange={e=>select(e.target.value)}>{p.kind==='product'&&<option value="">加入新镜头（模板）</option>}{p.shots.map((s,i)=><option value={s.id} key={s.id}>{i+1}. {s.title||s.zh.slice(0,18)}</option>)}</select></label>
          {item.type==='effect'&&item.scope!=='transition'&&<label>目标对象<select multiple value={targets} onChange={e=>targetsTo([...e.target.selectedOptions].map(o=>o.value))} aria-label="目标对象">{nodes.map(n=><option key={n.id} value={n.id}>{n.text?.value||n.id}{n.id===shot.motionPlan.subjectId?'（主体）':''}</option>)}</select><small>可按 Ctrl 选择多个对象。主体持续可见。</small></label>}
          <div className="ml-param-grid">{item.fields.map(f=><label key={f.key}>{f.label}{f.type==='select'?<select value={params[f.key]} onChange={e=>paramsTo({...params,[f.key]:e.target.value})}>{f.options.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select>:f.type==='asset'?<select value={params[f.key]} onChange={e=>paramsTo({...params,[f.key]:e.target.value})}><option value="">选择已确认的图片</option>{images.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select>:<input type={f.type} value={params[f.key]??''} min={f.min} max={f.max} step={f.step} maxLength={f.maxLength} onChange={e=>paramsTo({...params,[f.key]:f.type==='number'?Number(e.target.value):e.target.value})}/>}</label>)}</div>
          {'from'in params&&<label>对齐已有字幕入点<select value={cueId} onChange={e=>{cueTo(e.target.value);const c=row?.captionCues[Number(e.target.value)];if(e.target.value!==''&&c){const from=c.from/p.fps,span=params.until-params.from;paramsTo({...params,from,until:Math.min(duration,from+span)});}}}><option value="">手动设定时间</option>{row?.captionCues.map((c,i)=><option key={i} value={i}>{(c.from/p.fps).toFixed(2)}s · {(c[p.voice]||c.zh||c.en||'字幕').slice(0,20)}</option>)}</select></label>}
          <button className="primary ml-apply" disabled={disabled} onClick={()=>apply(item.type==='template'?'template':'effect')}>{working?'正在保存…':item.type==='template'?'应用模板并保存':instanceId?'更新动效并保存':'应用动效并保存'}</button>
          {item.type==='template'&&p.kind==='product'&&<button disabled={disabled} onClick={()=>apply('template',{shotId:''})}>作为 6 秒新镜头加入分镜</button>}
          {item.type==='template'&&<small>模板会替换所选镜头的画面；可用“还原应用前画面”恢复。旁白与镜头时长沿用原项目。</small>}
          <div className="ml-save-preset"><label>个人模板名称<input value={name} maxLength={40} placeholder="例如：缓慢弧线移项" onChange={e=>nameTo(e.target.value)}/></label><button disabled={disabled||!state||!name.trim()} onClick={()=>localWork(async()=>{await preference({action:'preset',name,itemId:active,params,projectId:p.id});noticeTo('已保存到“我的收藏与模板”');})}><BookmarkPlus size={16}/> 保存为我的模板</button></div>
        </div>
      </div>
    </>}
  </section>;
}

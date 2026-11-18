import React,{useEffect,useMemo,useState} from 'react';
import {Player} from '@remotion/player';
import {MotionScene} from '../video/MotionScene';
import {Input,Select} from './fields';
import {contentGraph} from '../shared/content-contract.mjs';
import {semanticFamilies,compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {timeline} from '../shared/model.mjs';
import {actionTiming} from '../shared/action-timing.mjs';
import {semanticOptions} from '../shared/semantic-context.mjs';
import {SemanticSyncFields} from './QualityWorkbench';
import {ImageTextLayerEditor} from './ImageTextLayerEditor';
import {imageTextAssetIds} from '../shared/image-text-layers.mjs';
import {referenceStyleStatus} from '../shared/visual-style.mjs';

export function ContentBrief({p,set}) {
  const titles={audience:'谁来看',question:'希望解释的问题',takeaway:'看完应理解什么',prerequisites:'必要前提与已知知识',boundaries:'限定条件与不能推导的结论'};
  return <section className="panel content-brief"><h2>内容目标</h2><p className="muted">用于指导所有脚本与画面。项目中的限制只作用于本项目。</p><div className="content-brief-grid">
    {Object.entries(titles).map(([k,title])=><Input key={k} title={title} value={p.contentBrief?.[k]||''} onChange={value=>set({contentBrief:{...p.contentBrief,[k]:value}})}/>)}</div></section>;
}
export function ChangeImpact({p}) {
  const rows=p.changeImpact?.filter(v=>v.stages.length)||[];
  if(!rows.length)return null;
  return <details className="capability-panel"><summary>本次保存影响 {rows.length} 段 · 版本 {p.version}</summary>{rows.map(r=><p key={r.shotId}><b>{p.shots.find(s=>s.id===r.shotId)?.title||r.shotId}</b>：{r.reason}；需更新 {r.stages.join('、')}。{r.preserveAudio?'已有配音保留。':'原录音保留在历史版本，修改后的口播需重新配音。'}</p>)}</details>;
}
export function ContentTimeline({p}) {
  const graph=contentGraph(p),tl=timeline(p);
  if(!graph.events.length)return <p className="muted">生成节奏脚本后，这里按“原始状态 → 可见变化 → 结果”展示讲解过程。历史作品可继续查看。</p>;
  return <div className="content-events" aria-label="结构化讲解过程">{graph.events.map(e=>{
    const timing=actionTiming(p,e.shotId),row=tl.rows.find(r=>r.shot.id===e.shotId);
    return <article key={e.id}><b>{((row?.from||0)/p.fps+e.from).toFixed(2)}–{((row?.from||0)/p.fps+e.until).toFixed(2)} 秒</b>
      <p>{e.before} <span aria-hidden="true">→</span> {e.after}</p>
      <small>{e.entityIds.map(id=>graph.entities.find(v=>v.id===id)?.name).join(' · ')}</small>
      <p className="muted">声音依据：{e.cueIds?.map(id=>{const c=timing.speech.find(v=>v.id===id);return c?c.precision+' · '+c.text:id;}).join('；')}</p>
      {!!e.dependsOn?.length&&<small>承接事件：{e.dependsOn.join('、')}</small>}</article>;
  })}</div>;
}
const newItem=()=>({id:'e-'+crypto.randomUUID().slice(0,8),label:'',value:0});
const blank=()=>({version:1,family:'comparison',style:'editorial',title:'',unit:'',items:[newItem(),newItem()],edges:[],series:[{x:0,y:0},{x:1,y:0}],parameters:{}});
export function SemanticWorkbench({p,set,sel,busy}) {
  const s=p.shots.find(v=>v.id===sel)||p.shots[0];
  const [draft,D]=useState(()=>s?.semanticScene||blank()),[message,M]=useState('');
  useEffect(()=>{D(s?.semanticScene||blank());M('');},[s?.id,JSON.stringify(s?.semanticScene)]);
  const row=timeline(p).rows.find(r=>r.shot.id===s?.id),duration=row?row.frames/p.fps:6;
  const preview=useMemo(()=>{try{return {plan:compileSemanticScene(draft,semanticOptions(p,{...s,semanticScene:draft},row||{frames:duration*p.fps}))};}catch(error){return {error:error.message};}},[draft,p,s,row,duration]);
  if(!s)return null;
  const change=patch=>{D(v=>({...v,...patch}));M('');};
  const item=(index,patch)=>change({items:draft.items.map((v,i)=>i===index?{...v,...patch}:v),...(patch.id?{edges:draft.edges?.map(e=>({from:e.from===draft.items[index].id?patch.id:e.from,to:e.to===draft.items[index].id?patch.id:e.to}))}:{})});
  const family=semanticFamilies.find(v=>v.id===draft.family),numeric=['comparison','proportion','ratio'].includes(draft.family);
  const parameterNames={probability:{probability:'理论概率（0–1）',count:'样本数量（4–96）',seed:'固定随机种子'},optimization:{initial:'起始 x',rate:'学习步长（0.01–0.49）',steps:'迭代次数（2–12）'},physical:{initial:'起始位置',speed:'每秒速度'}}[draft.family];
  const needsItems=!['trend','probability','optimization','physical'].includes(draft.family);
  const identities=[...new Map(p.shots.flatMap(v=>v.semanticScene?.items||[]).map(v=>[v.id,v])).values()];
  return <details className="panel semantic-workbench"><summary>内容组件与连续预览 · {s.title||'当前段'}</summary>
    <p>用真实数据与对象建立这一段的画面。全部段落采用模型后，可直接本地生成样片；保留现有录音与历史视频。部分段落采用时，模型会约束后续动画生成。</p>
    <p className="muted">视觉风格：{referenceStyleStatus(p).source==='reference'?'跟随本期视觉参考':'未选择参考，采用默认风格'}。</p>
    <div className="content-brief-grid"><Select title="这段需要解释什么" value={draft.family} options={semanticFamilies.map(v=>[v.id,v.name+(v.status==='experimental'?' · 试验':'')])} onChange={family=>change({family})}/>
      <Input title="画面标题（可留空）" value={draft.title} onChange={title=>change({title})}/>
      <Input title="单位" value={draft.unit} onChange={unit=>change({unit})}/></div>
    <p className="muted">适用范围：{family.limit}。{family.status==='experimental'?'试验组件需逐片复核，不能视为通用科学模型。':''}</p>
    {needsItems&&<div className="semantic-items">{draft.items.map((v,i)=><div className="semantic-item" key={v.id}>
      <Input title={'对象 '+(i+1)} value={v.label} onChange={label=>item(i,{label})}/>
      {(p.filmStyle?.narrationFocus||p.filmStyle?.narrationMotion)&&<Input title="强调时对应的原台词（可留空）" value={v.focusQuote||''} onChange={focusQuote=>item(i,{focusQuote})}/>}
      {identities.length>0&&<Select title="对象身份" value={v.id} options={[[v.id,'当前对象：'+(v.label||'未命名')],...identities.filter(x=>x.id!==v.id&&!draft.items.some(other=>other.id===x.id)).map(x=>[x.id,'复用：'+x.label])]} onChange={id=>item(i,{id,label:identities.find(x=>x.id===id).label})}/>}
      {numeric&&<Input type="number" title="起始数值" value={v.value??''} onChange={value=>item(i,{value:value===''?null:Number(value)})}/>}
      {draft.family==='comparison'&&<Input inputMode="decimal" title="变化后（可留空）" value={v.to??''} onChange={value=>item(i,{to:value===''?undefined:Number(value)})}/>}
      {['narrative','product','image-text'].includes(draft.family)&&<Select title="已核对的图片" value={v.assetId||''} options={[["","选择素材"],...p.assets.filter(a=>a.kind==='image'&&a.confirmed&&a.source&&a.license).map(a=>[a.id,a.name])]} onChange={assetId=>item(i,{assetId:assetId||undefined,imageText:undefined})}/>}
      {v.assetId&&p.filmStyle?.narrationMotion&&<details><summary>讲到此图时观察哪里</summary><label className="alignment-confirm"><input type="checkbox" checked={Boolean(v.focus)} onChange={e=>item(i,{focus:e.target.checked?{x:50,y:50,zoom:1.6}:undefined})}/>按对应台词放大局部</label>{v.focus&&<><p className="muted">焦点使用图片窗口的百分比位置。先在预览中核对细节和裁切；原始图片保留。</p>{[['x','横向位置（%）',0,100],['y','纵向位置（%）',0,100],['zoom','放大倍数',1,4]].map(([k,title,min,max])=><Input key={k} type="number" min={min} max={max} step={k==='zoom'?'.1':'1'} title={title} value={v.focus[k]} onChange={value=>item(i,{focus:{...v.focus,[k]:value===''?null:Number(value)}})}/>)}</>}</details>}
      {v.assetId&&['narrative','product','image-text'].includes(draft.family)&&<ImageTextLayerEditor item={v} assets={p.assets} duration={duration} onChange={imageText=>item(i,{imageText})}/>}
      <button disabled={draft.items.length<=(draft.family==='image-text'?1:2)} onClick={()=>change({items:draft.items.filter((_,j)=>j!==i),edges:(draft.edges||[]).filter(e=>e.from!==v.id&&e.to!==v.id)})} aria-label={'移除对象 '+(i+1)}>移除</button>
    </div>)}<button disabled={draft.items.length>=(draft.family==='image-text'?1:6)} onClick={()=>change({items:[...draft.items,newItem()]})}>添加对象</button></div>}
    {['causal','network'].includes(draft.family)&&<div>{(draft.edges||[]).map((e,i)=><div className="semantic-item" key={i}>
      {['from','to'].map(k=><Select key={k} title={k==='from'?'从对象':'到对象'} value={e[k]} options={draft.items.map(v=>[v.id,v.label||'未命名对象'])} onChange={id=>change({edges:draft.edges.map((v,j)=>i===j?{...v,[k]:id}:v)})}/>)}
      <button onClick={()=>change({edges:draft.edges.filter((_,j)=>j!==i)})}>移除关系</button></div>)}<button onClick={()=>change({edges:[...(draft.edges||[]),{from:draft.items[0]?.id,to:draft.items[1]?.id}]})}>添加关系</button></div>}
    {draft.family==='trend'&&<div>{(draft.series||[]).map((v,i)=><div className="semantic-item" key={i}>{['x','y'].map(k=><Input key={k} title={k==='x'?'横轴数值':'纵轴数值'} type="number" value={v[k]} onChange={value=>change({series:draft.series.map((row,j)=>i===j?{...row,[k]:Number(value)}:row)})}/>)}<button disabled={draft.series.length<=2} onClick={()=>change({series:draft.series.filter((_,j)=>j!==i)})}>移除观测点</button></div>)}<button disabled={draft.series.length>=12} onClick={()=>change({series:[...draft.series,{x:draft.series.at(-1).x+1,y:0}]})}>添加观测点</button></div>}
    {parameterNames&&<div className="content-brief-grid">{Object.entries(parameterNames).map(([k,title])=><Input key={k} title={title} type="number" value={draft.parameters?.[k]??''} onChange={value=>change({parameters:{...draft.parameters,[k]:value===''?null:Number(value)}})}/>)}</div>}
    {preview.plan?<div className="semantic-preview"><Player component={MotionScene} inputProps={{plan:preview.plan,assets:p.assets}} durationInFrames={Math.max(1,Math.round(duration*p.fps))} compositionWidth={p.width} compositionHeight={p.height} fps={p.fps} controls errorFallback={({error})=><p role="alert">预览校验未通过：{error.message}</p>} style={{width:'100%',aspectRatio:`${p.width}/${p.height}`}}/><p className="muted">实际渲染组件 · {duration.toFixed(2)} 秒 · 预览无音轨；动作编排与正式审片仍需核对。</p></div>:<p role="status" className="hint">{preview.error}</p>}
    <button disabled={busy||!!preview.error} onClick={()=>{const shots=p.shots.map(v=>v.id===s.id?{...v,semanticScene:structuredClone(draft),reviewed:false,filmQA:[],motionReview:'',assetIds:[...new Set([...v.assetIds,...draft.items.flatMap(x=>[x.assetId,...imageTextAssetIds(x.imageText)]).filter(Boolean)])],continuity:v.continuity||{subject:draft.items.map(x=>x.label).join('、')||family.name,path:'由输入状态经过模型计算到结果，保持同一对象与尺度',camera:'固定构图，便于观察模型数值与几何变化',handoff:'按旁白顺序衔接前后段，明确对象与时间'}}:v);set({shots,...(shots.every(v=>v.semanticScene)?{productionMode:'model-process'}:{})});M('已加入当前草稿。全部段落采用模型时使用本地模型制作；现有配音保留，保存后可生成样片。');}}>采用本段内容模型</button>
    {s.semanticScene&&<button disabled={busy} onClick={()=>{set({productionMode:'standard',shots:p.shots.map(v=>v.id===s.id?{...v,semanticScene:undefined,reviewed:false}:v)});M('已从当前草稿取消模型；历史版本保留。');}}>取消本段模型</button>}
    {s.semanticScene&&<SemanticSyncFields {...{p,s,set}}/>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
export function CapabilityPanel(){
  const [runtime,R]=useState(null);
  useEffect(()=>{let live=true;fetch('/api/runtime').then(r=>r.json()).then(v=>live&&R(v)).catch(()=>{});return()=>{live=false;};},[]);
  return <details className="capability-panel"><summary>工作台能力与验证范围{runtime?.environment!=='production'&&runtime?.environment?' · 独立验证环境':''}</summary>
    <p>内容规则 v4 · 预览与生产共用渲染器 · 自动校验不代替正常速度看片与听音。</p>
    <div className="capability-grid">{semanticFamilies.map(f=><p key={f.id}><b>{f.name}</b><span>{f.status==='supported'?'可用 · 限定范围':'试验 · 需复核'}</span><small>{f.limit}</small></p>)}</div>
    <p className="muted">可用：中文原稿声学定位、逐字片段试听校准、词组显现与强调、图片局部观察和同对象镜间交接。图片原有文字可用无字底图与透明文字层分别控制。本地三维提供简单立方晶格、肺泡交换示意和限定条件下的圆管层流；可导入生成式视频并裁切、配音和导出。任意图片自动拆字、通用医学解剖、湍流及任意三维模型仍需专门制作和验证。机器定位与校准不自动授予听审通过。</p>
  </details>;
}

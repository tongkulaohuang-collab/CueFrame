import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Select} from './fields';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {imageBoxOK,mediaBox,projectImageGallery,shotImagePlan} from '../shared/shot-images.mjs';
import {MotionArtwork} from '../video/MotionScene';

export function measureImageBox(node) {
  if(!node?.paths?.length)return mediaBox(node?.media)||null;
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none';
  const group=document.createElementNS(ns,'g');
  svg.append(group);
  for(const p of node.paths){
    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',p.d);
    group.append(path);
  }
  document.body.append(svg);
  try {
    const {x,y,width,height}=group.getBBox();
    const box={x,y,width:Math.max(width,1),height:Math.max(height,1)};
    return imageBoxOK(box)?box:null;
  }finally{svg.remove();}
}

const frameKinds = {
  reference:'参考片', poster:'风格封面', 'reference-image':'项目参考图',
  character:'人物参考', composition:'构图参考',
};
function imageCaption(image) {
  return [frameKinds[image.kind], image.numbers?.length ? '第 '+image.numbers.join('、')+' 镜' : '']
    .filter(Boolean).join(' · ');
}

function ImageCards({images,onPreview}) {
  return <div className="reference-image-grid">{images.map(image => {
    const caption = imageCaption(image);
    return <button type="button" className="reference-image-card" key={image.url}
      aria-haspopup="dialog" aria-label={'放大查看 '+image.label} onClick={event=>onPreview(image,event.currentTarget)}>
      <img loading="lazy" src={image.url} alt={image.label}/>
      <span><strong>{image.label}</strong>{caption && <small>{caption}</small>}</span>
    </button>;
  })}</div>;
}

function ImagePreview({image,close}) {
  const dialog = useRef(null);
  useEffect(()=>{
    const node = dialog.current;
    node.showModal();
    return ()=>node.close();
  },[]);
  return <dialog className="reference-image-preview" ref={dialog}
    aria-label={image.label} onCancel={close}>
    <header><div><strong>{image.label}</strong><small>{imageCaption(image)}</small></div>
      <button type="button" autoFocus onClick={close}>关闭大图</button></header>
    <img src={image.url} alt={image.label}/>
  </dialog>;
}

export function StyleFrames({p,focus,request,onFrames}) {
  const {references,used} = useMemo(()=>projectImageGallery(p,focus),[p,focus]);
  const [preview,setPreview] = useState(null);
  const opener = useRef(null);
  const openPreview = (image,button)=>{opener.current=button;setPreview(image);};
  const closePreview = ()=>{
    setPreview(null);
    requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));
  };
  const [result,setResult] = useState(null);
  const path = p.version && '/api/projects/'+p.id+'/image-frames?version='+p.version+
    (focus?'&shotId='+encodeURIComponent(focus):'&scope=all');
  useEffect(()=>{
    let live = true;
    onFrames?.([]);
    if (path) request(path).then(frames=>{
      if (live) {setResult({path,frames});onFrames?.(frames);}
    }).catch(e=>{if(live)setResult({path,error:e.message});});
    return ()=>{live=false;};
  },[path,request,onFrames]);
  const current = result?.path === path ? result : null;
  const frames = current?.frames || [];
  const referenceUrls = new Set(references.map(image=>image.url));
  const referenceImages = [...frames.filter(f=>f.kind!=='sample'&&!referenceUrls.has(f.url)), ...references];
  const samples = frames.filter(f=>f.kind==='sample').sort((a,b)=>
    p.shots.findIndex(s=>s.id===a.shotId)-p.shots.findIndex(s=>s.id===b.shotId) || a.time-b.time);
  const previewVisible = preview && [...referenceImages,...used,...samples].some(f=>f.url===preview.url);
  if (!path && !references.length && !used.length) return null;
  return <section className="reference-image-gallery" aria-label={focus?'本镜图片参考':'图片参考与镜头用图'}>
    <h4>{focus?'本镜图片参考':'图片参考'}</h4>
    {referenceImages.length>0 && <ImageCards images={referenceImages} onPreview={openPreview}/>}
    {path && !current && <p className="muted" role="status">正在读取参考画面…</p>}
    {current?.error && <p role="status">参考画面读取失败 · {current.error}</p>}
    {(!path || current?.frames) && !referenceImages.length && <p className="muted">还没有图片参考。</p>}
    {used.length>0 && <><h4>已用于镜头的图片</h4><ImageCards images={used} onPreview={openPreview}/></>}
    {!focus && samples.length>0 && <details><summary>查看样镜帧（{samples.length}）</summary>
      <ImageCards images={samples} onPreview={openPreview}/></details>}
    {previewVisible && <ImagePreview image={preview} close={closePreview}/>}
  </section>;
}

export function ShotImagePicker({p,shotId,item,targetNodeId,frames,run,saved,request,load,busy,openSample}) {
  const shot=p.shots.find(s=>s.id===shotId);
  const target=item?.imageTargets?.find(t=>t.shotId===shotId&&t.nodeId===targetNodeId);
  const nodes=(shot?.motionPlan?.nodes||[]).filter(n=>(n.paths.length||n.media)&&(!n.rig||shot.motionPlan.actors?.some(a=>a.parts.some(p=>p.nodeId===n.id&&p.replaceable))));
  const images=p.assets.filter(a=>a.kind==='image'&&motionImageAsset(p,a.id));
  const recommended=images.find(a=>item&&a.generation?.planId&&a.generation.itemId===item.id)||images.find(a=>item?.assetIds?.includes(a.id));
  const [nodeChoice,setNode]=useState(''),[assetChoice,setAsset]=useState('');
  const nodeId=nodeChoice||target?.nodeId||(nodes.some(n=>n.id===shot?.motionPlan?.subjectId)?shot.motionPlan.subjectId:nodes[0]?.id);
  const node=nodes.find(n=>n.id===nodeId);
  const actor=shot?.motionPlan?.actors?.find(a=>a.id===node?.rig?.actorId);
  const partBinding=actor?{scope:'part',actorId:actor.id,partId:node.rig.partId,designVersion:actor.version}:{};
  const binding=shot?.imageBindings?.find(b=>b.nodeId===nodeId);
  const asset=images.find(a=>a.id===(assetChoice||binding?.assetId||recommended?.id))||images[0];
  const [box,setBox]=useState(null);
  useEffect(()=>{setBox(node?measureImageBox(node):null);},[node]);
  if(!shot||shot.processVideoId||(!target&&!nodes.length))return null;
  const label=target?.nodeId===nodeId?target.label:binding?.label||nodeId;
  const fit=frames.find(f=>f.kind!=='sample');
  const applied=!!asset&&binding?.assetId===asset.id;
  const change=remove=>run(async()=>{
    const q=await saved();
    load(await request('/api/projects/'+q.id+'/shot-image',{version:q.version,shotId,nodeId,
      itemId:item?.id,label,assetId:asset?.id,box,remove,...partBinding}));
  });
  return <div className="shot-image-picker">
    {target&&<p><b>{target.label}</b> · 本镜 {target.time.toFixed(2)} 秒<br/>{target.styleMatch}</p>}
    {nodes.length>0&&!target&&<Select title="替换的画面对象" value={nodeId} options={nodes.map(n=>[n.id,shot.imageBindings?.find(b=>b.nodeId===n.id)?.label||n.id])} onChange={n=>{setNode(n);setAsset('');}}/>}
    {actor&&<p>此处只替换「{node.rig.partId}」部件的外观。请选择对应部位的图片，关节和动作会保留。</p>}
    {!!images.length&&<Select title="使用的图片" value={asset?.id||''} options={images.map(a=>[a.id,a.name])} onChange={setAsset}/>}
    {asset&&<div className="shot-image-compare">
      {fit&&<figure><img src={fit.url} alt={fit.label}/><figcaption>{fit.label}</figcaption></figure>}
      <figure>{node&&box ? <MotionArtwork plan={shotImagePlan(shot.motionPlan,[...(shot.imageBindings||[]).filter(b=>b.nodeId!==nodeId),{nodeId,assetId:asset.id,box,...partBinding}])}
        time={Math.min(target?.time??Math.min(1,shot.motionPlan.duration/2),shot.motionPlan.duration)} assets={p.assets} label={'换图预览 · '+label}/> : <img src={asset.src} alt={asset.name}/>}
        <figcaption>{node?'换图后的镜头预览':'候选图片'} · {asset.name}</figcaption></figure>
    </div>}
    {images.length===0&&<p className="muted">生成或导入图片后，可在这里和参考画面对照并用于本镜。</p>}
    <div className="inline">
      {asset&&<button className="primary" disabled={busy||applied||!!node&&!box} onClick={()=>change(false)}>{applied?'已用于本镜':'用于本镜'}</button>}
      {binding&&<button disabled={busy} onClick={()=>change(true)}>解除此图</button>}
      {binding&&<button onClick={()=>openSample(shotId)}>查看有声样片 →</button>}
    </div>
    {binding&&<p role="status">第 {p.shots.indexOf(shot)+1} 镜 · {label} · {p.assets.find(a=>a.id===binding.assetId)?.name}。{node?'重新生成样镜后可播放新版。':'制作动画时将使用此图。'}</p>}
  </div>;
}

export function ImportSourceImage({p,source,busy,run,saved,request,load}) {
  const [open,setOpen]=useState(false),[rights,setRights]=useState(source.rights||''),[confirmed,confirm]=useState(false),[url,setUrl]=useState('');
  if(source.kind!=='图片')return null;
  const existing=p.assets.find(a=>a.imageSource?.url===source.url&&a.imageSource.locator===source.locator);
  if(existing)return <figure className="imported-image"><img loading="lazy" src={existing.src} alt={existing.name}/><figcaption>已入库 · {existing.name}</figcaption></figure>;
  return <div className="import-source-image">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>导入这张原图</button>
    {open&&<div>
      {source.mediaUrl?<a href={source.mediaUrl} target="_blank" rel="noreferrer">预览原图 ↗</a>:<label>原图直链<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="从原始出处复制图片地址"/></label>}
      <label>使用条件与署名<input value={rights} onChange={e=>{setRights(e.target.value);confirm(false);}}/></label>
      <label><input type="checkbox" checked={confirmed} onChange={e=>confirm(e.target.checked)}/> 我已核对本片可按上述条件使用原图</label>
      <button className="primary" disabled={busy||!confirmed||!rights.trim()||!(source.mediaUrl||url.trim())} onClick={()=>run(async()=>{
        const q=await saved();
        load(await request('/api/projects/'+q.id+'/source-image',{version:q.version,url:source.url,locator:source.locator,mediaUrl:url,license:rights,confirmed}));
      })}>确认导入素材库</button>
    </div>}
  </div>;
}

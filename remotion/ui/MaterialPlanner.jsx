import {IssueNotice} from './IssueNotice';
import React,{useMemo,useState} from 'react';
import {Search} from 'lucide-react';
import {jobTime} from '../shared/science-task-status.mjs';
import {ResearchSource,SearchJob,searchPending} from './TopicResearch';
import {currentMaterialPlan,savedMaterialPlan,materialAsset,canGenerateMaterial,materialJobActive} from '../shared/material-plan.mjs';
import {StyleFrames,ShotImagePicker,ImportSourceImage} from './ShotImages';
import {Select} from './fields';
const modes={reuse:'复用现有素材',generate:'可用 Codex 生成',source:'需要真实资料',procedural:'用动画或代码制作'};
const priorities={required:'必要',recommended:'建议',optional:'可选'};
export function MaterialPlanner({p,ai,tasks,busy,dirty,run,request,load,saved,refreshJobs,sel,select,openSample}) {
  const [frames,setFrames]=useState([]);
  const current=currentMaterialPlan(p),plan=savedMaterialPlan(p),stale=!!plan&&!current;
  const active=tasks.find(j=>materialJobActive(j,p.version));
  const batch=tasks.find(j=>j.task==='material-supplement'&&j.planId===plan?.id);
  const pending=current?.items.some(item=>canGenerateMaterial(item)&&!materialAsset(p,item.id,current));
  const analysis=tasks.find(j=>j.task==='materials'&&!j.shotId);
  const imageAnalysis=tasks.find(j=>j.task==='shot-images');
  const planJob=plan&&tasks.find(j=>j.task==='materials'&&j.result?.[0]?.id===plan.id);
  const search=tasks.find(j=>j.task==='research'&&j.researchScope==='visuals');
  const searchable=!!(p.topic.trim()||p.script.trim());
  const savedSources=(p.researchSources||[]).filter(m=>['图片','视频','数据'].includes(m.kind));
  const imagePlans=useMemo(()=>p.shots.map((s,i)=>({shot:s,number:i+1,plan:savedMaterialPlan(p,s.id),current:currentMaterialPlan(p,s.id)})),[p]);
  const analyzed=imagePlans.filter(row=>row.current).length;
  const replaceable=p.shots.filter(s=>!s.processVideoId&&s.motionPlan?.nodes.some(n=>n.paths.length||n.media));
  const selected=replaceable.find(s=>s.id===sel)||replaceable[0];
  const cardProps={p,tasks,ai,busy,dirty,active,search,frames,run,saved,request,load,openSample};
  return <section id="material-planner" className="material-planner" aria-label="AI 素材分析">
    <div className="material-plan-heading"><div><h3>AI 分析素材需求</h3>
      <p className="muted">结合本期口播、已核实资料、视觉风格和现有素材，判断是否需要补图以及具体用途。</p></div>
      <button disabled={busy||!!active||!searchable} onClick={()=>ai('materials')}>
        {active?.task==='materials'&&active.status==='running'?'正在分析素材…':plan?'重新分析素材需求':'AI 分析素材需求'}</button>
      {plan&&<button type="button" disabled={busy||!!active||!pending}
        onClick={()=>ai('material-supplement')}>{batch?.status==='running'?'正在补充素材…':'AI 帮我补充素材'}</button>}
      <button type="button" className="primary" disabled={busy||!searchable||searchPending(search,p.version,dirty)}
        onClick={()=>ai('research',{researchScope:'visuals'})}><Search size={16} aria-hidden="true"/>{search?.status==='running'?'正在联网找素材…':'AI 帮我找素材'}</button></div>
    <p className="muted material-usage">{searchable?'AI 可按当前口播和素材需求联网找图片、视频和原始数据。搜索、分析和生成使用本机 Codex 账户额度。':'先填写本期选题或口播稿，即可联网找素材。'}</p>
    {search&&<SearchJob key={search.id} j={search} {...{p,tasks,dirty,busy,run,request,load,refreshJobs}}/>}
    {savedSources.length>0&&<details open={search?.status==='applied' || undefined}><summary>本期已保存的素材出处（{savedSources.length}）</summary>
      {savedSources.map(m=><div key={m.url+m.locator}><ResearchSource m={m}/><ImportSourceImage source={m} {...{p,busy,run,saved,request,load}}/></div>)}</details>}
    <section id="shot-image-analysis" className="shot-image-analysis"><div className="material-plan-heading">
      <h4>图像素材分析</h4>
      <button type="button" className="primary" disabled={busy||!!active||!p.shots.length} onClick={()=>ai('shot-images')}>
        {imageAnalysis?.status==='running'?'正在分析所有镜头…':'分析所有镜头的图像素材'}</button></div>
      <p className="muted" role="status">{imageAnalysis?.status==='running'?imageAnalysis.step||'正在读取全部镜头和风格参考':
        p.shots.length?'共 '+p.shots.length+' 镜'+(analyzed?' · 已分析 '+analyzed+' 镜':''):'添加镜头后即可分析图像素材。'}</p>
      <StyleFrames {...{p,request}} onFrames={setFrames}/>
      {imageAnalysis?.status==='failed'&&<IssueNotice area="全片图像素材分析" job={imageAnalysis} error={imageAnalysis.error}/>}
      {imageAnalysis?.status==='failed'&&imageAnalysis.version===p.version&&imageAnalysis.result?.length>0&&
        <p className="muted">已保留 {imageAnalysis.result.length} 镜的结果，再次分析会从剩余镜头继续。</p>}
      {imagePlans.filter(row=>row.plan).map(({shot,number,plan:shotPlan,current:currentShotPlan})=>
        <details key={shot.id} className="shot-image-result"><summary>第 {number} 镜 · {shot.title} · {currentShotPlan?(shotPlan.items.length?shotPlan.items.length+' 项建议':'无需补图'):'待重新分析'}</summary>
          <p>{shotPlan.summary}</p>
          {currentShotPlan&&shotPlan.items.filter(i=>canGenerateMaterial(i)&&!materialAsset(p,i.id,currentShotPlan)).length>1&&
            <button disabled={busy||!!active} onClick={()=>ai('material-supplement',{shotId:shot.id})}>补充本镜所有建议图片</button>}
          <MaterialItems {...cardProps} plan={shotPlan} current={currentShotPlan} batch={tasks.find(j=>j.task==='material-supplement'&&j.planId===shotPlan.id)}/>
        </details>)}
      {selected&&<details><summary>从素材库替换镜头对象</summary>
        <Select title="换图的镜头" value={selected.id} options={replaceable.map(s=>[s.id,'第 '+(p.shots.indexOf(s)+1)+' 镜 · '+s.title])} onChange={select}/>
        <ShotImagePicker key={selected.id} shotId={selected.id} {...{p,frames,run,saved,request,load,busy,openSample}}/></details>}
    </section>
    {plan&&<p role="status"><b>{stale?'上次素材需求分析':'已保存的素材需求分析'} · {plan.items.length} 项建议</b>{planJob&&' · '+jobTime(planJob.approvedAt||planJob.created)}</p>}
    {active?.status==='unknown'&&<IssueNotice area="素材生成" job={active} error={active.error||'本次请求的结果待核对。'}/>}
    {analysis?.status==='failed'&&<IssueNotice area="素材分析" job={analysis} error={analysis.error}/>}
    {stale&&<p role="status" className="hint">口播、资料、风格或素材已变化，请重新分析后再补充素材。以下保留上次建议供参考。</p>}
    {plan&&<><p className="material-plan-summary"><b>整期素材建议　</b>{plan.summary}</p>
      {!plan.items.length&&<p className="muted">无需额外补充图片，可继续制作节奏脚本。</p>}
      <MaterialItems {...cardProps} {...{plan,current,batch}}/></>}
  </section>;
}

function MaterialItems({plan,current,batch,p,tasks,ai,busy,dirty,active,search,frames,run,saved,request,load,openSample}) {
  const stale=!current,batchRunning=batch?.status==='running',prepared=batch?.result||[];
  const automatic=plan.items.filter(canGenerateMaterial),pending=automatic.filter(i=>!materialAsset(p,i.id,current));
  const sources=plan.items.filter(item=>item.mode==='source').length;
  return <>
    {current&&batch?.itemError&&['ready','applied'].includes(batch.status)&&pending.length>0&&<p className="reference-problem" role="alert">补充素材部分完成，已生成 {prepared.length} 项。{batch.itemError}</p>}
    {current&&(!plan.focusShotId||batch)&&<p className="muted" role="status">{batchRunning?
      `本次已生成 ${prepared.length} 项。${batch.step||'正在准备'}`:
      batch?.status==='failed'&&pending.length?`上次补充已停止，仍有 ${pending.length} 项待生成。`:
      pending.length?`可补充 ${pending.length} 项图片或动画，完成后自动加入素材库。`:
      automatic.length?'可生成的素材已全部加入素材库。':'当前没有需要 AI 生成的素材。'}
      {sources>0&&` 另有 ${sources} 项需要原始资料，可用「AI 帮我找素材」联网查找。`}</p>}
    <div className="material-plan-list">{plan.items.map(item=>{
        const asset=materialAsset(p,item.id,current),j=tasks.find(j=>j.task==='material-image'&&j.materialId===item.id);
        const inProgress=batch?.currentItem===item.id;
        return <article className="material-plan-item" key={item.id}>
          <div className="material-plan-heading"><h4>{item.title}</h4><span>{priorities[item.priority]} · {modes[item.mode]}</span></div>
          <p>{item.reason}</p><p><b>用途：</b>{item.usage}</p>
          {item.shotIds.length>0&&<p className="muted">用于 {item.shotIds.map(id=>'第 '+(p.shots.findIndex(s=>s.id===id)+1)+' 段').join('、')}</p>}
          <p className="muted"><b>需留意：</b>{item.checks}</p>
          {item.mode==='reuse'&&<p>已有素材：{item.assetIds.map(id=>p.assets.find(a=>a.id===id)?.name||'已移除').join('、')}</p>}
          {item.mode==='source'&&<p className="muted">可用「AI 帮我找素材」查找原始出处，也可在下方上传手头的原件。</p>}
          {current&&canGenerateMaterial(item)&&!asset&&batch&&<p className="muted">
            {inProgress&&batch.itemError?'本项未完成：'+batch.itemError:
              inProgress&&batch.status==='unknown'?'本项结果待核对':
              inProgress&&batchRunning?'正在生成':
              prepared.some(a=>a.generation.itemId===item.id)?'已生成，等待加入素材库':
              batchRunning?'等待生成':'待补充'}
          </p>}
          {item.mode==='procedural'&&(asset?<figure><video controls playsInline preload="metadata" poster={asset.poster} src={asset.src} aria-label={item.title}/>
            <figcaption>已加入素材库 · 动画素材</figcaption><a href={asset.src} download={asset.name}>下载动画</a></figure>:
            <p className="muted">可用「AI 帮我补充素材」制作此项动画。</p>)}
          {(item.mode==='generate'||item.imageTargets?.length>0&&item.mode!=='procedural')&&<>{item.mode!=='source'&&<><details><summary>查看图片生成描述</summary><p>{item.prompt||item.usage}</p></details>
            {asset?<figure><img src={asset.src} alt={item.title}/><figcaption>已加入素材库 · AI 示意素材，不作为科学证据</figcaption>
              <a href={asset.src} download={asset.name}>下载图片</a></figure>:
              <button disabled={busy||!!active||stale} onClick={()=>ai('material-image',{materialId:item.id})}>
                {j?.status==='running'?'正在生成图片…':j?.status==='ready'&&j.version===p.version?'正在加入素材库…':'用 Image2 生成图片'}</button>}</>}
            <button disabled={busy||stale||searchPending(search,p.version,dirty)} onClick={()=>ai('research',{researchScope:'visuals',materialId:item.id})}>网上找这项图片</button>
            {current&&item.imageTargets?.map(t=><ShotImagePicker key={item.id+t.shotId+t.nodeId} shotId={t.shotId} targetNodeId={t.nodeId} {...{p,item,frames,run,saved,request,load,busy,openSample}}/>)}
            {!asset&&j?.status==='failed'&&<IssueNotice area="素材图片生成" job={j} error={j.error}/>}
            {j?.status==='ready'&&j.version!==p.version&&<p role="status">图片已生成，但当前草稿已改变；结果保留在下方任务记录中，未覆盖新版本。</p>}
          </>}
        </article>;
      })}</div></>;
}

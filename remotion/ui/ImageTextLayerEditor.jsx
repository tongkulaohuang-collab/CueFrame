import React from 'react';
import {Input,Select} from './fields';
export function ImageTextLayerEditor({item,assets,duration,onChange}){
 const spec=item.imageText,images=assets.filter(a=>a.kind==='image'&&a.confirmed&&a.source&&a.license&&a.id!==item.assetId),options=[['','选择分层素材'],...images.map(a=>[a.id,a.name])];
 const update=patch=>onChange({...spec,...patch,confirmed:false});
 return <details><summary>图片中的文字单独动效</summary>
  <p className="muted">需提供同尺寸无字底图与透明文字 PNG，文字层保留原位置。原图用于对照；背景、图形和文字分别控制。复杂背景须先完成真实拆层。</p>
  {!spec?<button type="button" onClick={()=>onChange({version:1,sourceAssetId:item.assetId,cleanAssetId:'',confirmed:false,note:'',regions:[]})}>设置分层素材</button>:<>
   <Select title="无字底图" value={spec.cleanAssetId} options={options} onChange={cleanAssetId=>update({cleanAssetId})}/>
   {spec.regions.map((r,i)=><fieldset key={r.id}><legend>文字层 {i+1}</legend>
    <Input title="原图中的文字（核对用）" value={r.label} onChange={label=>update({regions:spec.regions.map((v,j)=>i===j?{...v,label}:v)})}/>
    <Select title="透明文字 PNG" value={r.assetId} options={options} onChange={assetId=>update({regions:spec.regions.map((v,j)=>i===j?{...v,assetId}:v)})}/>
    <div className="content-brief-grid">{[['from','出现时间（秒）'],['until','退场结束（秒）'],['fade','淡入淡出（秒）'],['scale','强调倍数（1–1.2）']].map(([k,title])=><Input key={k} title={title} type="number" step="0.05" value={r[k]} onChange={value=>update({regions:spec.regions.map((v,j)=>i===j?{...v,[k]:Number(value)}:v)})}/>)}
    {['x','y'].map(k=><Input key={k} type="number" title={'强调中心 '+k+'（原图 %）'} value={r.pivot[k]} min="0" max="100" onChange={value=>update({regions:spec.regions.map((v,j)=>i===j?{...v,pivot:{...v.pivot,[k]:Number(value)}}:v)})}/>)}</div>
    <button type="button" onClick={()=>update({regions:spec.regions.filter((_,j)=>i!==j)})}>移除本层</button>
   </fieldset>)}
   <button type="button" disabled={spec.regions.length>=12} onClick={()=>update({regions:[...spec.regions,{id:'text-'+crypto.randomUUID().slice(0,8),label:'',assetId:'',from:0,until:duration,fade:.3,scale:1,pivot:{x:50,y:50}}]})}>添加文字层</button>
   <Input title="拆层核对记录" value={spec.note} onChange={note=>update({note})}/>
   <label><input type="checkbox" checked={spec.confirmed} onChange={e=>onChange({...spec,confirmed:e.target.checked})}/>已对照原图核对透明背景、字形、位置与含义</label>
   <button type="button" onClick={()=>onChange(undefined)}>取消分层，恢复原图</button>
  </>}
 </details>;
}

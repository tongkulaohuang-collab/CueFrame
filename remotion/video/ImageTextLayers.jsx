import React from 'react';
import {Img} from 'remotion';
import {imageTextLayerState} from '../shared/image-text-layers.mjs';

export function ImageTextLayers({spec,assets,base,time,renderVideo,style,width,height}){
  const Picture=renderVideo?Img:'img';
  const asset=id=>assets.find(a=>a.id===id);
  const imageStyle={position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',display:'block'};
  const a=asset(spec.cleanAssetId),w=Math.min(width,height*a.width/a.height),h=w*a.height/a.width;
  return <div style={{...style,position:'relative',objectFit:undefined}}><div data-image-text-layers="true" style={{position:'absolute',width:w,height:h,left:(width-w)/2,top:(height-h)/2}}>
    <Picture src={base+asset(spec.cleanAssetId).src} alt="" style={imageStyle}/>
    {spec.regions.map(r=>{const f=imageTextLayerState(r,time);return <Picture key={r.id} data-text-layer={r.id} src={base+asset(r.assetId).src} alt="" style={{...imageStyle,opacity:f.opacity,transform:`scale(${f.scale})`,transformOrigin:`${r.pivot.x}% ${r.pivot.y}%`}}/>;})}
  </div></div>;
}

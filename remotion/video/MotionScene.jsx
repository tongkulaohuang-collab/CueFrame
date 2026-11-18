import React,{useId,useRef} from 'react';
import {Img,Freeze,OffthreadVideo,useCurrentFrame,useVideoConfig} from 'remotion';
import {motionAt} from '../shared/motion-plan.mjs';
import {cameraAt} from '../shared/camera-plan.mjs';
import {motionFonts,motionImageAsset,motionMediaFrame} from '../shared/motion-dynamics.mjs';
import {LibraryNode} from './LibraryEffects';
import {useMeasuredLayout} from './MeasuredLayout';
import {focusOpacity} from '../shared/presentation-plan.mjs';
import {worldState,screenPoint} from '../shared/actor-rig.mjs';
import {ImageTextLayers} from './ImageTextLayers';
import {nodePathBounds} from '../shared/coverage-geometry.mjs';

export function MotionScene({plan,assets=[],base=''}) {
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  return <MotionArtwork plan={plan} time={Math.min(plan.duration,frame/fps)} fps={fps} assets={assets} base={base} renderVideo/>;
}
export function MotionArtwork({plan,time=0,fps=24,label,assets=[],base='',renderVideo=false}) {
  const root=useRef(null),connectors=useMeasuredLayout(root,plan,time);
  const camera=cameraAt(plan,time);
  const state=worldState(plan,time);
  const grain='paper-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
  return <svg ref={root} role={label?'img':undefined} aria-label={label} width="100%" height="100%" viewBox={`0 0 ${plan.width} ${plan.height}`} style={{background:plan.bg}}>
    {connectors.map(c=><path key={c.id} d={c.d} fill="none" stroke={c.color} strokeWidth={c.strokeWidth} strokeLinejoin="round"/>)}
    <g transform={`translate(${plan.width/2} ${plan.height/2}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}>
      {plan.nodes.map(n=>{
        const f=state.get(n.id),asset=n.media&&motionImageAsset({assets},n.media.assetId);
        return <g key={n.id} data-motion-node={n.id} transform={`matrix(${f.matrix.join(' ')})`} opacity={f.opacity*focusOpacity(plan,n.id,time)}>
          <LibraryNode node={n} plan={plan} time={time} fps={fps} draw={f.draw??1}>
          {f.graphics.paths.map((path,i)=><path key={i} d={path.d} fill={path.fill} stroke={path.stroke} strokeWidth={path.strokeWidth}
            {...(f.draw!=null?{pathLength:1,strokeDasharray:1,strokeDashoffset:1-f.draw,fillOpacity:f.draw}:{})}/>)}
          {asset&&<foreignObject x={n.media.x ?? -n.media.width/2} y={n.media.y ?? -n.media.height/2} width={n.media.width} height={n.media.height} opacity={f.draw??1}>
            <div style={{width:'100%',height:'100%',overflow:'hidden',clipPath:n.media.mask==='circle'?'circle(50%)':n.media.mask==='slant'?'polygon(9% 0,100% 0,91% 100%,0 100%)':undefined,filter:n.media.print?'grayscale(1) sepia(.2) contrast(1.22)':undefined}}>
            {(()=>{const g=f.graphics,style={display:'block',width:'100%',height:'100%',objectFit:n.media.fit,objectPosition:`${g.focusX}% ${g.focusY}%`,transform:`scale(${g.mediaZoom})`,transformOrigin:`${g.focusX}% ${g.focusY}%`};return n.media.imageText?<ImageTextLayers spec={n.media.imageText} width={n.media.width} height={n.media.height} {...{assets,base,time,renderVideo,style}}/>:asset.kind==='video'&&renderVideo?<Freeze frame={motionMediaFrame(n.media,asset,time,fps)}><OffthreadVideo muted src={base+asset.src} style={style}/></Freeze>:renderVideo?<Img src={base+asset.src} alt="" style={style}/>:<img src={base+(asset.kind==='video'?asset.poster:asset.src)} alt="" style={style}/>;})()}
            </div>
          </foreignObject>}
          </LibraryNode>
        </g>;
      })}
    </g>
    {plan.printTexture&&<><defs><filter id={grain}><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" seed="17" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width={plan.width} height={plan.height} filter={`url(#${grain})`} opacity=".075" style={{mixBlendMode:'multiply',pointerEvents:'none'}}/></>}
    {plan.annotations.filter(a=>time>=a.from&&time<a.until).map((a,i)=>{
      const n=plan.nodes.find(n=>n.id===a.nodeId),f=state.get(n.id),origin=state.point(n.id,n.rig?.pivot);
      const bounds=nodePathBounds(n,time,plan),observed=bounds?state.point(n.id,{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}):origin;
      const {x:objectX,y:objectY}=screenPoint(plan,camera,observed);
      if(plan.cameraShots&&(f.opacity<.05||objectX<0||objectX>plan.width||objectY<0||objectY>plan.height*.86))return null;
      const anchor=n.rig?state.point(n.id,{x:(n.rig.pivot.x||0)+a.x,y:(n.rig.pivot.y||0)+a.y}):{x:origin.x+a.x,y:origin.y+a.y};
      const {x,y}=screenPoint(plan,camera,anchor);
      const fontSize=Math.max(18,plan.height*.028);
      // Use the same 2.5% safe edge as measured layout. The conservative glyph
      // width prevents clamping an otherwise valid note into that forbidden edge.
      const margin=plan.cameraShots?Math.min(plan.width/2-24,Math.max(24,plan.width*.025+4)+[...a.text].length*fontSize/2):30;
      return <g key={i} data-label-placement=""><text x={Math.max(margin,Math.min(plan.width-margin,x))} y={Math.max(fontSize+Math.max(12,plan.height*.025+4),Math.min(plan.height*(plan.cameraShots?.length ? .75 : .8),y))}
        textAnchor="middle" fill="#ffffff" stroke="#07111f" strokeWidth={3} paintOrder="stroke"
        fontFamily="Microsoft YaHei, sans-serif" fontSize={fontSize}>{a.text}</text></g>;
    })}
  </svg>;
}

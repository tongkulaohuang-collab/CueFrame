import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import {browserPath} from './media.mjs';
import {data} from './store.mjs';

// Runs in an offline browser. Parse inert XML and admit only drawing primitives
// and their timed changes before attaching the drawing to the document.
function mountDrawing({svg,width,height}) {
  if(/<!DOCTYPE|<!ENTITY|<\?/i.test(svg))throw Error('SVG 只能包含图形元素');
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  const root=doc.documentElement,ns='http://www.w3.org/2000/svg';
  if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!==ns)throw Error('动画图形不是有效的 SVG');
  const elements=[root,...root.querySelectorAll('*')];
  if(elements.length>1500)throw Error('单项素材的图形过多');
  const allowedTags=new Set('svg g defs title desc path rect circle ellipse line polyline polygon text tspan clipPath linearGradient radialGradient stop marker animate animateTransform'.split(' '));
  const animated=new Set('opacity fill-opacity stroke-opacity stroke-dashoffset stroke-width x y x1 x2 y1 y2 cx cy r rx ry width height d points fill stroke transform'.split(' '));
  const allowedAttrs=new Set(('xmlns viewBox preserveAspectRatio id class role aria-label aria-hidden transform x y dx dy x1 x2 y1 y2 width height cx cy r rx ry d points '+
    'fill stroke fill-rule clip-rule fill-opacity stroke-opacity opacity stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset pathLength '+
    'font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline letter-spacing word-spacing paint-order vector-effect textLength lengthAdjust '+
    'clip-path clipPathUnits gradientUnits gradientTransform offset stop-color stop-opacity fx fy marker-start marker-mid marker-end markerWidth markerHeight refX refY orient markerUnits '+
    'attributeName type values from to by begin dur end repeatCount keyTimes calcMode keySplines additive accumulate').split(' '));
  const clocks=/^\s*\d*\.?\d+(?:ms|s)?\s*$/;
  let animations=0;
  for(const el of elements) {
    if(el.namespaceURI!==ns||!allowedTags.has(el.localName))throw Error('动画包含不支持的图形元素 '+el.localName);
    for(const attr of el.attributes) {
      const name=attr.name,value=attr.value;
      if(!allowedAttrs.has(name)||name==='xmlns'&&value!==ns||
        /[\\<>]|\/\*|@|(?:https?:|data:|file:|javascript:)/i.test(name==='xmlns'?'':value)||
        /url\s*\(/i.test(value)&&!/^url\(#[\w.-]+\)$/.test(value))throw Error('动画属性不受支持：'+name);
    }
    if(el.localName==='animate'||el.localName==='animateTransform') {
      const target=el.getAttribute('attributeName');
      if(!animated.has(target)||el.localName==='animateTransform'&&target!=='transform'||
        !clocks.test(el.getAttribute('dur')||'')||parseFloat(el.getAttribute('dur'))<=0||
        ['begin','end'].some(attr=>el.hasAttribute(attr)&&!clocks.test(el.getAttribute(attr))))throw Error('动画需要明确的图形属性和数字时间');
      animations++;
    }
  }
  if(!animations)throw Error('动画设计没有可渲染的动作');
  const box=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  if(box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0||Math.abs((box[2]/box[3])/(width/height)-1)>.01)
    throw Error('动画设计的 viewBox 与项目画幅不符');
  const drawing=document.importNode(root,true);
  drawing.setAttribute('width',String(width));drawing.setAttribute('height',String(height));
  document.body.appendChild(drawing);
  drawing.pauseAnimations();drawing.setCurrentTime(0);
}

export async function renderMaterialDrawing(raw,p,child,onProgress=()=>{}) {
  if(typeof raw?.svg!=='string'||!raw.svg.trim())throw Error(String(raw?.note||'AI 未返回动画设计').slice(0,1000));
  if(raw.svg.length>240000||!Number.isFinite(raw.duration)||raw.duration<1||raw.duration>60||
    !['subject','path','camera','handoff','labels'].every(k=>typeof raw.direction?.[k]==='string'&&raw.direction[k].trim()))
    throw Error('动画设计缺少有效的时长、主体路径、镜头衔接或标注说明');
  const folder=path.join(data,'jobs',child.id);
  fs.mkdirSync(folder,{recursive:true});
  // Preserve the exact design used to render, including when the local encoder fails.
  fs.writeFileSync(path.join(folder,'design.json'),JSON.stringify(raw,null,2));
  const {width,height,fps}=p,frames=Math.ceil(raw.duration*fps-1e-8);
  if(frames<2)throw Error('动画时长至少需包含两帧');
  const {chromium}=await import('playwright-core');
  const browser=await chromium.launch({headless:true,executablePath:browserPath()});
  const partial=path.join(folder,'encoding.mp4'),output=path.join(folder,'animation.mp4');
  let encoder,finished;
  try {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,offline:true,serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>body{margin:0;background:#10151b;font-family:Microsoft YaHei,Arial,sans-serif}svg{display:block}</style><body></body>');
    await page.evaluate(mountDrawing,{svg:raw.svg,width,height});
    const session=await context.newCDPSession(page);
    encoder=spawn(ffmpeg.path,['-nostdin','-y','-v','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an',
      '-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt',width%2||height%2?'yuv444p':'yuv420p','-movflags','+faststart',partial],
      {windowsHide:true,stdio:['pipe','ignore','pipe']});
    let stderr='';
    encoder.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-1000);});
    encoder.stdin.on('error',()=>{}); // Individual frame writes also receive this error.
    finished=new Promise((resolve,reject)=>{
      encoder.once('error',reject);
      encoder.once('close',code=>code===0?resolve():reject(Error('动画编码失败：'+(stderr||code))));
    });
    finished.catch(()=>{});
    let firstFrame,hasMotion=false,previousProgress=-1;
    for(let frame=0;frame<frames;frame++) {
      await page.evaluate(time=>document.querySelector('svg').setCurrentTime(time),frame/fps);
      const captured=await session.send('Page.captureScreenshot',{format:'jpeg',quality:96,fromSurface:true,optimizeForSpeed:true});
      const bytes=Buffer.from(captured.data,'base64');
      if(frame===0)firstFrame=bytes;
      else if(!hasMotion)hasMotion=!bytes.equals(firstFrame);
      await new Promise((resolve,reject)=>encoder.stdin.write(bytes,err=>err?reject(err):resolve()));
      const progress=Math.floor((frame+1)/frames*10)*10;
      if(progress!==previousProgress){onProgress(progress);previousProgress=progress;}
    }
    encoder.stdin.end();
    await finished;
    if(!hasMotion)throw Error('渲染出的所有帧都相同，请检查动画时间与可见对象');
    fs.renameSync(partial,output);
    return {file:'animation.mp4',note:raw.note||''};
  } finally {
    if(encoder&&encoder.exitCode===null){encoder.stdin.destroy();encoder.kill();}
    await finished?.catch(()=>{});
    await browser.close();
    if(fs.existsSync(partial))fs.unlinkSync(partial);
  }
}

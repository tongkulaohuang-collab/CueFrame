export const MOTION_DESIGN_VERSION=1;
export const motionEasings=['linear','smooth','ease-in','ease-out','back-out','hold'];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function easeMotion(t,kind='linear') {
  t=clamp(t,0,1);
  if(t===0||t===1)return t;
  if(kind==='smooth')return t*t*(3-2*t);
  if(kind==='ease-in')return t*t;
  if(kind==='ease-out')return 1-(1-t)**3;
  if(kind==='back-out'){const u=t-1;return 1+2.70158*u**3+1.70158*u**2;}
  if(kind==='hold')return 0;
  return t;
}
export function sampleMotion(frames,time) {
  const end=frames.findIndex(f=>f.time>=time);
  if(end<=0)return end===0?frames[0]:frames.at(-1);
  const a=frames[end-1],b=frames[end];
  if(time===b.time)return b;
  const t=(time-a.time)/(b.time-a.time),u=easeMotion(t,b.easing),out={time};
  for(const key of ['x','y','rotation','scaleX','scaleY','opacity','draw']) {
    if(key==='draw'&&a.draw==null&&b.draw==null)continue;
    const av=a[key]??1,bv=b[key]??1;out[key]=av+(bv-av)*u;
  }
  // The arriving frame may define a cubic world-space motion path. Easing
  // changes speed along it; it never changes the object's identity or clock.
  if(b.curve)for(const axis of ['x','y']) {
    const v=clamp(u,0,1),c1=b.curve[axis+'1'],c2=b.curve[axis+'2'];
    out[axis]=(1-v)**3*a[axis]+3*(1-v)**2*v*c1+3*(1-v)*v*v*c2+v**3*b[axis];
  }
  out.opacity=clamp(out.opacity,0,1);
  if(out.draw!=null)out.draw=clamp(out.draw,0,1);
  out.scaleX=Math.max(.05,out.scaleX);out.scaleY=Math.max(.05,out.scaleY);
  return out;
}
export function validateDynamics(frames,range) {
  for(const f of frames) {
    if(f.easing!=null&&!motionEasings.includes(f.easing))throw Error('动作设计：不支持的缓动方式');
    if(f.draw!=null&&(!Number.isFinite(f.draw)||f.draw<0||f.draw>1))throw Error('动作设计：描线进度必须为 0–1');
    if(f.curve!=null&&(['x1','y1','x2','y2'].some(k=>!Number.isFinite(f.curve[k])||Math.abs(f.curve[k])>range)))
      throw Error('动作设计：曲线路径的控制点无效');
  }
}

export const nodeRoles=['subject','mechanism','material','decoration'];
export const motionFonts={sans:'Microsoft YaHei, Arial, sans-serif',serif:'Cambria Math, Georgia, serif',mono:'Consolas, monospace',display:'Impact, Arial Narrow, sans-serif'};
const safeLocalImage=src=>typeof src==='string'&&/^\/?media\/[\w-]+\.(png|jpg|jpeg|webp)$/i.test(src);
export function motionImageAsset(p,id) {
  const a=p.assets?.find(a=>a.id===id);
  const content=a?.kind==='image'?safeLocalImage(a.src):a?.kind==='video'&&/^\/?media\/[\w-]+\.(mp4|webm)$/i.test(a.src||'')&&Number.isFinite(a.duration)&&a.duration>0&&safeLocalImage(a.poster);
  return content&&a.confirmed&&a.source?.trim()&&a.license?.trim()?a:null;
}
export function motionMediaFrame(media,asset,time,fps){return Math.floor((time+(media.offset||0))*fps)%Math.max(1,Math.floor(asset.duration*fps));}
export function validateNodeContent(n,paint,finite) {
  if(n.role!=null&&!nodeRoles.includes(n.role))throw Error('动作设计：对象用途无效');
  if(n.media!=null&&(!/^[\w-]{1,90}$/.test(n.media.assetId||'')||!finite(n.media.width,1,8192)||!finite(n.media.height,1,8192)||!['cover','contain'].includes(n.media.fit)))
    throw Error('风格素材：图片必须引用素材库编号及有效尺寸，不能使用外部链接');
  if(n.media&&(n.media.mask!=null&&!['rectangle','circle','slant'].includes(n.media.mask)||n.media.offset!=null&&!finite(n.media.offset,0,3600)||n.media.print!=null&&typeof n.media.print!=='boolean'))throw Error('风格素材：裁切形状、印刷效果或播放起点无效');
  if(n.text!=null&&(typeof n.text.value!=='string'||!n.text.value.trim()||[...n.text.value].length>80||/[\r\n]/.test(n.text.value)||
    !Object.hasOwn(motionFonts,n.text.font)||!finite(n.text.size,12,400)||!paint(n.text.color)||![400,600,700,900].includes(n.text.weight)))
    throw Error('风格文字：请使用单行简短公式、标题或标签及有效字体设置');
  if(!n.paths.length&&!n.media&&!n.text)throw Error('动画主体没有可见图形、文字或素材');
}

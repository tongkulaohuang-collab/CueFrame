
const P=fitProjection([[-184,-85,-18],[180,-85,-18],[-184,85,65],[180,85,65]],1200,590,{pad:50,azimuth:90,elevation:56});P.origin[0]+=0;P.origin[1]+=0;
// Anatomy local y points toward its camera; reflect world y at primitive boundaries.
const W=p=>[p[0],-p[1],p[2]];const screen=p=>iso(W(p),P);const worldLine=(a,b,z)=>lineOnTop([a[0],-a[1]],[b[0],-b[1]],z,P);
let parts=0;const S=(p,z,h,tone='mid',lit=false)=>{parts++;return solidSvg(slabOf({...p,y:-p.y-p.d},z,h,P,5,.7),{tone,crease:'lo',lit})};
const C=(x,y,r,z,h,tone='mid',lit=false)=>{parts++;return solidSvg(cylinder(x,-y,r,z,h,P,36,.5),{tone,crease:'faint',lit})};
const L=(d,tone='lo',free=false)=>lineSvg(d,{tone,free});
const base={x:-184,y:-85,w:364,d:170,r:9};let rear='';
rear+='<path class="iso-halo" d="'+haloOf(base,-18,18,P)+'"/>';
for(const [x,y]of corners(base,17).sort((a,b)=>depthOf(W([...a,0]),P)-depthOf(W([...b,0]),P))){rear+=C(x,y,9,-18,5,'lo');rear+=C(x,y,6,-13,5);}
rear+=S(base,-8,8,'hi');rear+=L(planOutline(insetPlan(base,5),.1,P));
for(const [x,y]of corners(base,11)){rear+=C(x,y,2.5,.1,1,'mid');rear+=L(worldLine([x-1.8,y],[x+1.8,y],1.2,P),'mid');}
for(const x of[-163,-29]){rear+=S({x:x-5,y:-63,w:10,d:126,r:1},1,13);rear+=S({x:x-2,y:-62,w:4,d:124,r:1},14,2,'hi');for(const y of[-66,63]){rear+=S({x:x-8,y,w:16,d:9,r:1},1,18);rear+=C(x,y+4,2,19,1);}}
rear+=C(-96,0,49,1,8,'lo');rear+=C(-96,0,44,9,8);rear+=C(-96,0,41,17,3,'hi');rear+=L(ring(-96,0,38,20.2,P),'mid');
for(const [x,y]of[[-138,-47],[-54,-47],[-138,47],[-54,47]]){rear+=C(x,y,4,1,5);rear+=C(x,y,2,6,1,'hi');}
const paper={x:7,y:-59,w:145,d:118,r:1};rear+=S({x:0,y:-67,w:164,d:134,r:4},1,5,'mid');rear+='<g style="--anatomy-top:#d7d6ca;--anatomy-shade-0:#879795;--anatomy-shade-1:#a9b3ae;--anatomy-shade-2:#b8c0b9;--anatomy-shade-3:#c8ccc2;--anatomy-hi:#80928e">'+S(paper,6,1,'hi')+'</g>';

for(let i=0;i<=8;i++)rear+=L(worldLine([paper.x,paper.y+i*14],[paper.x+paper.w,paper.y+i*14],7.1,P),'faint');
for(const x of[5,155]){rear+=S({x:x-4,y:-62,w:8,d:124,r:3},7,8,'hi');for(const y of[-65,57]){rear+=S({x:x-7,y,w:14,d:8,r:1},2,17);rear+=C(x,y+4,2,19,1);}}
// The feed is schematically motorised; no claim that this is a manufacturable mechanism.
rear+=S({x:20,y:70,w:95,d:8,r:1},1,1,'lo');for(let tx=23;tx<=112;tx+=3)rear+=L(worldLine([tx,70],[tx,tx%5===0?75:72],2.1),'faint');
rear+=C(151,70,10,1,6,'hi');rear+=L(knurl(151,-70,10,1,7,36,P),'lo');rear+=C(151,70,5,7,3,'hi');
for(let i=0;i<7;i++)rear+=S({x:27+i*12,y:80,w:7,d:2,r:.5},1,1,'lo');
const staticParts=parts;
let carriage='';carriage+=S({x:-154,y:-8,w:118,d:3,r:1},23,5,'hi');carriage+=S({x:-154,y:5,w:118,d:3,r:1},23,5,'hi');carriage+=S({x:-154,y:-8,w:4,d:16,r:1},23,5,'hi');carriage+=S({x:-40,y:-8,w:4,d:16,r:1},23,5,'hi');
for(const x of[-163,-29]){carriage+=S({x:x-9,y:-12,w:18,d:24,r:2},16,7,'hi');for(const y of[-8,8])carriage+=C(x,y,2,23,1,'mid');}
carriage+=S({x:-163,y:-4,w:13,d:8,r:1},23,5,'hi');carriage+=S({x:-40,y:-4,w:13,d:8,r:1},23,5,'hi');carriage+=S({x:-29,y:-2,w:168,d:4,r:1},24,4,'hi',true);carriage+=S({x:133,y:2,w:8,d:8,r:1},24,6,'hi',true);carriage+=C(137,0,2.2,12.1,20,'hi',true);carriage+=C(137,0,.4,7.2,4.9,'hi');carriage+=C(137,0,2.8,25,3,'hi');

const hub=C(-96,0,4,20,3,'hi');const total=parts+1;document.head.insertAdjacentHTML('beforeend','<style>'+ISO_CSS+'</style>');
const el=document.querySelector('svg');el.innerHTML='<defs><radialGradient id="vignette"><stop stop-color="#23394b"/><stop offset="1" stop-color="#101f2c"/></radialGradient></defs><rect width="1280" height="720" fill="url(#vignette)"/><g id="world"><g id="back">'+rear+'</g><g id="paper-grid"></g><g id="ink"></g><g id="arm"></g><g id="hub">'+hub+'</g><g id="carriage">'+carriage+'</g><g id="pin"></g></g><g id="annotation"></g>';
const smooth=v=>{v=Math.min(1,Math.max(0,v));return v*v*(3-2*v)};
window.renderAt=local=>{
 const t=CONFIG.start+local,theta=2*Math.PI*(t+.8)/8,y=38*Math.sin(theta),x=-96+38*Math.cos(theta);
 document.querySelector('#carriage').setAttribute('transform',translateAlong(P,[0,-y,0]));
 let marks='';for(let i=0;i<40;i++){const a=theta+i*2*Math.PI/40;marks+=L(worldLine([-96+37*Math.cos(a),37*Math.sin(a)],[-96+40*Math.cos(a),40*Math.sin(a)],20.3,P),'mid')}
 const c=Math.cos(theta),sn=Math.sin(theta),rim=[[0,-3],[38,-3],[38,3],[0,3]].map(([r,v])=>[-96+r*c-v*sn,r*sn+v*c]);
 document.querySelector('#arm').innerHTML=marks+solidSvg(extrude(rim.map(([x,y])=>[x,-y]),20,2,P,{convex:true,bevel:.4}),{tone:'hi',lit:true});
 document.querySelector('#pin').innerHTML=solidSvg(cylinder(x,-y,4.5,20,11,P,32,.4),{tone:'hi',lit:true});
 let pts=[];for(let i=0;i<240;i++){let age=(137-7)/16*(239-i)/239;pts.push([137-age*16,38*Math.sin(2*Math.PI*(t-age+.8)/8),7.6])}
 document.querySelector('#ink').innerHTML='<path d="'+pathOf(pts.map(p=>screen(p)))+'" fill="none" stroke="#174955" stroke-width="2.7"/>';
 let grid='';for(let i=0;i<20;i++){let gx=7+(i*8-16*t%152+152)%152;if(gx<152)grid+=L(worldLine([gx,-59],[gx,59],7.3,P),'faint')};document.querySelector('#paper-grid').innerHTML=grid;
 let zoom=1.03,cx=640,cy=320;
 if(CONFIG.view==='slot'){zoom=1.74;const p=screen([-96,0,15]);cx=p[0];cy=p[1];}
 else if(CONFIG.view==='pen'){zoom=1.7;const p=screen([80,0,8]);cx=p[0];cy=p[1]}
 else if(CONFIG.view==='pin'){zoom=1.8;const p=screen([-96,0,15]);cx=p[0];cy=p[1]}
 if(CONFIG.index===3){let q=smooth(local/Math.min(5,CONFIG.duration));zoom=1.6-.57*q;const p=screen([-60+60*q,0,15]);cx=p[0];cy=p[1]}
 document.querySelector('#world').setAttribute('transform',`translate(640 320) scale(${zoom}) translate(${-cx} ${-cy})`);
 // Annotation is brief and anchored to the actual object. Managerial titles stay off screen.
 let note='',at=[0,0,0];
 if(CONFIG.index===2&&local>2&&local<7){note='横槽允许左右滑动';at=[-96,y+22,29]}
 if(CONFIG.index===3&&local>6&&local<10){note='同一高度';at=[105,y+19,30]}
 if(CONFIG.index===5&&local>3&&local<8){note='一圈 → 一个周期';at=[77,66,15]}
 const p=screen(at),nx=640+(p[0]-cx)*zoom,ny=320+(p[1]-cy)*zoom;
 document.querySelector('#annotation').innerHTML=note?`<text x="${Math.max(180,Math.min(1100,nx))}" y="${Math.max(60,Math.min(590,ny))}" fill="#f4d496" font-family="Microsoft YaHei" font-size="21" text-anchor="middle" stroke="#101f2c" stroke-width="3" paint-order="stroke">${note}</text>`:'';
 window.model={t,theta,pin:[x,y],pen:[137,y],parts:total,projectionError:0};
};window.render=window.renderAt;window.renderAt(0);

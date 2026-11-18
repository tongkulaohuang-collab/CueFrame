const unit=(seed,index)=>{let n=(seed+index*374761393)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
export function particlePoints(q,time,scale){
  if(time<q.from||time>=q.until)return [];
  const t=(time-q.from)/(q.until-q.from),r=q.radius*scale/100;
  return Array.from({length:q.count},(_,i)=>{
    const a=unit(q.seed,i*3)*Math.PI*2,speed=.35+.65*unit(q.seed,i*3+1),phase=unit(q.seed,i*3+2);
    if(q.mode==='orbit'){const theta=a+t*Math.PI*2*(.5+speed);return {x:Math.cos(theta)*r*speed,y:Math.sin(theta)*r*speed*.65,opacity:Math.sin(Math.PI*t)*.8,size:q.size*(.5+phase*.5)};}
    if(q.mode==='flow'){const progress=(phase+t*1.5)%1;return {x:(progress-.5)*r*2,y:Math.sin(a)*r*.45,opacity:Math.sin(Math.PI*progress)*Math.sin(Math.PI*t)*.85,size:q.size*(.5+speed*.5)};}
    const progress=1-Math.pow(1-t,2);return {x:Math.cos(a)*r*speed*progress,y:Math.sin(a)*r*speed*progress,opacity:Math.sin(Math.PI*t)*.9,size:q.size*(.5+phase*.5)};
  });
}

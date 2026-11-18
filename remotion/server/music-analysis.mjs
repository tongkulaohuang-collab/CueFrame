// Local waveform analysis. Onsets are measured attacks, not semantic accents.
// A tempo is reported only for a sufficiently regular sequence; no invented grid.
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0;};
export function analyzeMusicPCM(pcm,rate=8000) {
  const samples=Math.floor(pcm.length/2),hop=Math.max(1,Math.round(rate*.01));
  const rms=[];
  for(let start=0;start<samples;start+=hop){
    let sum=0,count=0;
    for(let i=start;i<Math.min(samples,start+hop);i++){sum+=(pcm.readInt16LE(i*2)/32768)**2;count++;}
    rms.push(Math.sqrt(sum/Math.max(1,count)));
  }
  // A trailing 30 ms window suppresses carrier/beating ripple in sustained
  // chords while keeping a 10 ms clock for actual transient arrivals.
  const energy=rms.map((_,i)=>{const a=rms.slice(Math.max(0,i-2),i+1);return Math.sqrt(a.reduce((s,e)=>s+e*e,0)/a.length);});
  const max=energy.reduce((a,b)=>Math.max(a,b),0),marks=[];
  const coarse=[];
  for(let i=0;i<energy.length;i+=25)coarse.push(Math.sqrt(energy.slice(i,i+25).reduce((s,e)=>s+e*e,0)/Math.min(25,energy.length-i)));
  const peak=coarse.reduce((a,b)=>Math.max(a,b),0);
  for(let i=0;i<coarse.length;i++){
    const delta=coarse[i]-(coarse[i-1]||0);
    if(!i||Math.abs(delta)>peak*.18&&i*.25-(marks.at(-1)?.time||0)>=.75)
      marks.push({time:i*.25,change:coarse[i]<peak*.08||peak===0?'弱声／留白':delta>0?'声音增强':'声音减弱',strength:Math.round(100*coarse[i]/(peak||1))});
  }
  const flux=energy.map((e,i)=>Math.max(0,e-(energy[i-1]||0))),onsets=[];
  for(let i=0;i<flux.length-1;i++){
    const local=flux.slice(Math.max(0,i-30),Math.min(flux.length,i+31));
    const threshold=Math.max(.004,max*.1,median(local)*3);
    if(flux[i]>threshold&&flux[i]>=(flux[i-1]||0)&&flux[i]>flux[i+1]){
      const time=i*hop/rate;
      if(time-(onsets.at(-1)?.time??-1)>=.12)onsets.push({time,strength:Number(Math.min(1,flux[i]/(max||1)).toFixed(3))});
    }
  }
  const gaps=onsets.slice(1).map((o,i)=>o.time-onsets[i].time);
  const period=median(gaps), regular=gaps.length?gaps.filter(g=>Math.abs(g-period)<Math.max(.03,period*.1)).length/gaps.length:0;
  const stable=onsets.length>=8&&period>=.3&&period<=1&&regular>=.8;
  const rhythm={method:'energy-onset-v1',resolution:hop/rate,onsets,beats:stable?onsets:[],
    tempoBpm:stable?Number((60/period).toFixed(1)):null,confidence:stable?Number(regular.toFixed(2)):0};
  return {marks,rhythm};
}

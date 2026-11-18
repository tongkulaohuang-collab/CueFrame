import fs from 'node:fs';
import path from 'node:path';
import {data,root,get,jobs} from './store.mjs';
import {lemoStyle,lemoLinks} from '../shared/lemo.mjs';
import {motionReferences,currentReferenceReports} from '../shared/reference-motion.mjs';
import {sceneProps} from '../shared/scene-props.mjs';
import {proofFrames} from '../shared/direction.mjs';
import {motionImageAsset} from '../shared/motion-dynamics.mjs';
import {segmentFingerprint} from './segment-fingerprint.mjs';

export function materialFrames(p,focus=null,includeSamples=true) {
  const history=jobs(p.id);
  const origin=p.origin?.project;
  const referenceJobs=[...new Set([p.id,origin].filter(Boolean))].flatMap(id=>id===p.id?history:jobs(id))
    .filter(j=>j.task==='reference-motion');
  const refs=motionReferences(p), style=[];
  for(const report of currentReferenceReports(p)) {
    const segment=report.segments.find(s=>s.until>=report.duration*.20)||report.segments[0];
    if(!segment)continue;
    const time=(segment.from+segment.until)/2;
    const ids=[...new Set([report.reviewJobId,...referenceJobs.map(j=>j.id)].filter(Boolean))];
    const index=refs.findIndex(r=>r.id===report.referenceId);
    for(const id of ids) {
      if(!/^[\w-]+$/.test(id))continue;
      const dir=path.join(data,'jobs',id,'reference-'+index);
      let evidence;
      try{evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json'),'utf8'));}catch{continue;}
      if(evidence.mediaHash!==report.mediaHash)continue;
      const sheet=evidence.sheets.find(s=>s.from<=time&&s.until>time);
      if(!sheet)continue;
      // Do not attach a contact sheet that includes an excluded interval.
      const usable=evidence.sheets.filter(s=>s.cells.every(t=>report.segments.some(r=>r.from<=t&&t<r.until)));
      const use=usable.includes(sheet)?sheet:usable[0];
      if(!use)continue;
      const file=path.join(dir,'sheet-'+String(use.index).padStart(3,'0')+'.jpg');
      if(!fs.existsSync(file))continue;
      style.push({kind:'reference',file,label:report.name+' · '+use.from+'–'+use.until+' 秒',key:report.mediaHash+'-'+use.index});
      break;
    }
  }
  const selected=lemoStyle(p.scienceFlow?.lemoStyleId);
  if(selected&&!style.some(f=>f.label.startsWith(selected.cn))) {
    const file=path.join(root,'public','lemo',selected.slug+'.jpg');
    if(fs.existsSync(file))style.push({kind:'poster',file,label:selected.cn+' · 风格封面',key:'poster-'+selected.slug,url:lemoLinks(selected).poster});
  }
  for(const asset of p.assets||[]) {
    if(asset.kind!=='image'||asset.role!=='reference'||asset.generation||asset.imageSource||!motionImageAsset(p,asset.id))continue;
    const file=path.join(data,'uploads',path.basename(asset.src));
    if(fs.existsSync(file))style.push({kind:'reference-image',file,url:asset.src,label:'项目参考图 · '+asset.name});
  }
  if(!includeSamples)return style;
  const seen=new Set(),samples=[];
  const shotIds=Array.isArray(focus)?new Set(focus):focus?new Set([focus]):null;
  const sourceHistory=origin?jobs(origin).filter(j=>j.version<=p.origin.version):[];
  const records=[...history,...sourceHistory].filter(j=>j.scope==='shot'&&j.type==='render'&&j.status==='done'&&j.variant===p.voice&&(!shotIds||shotIds.has(j.shotId)));
  for(const j of records) {
    if(seen.has(j.shotId)||!p.shots.some(s=>s.id===j.shotId))continue;
    const old=get(j.project,j.version);
    if(!old||segmentFingerprint(old,j.shotId,p.voice)!==segmentFingerprint(p,j.shotId,p.voice))continue;
    seen.add(j.shotId);
    const scene=sceneProps(old,j.shotId,p.voice),times=proofFrames(scene);
    const names=['entry','peak','settled'];
    const n=p.shots.findIndex(s=>s.id===j.shotId)+1;
    names.forEach((name,i)=>{
      const file=path.join(data,'exports',j.id,name+'.png');
      if(fs.existsSync(file))samples.push({kind:'sample',file,shotId:j.shotId,time:times[i]/p.fps,
        label:'第 '+n+' 镜 · '+(times[i]/p.fps).toFixed(2)+' 秒',url:'/exports/'+j.id+'/'+name+'.png'});
    });
    if(!shotIds&&samples.length>=6)break;
  }
  return [...style,...samples];
}
export function materialAttachments(p,focus=null) {
  const frames=materialFrames(p,focus);
  const samples=frames.filter(f=>f.kind==='sample').slice(0,3);
  return [...frames.filter(f=>f.kind!=='sample').slice(0,8-samples.length),...samples];
}

// Final animation receives real visual inputs, not only written descriptions.
export function motionAttachments(p,shotId) {
  const shot=p.shots.find(s=>s.id===shotId);
  const ids=[...new Set([...(shot?.imageBindings||[]).map(b=>b.assetId),...(shot?.motionPlan?.nodes||[]).map(n=>n.media?.assetId)].filter(Boolean))];
  const objects=ids.map(id=>motionImageAsset(p,id)).filter(a=>a?.kind==='image').map(a=>({
    kind:'adopted-object',assetId:a.id,shotId,label:'本镜已采用对象 · '+a.name,file:path.join(data,'uploads',path.basename(a.src)),
  })).filter(a=>fs.existsSync(a.file)).slice(0,4);
  const context=materialAttachments(p,shotId).slice(0,8-objects.length);
  return [...context,...objects];
}

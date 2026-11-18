import fs from 'node:fs/promises';
import {library,trackAudio,trackFor} from './keynata-library.mjs';
import {upload} from './media.mjs';
import {write} from './store.mjs';
import {update} from '../shared/model.mjs';
import {analyzeBgm} from './science-production.mjs';

export async function adoptKeynata(p,id){
  const t=trackFor(id);
  if(p.kind!=='science' && !p.shots.length) throw Error('先建立至少一个镜头，再采用全片配乐。');
  let a=p.assets.find(x=>x.keynataId===id && x.keynataHash===t.sha256);
  if(a && (p.kind==='science' ? p.scienceFlow?.analysis?.sourceId===a.id :
    p.shots.every(s=>s.assetIds.includes(a.id)))) return p;
  if(!a){
    const bytes=await fs.readFile(await trackAudio(id));
    const evidence={keynataId:id,keynataHash:t.sha256,keynataRevision:library.revision,
      source:t.entry,license:library.license+' · '+library.licenseUrl,credit:'Keynata Commons · '+t.id};
    a={...upload(t.name+'.mp3',bytes,evidence),...evidence,role:'music',confirmed:true};
  }
  const assets=[...p.assets.filter(x=>x.id!==a.id),a];
  if(p.kind==='science') return analyzeBgm({...p,assets},{id:a.id,from:0,until:a.duration});
  const tracks=new Set(assets.filter(x=>x.role==='music').map(x=>x.id));
  const shots=p.shots.map(s=>({...s,assetIds:[...s.assetIds.filter(id=>!tracks.has(id)),a.id]}));
  return write(update(p,{...p,assets,shots}),p.version);
}

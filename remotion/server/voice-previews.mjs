import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {db} from './store.mjs';
import {workbenchSpeech} from './doubao-service.mjs';

db.exec('CREATE TABLE IF NOT EXISTS voice_previews (id TEXT PRIMARY KEY, signature TEXT NOT NULL)');
export function voicePreviews(service=workbenchSpeech) {
  const preparing=new Map();
  const publicRecord=r=>({...r, result:r.result?{...r.result,audio_url:'/api/doubao/previews/'+r.id+'/audio'}:null});
  async function lookup(id) {
    if(!db.prepare('SELECT id FROM voice_previews WHERE id=?').get(id||''))throw Error('试听请求不存在');
    return service.getRequest(id);
  }
  return {
    async prepare(b) {
      if(typeof b.text!=='string'||!b.text.trim()||[...b.text.trim()].length>100)throw Error('试听文案需为 1–100 字');
      const voice=(await service.listVoices()).find(v=>v.speaker_id===b.speaker);
      if(!voice)throw Error('请选择目录中的音色');
      const text=b.text.trim(),signature=createHash('sha256').update(JSON.stringify([voice.speaker_id,text])).digest('hex');
      if(preparing.has(signature))return preparing.get(signature);
      const task=(async()=>{
        const old=db.prepare('SELECT id FROM voice_previews WHERE signature=? ORDER BY rowid DESC LIMIT 1').get(signature);
        if(old){
          const r=await lookup(old.id);
          if(['completed','prepared'].includes(r.status))return publicRecord(r);
          if(!b.retry)return publicRecord(r);
          if(['submitted','needs_review'].includes(r.status)&&b.acknowledgeUncertain!==true)
            throw Error('请先核对原试听请求；再次提交可能重复计费');
        }
        const r=await service.prepare('speech',{text,speaker_id:voice.speaker_id,format:'mp3'});
        db.prepare('INSERT INTO voice_previews VALUES (?,?)').run(r.id,signature);
        return publicRecord(r);
      })();
      preparing.set(signature,task);
      try{return await task;}finally{preparing.delete(signature);}
    },
    async execute(b) {
      const r=await lookup(b.requestId);
      if(b.confirmed!==true)throw Error('请确认本次音色试听的文案与计费');
      return publicRecord(await service.execute(r.id,{confirmed:true,billing_mode:'paid_approved',
        billing_note:`用户点击生成试听，授权本次请求 ${r.id}（${r.summary.characters} 字，${r.summary.voice}），按豆包账户实际资费结算；未声明免费额度。`}));
    },
    async check(b){return publicRecord(await lookup(b.requestId));},
    async audio(id) {
      const r=await lookup(id);
      if(r.status!=='completed'||r.payload.format!=='mp3')throw Error('试听音频尚未完成');
      const base=fs.realpathSync(service.outputs),file=fs.realpathSync(path.join(base,r.id,'narration.mp3'));
      if(path.relative(base,file)!==path.join(r.id,'narration.mp3'))throw Error('试听文件路径无效');
      return file;
    },
  };
}

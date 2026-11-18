import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {draft, emptyShot, locks, review, shotIssues, timeline} from '../shared/model.mjs';
import {linesFor} from '../shared/direction.mjs';
import {RENDER_PIPELINE_VERSION} from '../shared/scene-props.mjs';

test('补产品一致性保留来源核对；单语录音只在真实分句与台词匹配时采用逐句入点', () => {
  const p=draft('product'), s=emptyShot();
  Object.assign(s,{title:'保存',purpose:'核对回执',visual:'表单到按钮',zh:'填片名。点保存。看回执。',en:'',assetIds:['screen','voice']});
  p.shots=[s];
  const screen={id:'screen',kind:'image',role:'product',src:'/screen.png',source:'截图',license:'自摄',confirmed:true,checks:[locks[1],locks[2]]};
  const voice={id:'voice',kind:'audio',role:'zh',duration:5,source:'录音',license:'自制',confirmed:true,segments:[{text:s.zh,from:0}]};
  p.assets=[screen,voice];
  assert.match(shotIssues(p,s).join(' '),/规格参数与卖点/);
  screen.checks.push(locks[3]);
  review(p,'shot',s.id);
  assert.equal(screen.confirmed,true);
  assert.equal(timeline(p).rows[0].captionCues.length,1);
  voice.segments=linesFor(s,true).zh.map((text,i)=>({text,from:[0,1.25,3][i]}));
  assert.deepEqual(timeline(p).rows[0].captionCues.map(c=>[c.from,c.timing]),[[0,'实测'],[30,'实测'],[72,'实测']]);
});

test('样镜放行按镜头核对，拒绝过期样镜，退回修改后收回放行',async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-product-review-'));
  process.env.FRAMEBOARD_DATA=dir;
  const {write,persistJob,job,db}=await import('../server/store.mjs');
  try {
    const {recordSampleDecision}=await import('../server/sample-decision.mjs');
    const p=draft('product');
    p.look='classic';p.passed=['分镜'];p.shots=[emptyShot(),emptyShot()];
    p.assets=[{id:'screen',kind:'image',role:'product',src:'/image.png',confirmed:true,source:'原件',license:'内部使用',checks:locks}];
    for(const s of p.shots) Object.assign(s,{purpose:'跟随表单',visual:'表单到回执',zh:'保存。',reviewed:true,silentOK:true,assetIds:['screen']});
    const first=write(p,0);
    for(const [i,s] of p.shots.entries()){
      const id='sample'+i, folder=path.join(dir,'exports',id);
      fs.mkdirSync(folder);
      for(const name of ['sample.mp4','subtitles.srt'])fs.writeFileSync(path.join(folder,name),'');
      persistJob({id,type:'render',scope:'shot',project:p.id,version:first.version,shotId:s.id,variant:'zh',created:String(i),
        pipelineVersion:RENDER_PIPELINE_VERSION,status:'done',output:'/exports/'+id+'/'});
    }
    const input={version:first.version,advance:true,decision:'approved',time:1};
    const partial=recordSampleDecision('sample0',input);
    assert.equal(partial.nextSample.shotId,p.shots[1].id);
    assert.ok(!partial.project.passed.includes('样镜'));
    const all=recordSampleDecision('sample1',input);
    assert.equal(all.nextSample,null);
    assert.ok(all.project.passed.includes('样镜'));
    const repeat=recordSampleDecision('sample1',{...input,version:all.project.version});
    assert.equal(repeat.project.version,all.project.version);
    const rejected=recordSampleDecision('sample1',{...input,version:all.project.version,decision:'changes',note:'重裁回执'});
    assert.ok(!rejected.project.passed.includes('样镜'));
    rejected.project.shots[1].zh='新的台词。';
    const edited=write(rejected.project,rejected.project.version);
    assert.throws(()=>recordSampleDecision('sample1',{...input,version:edited.version}),/内容已有修改/);
    assert.equal(job('sample1').review.decision,'changes');
  } finally {
    db.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});

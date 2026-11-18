import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {motionFixture as legacyMotionFixture,explanationScriptFixture} from './fixtures/motion.mjs';
const motionFixture=()=>legacyMotionFixture({presentation:true});
import {uid,syncNarration,update,timeline,renderIssues} from '../shared/model.mjs';
import {musicPhrasing,phrasingParagraphs,preserveNarrationParagraphs} from '../shared/automatic-workflow.mjs';
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {voiceStatus,voiceProvider} from '../shared/voice-status.mjs';
import {generateVoiceBatch} from '../ui/voice-batch.mjs';
import {captionDisplayCues,displayCaptions} from '../shared/overlays.mjs';
import {sceneProps,RENDER_PIPELINE_VERSION} from '../shared/scene-props.mjs';
import {motionInputs,sameMotionInputs} from '../shared/motion-plan.mjs';
import {validateMotionResult} from '../server/motion.mjs';
import {readWatched,saveWatched,joinedCoverage} from '../shared/playback-record.mjs';
import {observePlayback,playbackComplete} from '../shared/director-quality.mjs';
import {issueHelp} from '../shared/issue-help.mjs';
import {srt} from '../server/film-package.mjs';
process.env.FRAMEBOARD_DATA=fs.mkdtempSync(path.join(os.tmpdir(),'frameboard-flow-fixes-'));
const store=await import('../server/store.mjs');
const broker=await import('../server/codex.mjs');
const {startSegments,segmentStatus,reviseSegment,cancelSegments}=await import('../server/segments.mjs');
const wait=async id=>{for(let i=0;i<400;i++){const j=store.job(id);if(!['running','queued'].includes(j.status))return j;await new Promise(r=>setTimeout(r,5));}throw Error('test job did not finish');};
function prepared() {
  const {p,raw}=motionFixture();delete p.captionLayout;p.script=p.shots[0].zh;p.shots[0].en='Test narration.';
  Object.assign(p.shots[0],validateMotionResult(raw,p,{shotId:p.shots[0].id})[0]);
  p.shots[0].motionPlan.inputs=motionInputs(p,p.shots[0]);
  return store.write(p,0);
}
function fakeRender(p,id,variant) {
  const j={id:uid(),project:p.id,version:p.version,shotId:id,type:'render',scope:'shot',variant,status:'done',created:new Date().toISOString(),pipelineVersion:RENDER_PIPELINE_VERSION,evidence:{frames:24}};
  const folder=path.join(store.data,'exports',j.id);fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder,'sample.mp4'),'test fixture');fs.writeFileSync(path.join(folder,'subtitles.srt'),'test fixture');
  return store.persistJob({...j,output:'/exports/'+j.id+'/'});
}
test('配音状态只看已采用的有效录音，换供应方补缺也不替换旧录音',async()=>{
  const {p}=motionFixture();p.assets[0].speakerId='local:zh:3';p.assets[0].scriptText=p.shots[0].zh;
  assert.equal(voiceStatus(p).done,1);assert.equal(voiceProvider(p),'local');assert.equal(voiceProvider(p,'doubao'),'doubao');
  await generateVoiceBatch({project:p,ids:[p.shots[0].id],lang:'zh',speaker:'new-paid-voice',isCurrent:()=>true,onProgress:()=>{},synthesize:()=>{throw Error('不应重新计费');}});
  p.assets[0].scriptText='旧文案';assert.deepEqual(voiceStatus(p).missing,[p.shots[0].id]);
});
test('AI 把三段拆成多行后仍为原三段，空白调整保留原段ID与音频',()=>{
  const {p}=motionFixture();p.script='第一句。接着观察。\n第二段。继续运动。\n第三段。过程结束。';
  p.shots=[0,1,2].map((n)=>({...p.shots[0],id:'s'+n,zh:p.script.split('\n')[n]}));
  const text=preserveNarrationParagraphs(p.script,p.script.replaceAll('。','。\n'));
  assert.equal(text,p.script);assert.deepEqual(syncNarration({...p,script:text}).shots,p.shots);
  const result=preserveNarrationParagraphs(p.script,p.script.replaceAll('。','！\n'));
  assert.equal(result.split('\n').length,3);assert.ok(result.includes('！'));
  assert.throws(()=>preserveNarrationParagraphs(p.script,'新稿'),/改动/);
});
function phrasingDraft(texts,recordings) {
  const {p}=motionFixture(),template=p.shots[0],voice=p.assets[0];
  p.script=texts.join('\n\n');
  p.assets=p.assets.filter(a=>a.role==='music');
  p.shots=texts.map((zh,i)=>{
    const shot={...structuredClone(template),id:'s'+i,zh,en:'Line '+(i+1)+'.',assetIds:[]};
    const lang=recordings[i];
    if(lang){
      const text=shot[lang],asset={...voice,id:'v'+i,role:lang,scriptText:text};
      p.assets.push(asset);shot.assetIds.push(asset.id);
      shot.subtitleTracks={[lang]:{assetId:asset.id,text,segments:[{text,from:.14,until:1.79}]}};
      shot.manualTiming={[lang]:{assetId:asset.id,text,starts:[0]}};
    }
    return shot;
  });
  return store.write(p,0);
}
test('全部已有配音时不提交断句，旧回执即使改标点也保留原版本、录音和字幕',()=>{
  const p=phrasingDraft(['向左转。','继续走！'],['zh','zh']);
  const original=voiceAssemblyPlan(p);assert.ok(original.ready);
  assert.throws(()=>broker.prepare(p,null,'phrasing'),/全部段落已有配音/);
  assert.equal(store.jobs(p.id).length,0);
  const legacy=store.persistJob({id:uid(),project:p.id,type:'codex',task:'phrasing',version:p.version,status:'awaiting'});
  assert.throws(()=>broker.approve(legacy.id,()=>assert.fail('不应提交断句')),/全部段落已有配音/);
  store.persistJob({...legacy,status:'ready',result:['向左转！\n继续走。']});
  const next=broker.applyJob(legacy.id);
  assert.deepEqual(next,p);
  assert.deepEqual(store.get(p.id),p);
  assert.equal(voiceAssemblyPlan(next).signature,original.signature);
  assert.deepEqual(store.job(legacy.id).result,[p.script]);
  assert.equal(store.job(legacy.id).appliedVersion,p.version);
});
test('部分段落已录音时只调整缺音段，即使调整后两段台词完全相同',async()=>{
  const p=phrasingDraft(['你好！','你好。','继续，再看。'],[null,'zh',null]);
  const j=broker.prepare(p,null,'phrasing');let calls=0;
  broker.approve(j.id,async()=>{calls++;return {text:'你好。\n你好！\n继续。再看。'};});
  const result=await wait(j.id);assert.equal(result.status,'ready',result.error);assert.equal(calls,1);
  const next=broker.applyJob(j.id);
  assert.equal(next.script,'你好。\n\n你好。\n\n继续。再看。');
  assert.deepEqual(next.shots.map(s=>s.id),p.shots.map(s=>s.id));
  assert.deepEqual(next.shots[1].assetIds,p.shots[1].assetIds);
  assert.deepEqual(next.shots[1].subtitleTracks,p.shots[1].subtitleTracks);
  assert.deepEqual(next.shots[1].manualTiming,p.shots[1].manualTiming);
  const cues=timeline(next).rows[1].captionCues;
  assert.equal(cues[0].timing,'精确起止');
  assert.deepEqual(cues,timeline(p).rows[1].captionCues);
  assert.equal(next.shots[1].en,p.shots[1].en);
  assert.deepEqual(voiceStatus(next).missing,['s0','s2']);
  assert.deepEqual(store.job(j.id).result,[next.script]);
  const reopened=store.get(next.id);assert.equal(syncNarration(reopened),reopened);
});
test('旧稿调序及英文录音均受保护，未采用或已过期的录音仍可断句',()=>{
  const p=phrasingDraft(['正前方。','右侧。','左侧。'],['en','zh','zh']);
  p.script='左侧。\n正前方。\n右侧。';
  p.shots[2].assetIds=[];p.assets.find(a=>a.id==='v1').scriptText='曾经的台词';
  assert.deepEqual(phrasingParagraphs(p).map(row=>row.recorded),[false,true,false]);
  assert.equal(musicPhrasing(p,'左侧！\n正前方！\n右侧！'),'左侧！\n正前方。\n右侧！');
  const saved=store.write(p,p.version);
  const j=store.persistJob({id:uid(),project:p.id,type:'codex',task:'phrasing',version:saved.version,status:'ready',result:['左侧！\n正前方！\n右侧！']});
  const next=broker.applyJob(j.id);
  assert.equal(next.shots[1].id,p.shots[0].id);
  assert.deepEqual(next.shots[1].subtitleTracks,p.shots[0].subtitleTracks);
  assert.deepEqual(voiceStatus(next,'en').missing,next.shots.filter(s=>s.id!=='s0').map(s=>s.id));
});
test('音乐断句拒绝改词，用户真正改词时只将改动过的段落列为待配音',async()=>{
  const p=phrasingDraft(['往左走。','再向前。','看水面。'],['zh','zh',null]);
  const j=broker.prepare(p,null,'phrasing');
  broker.approve(j.id,async()=>({text:'往右走。\n再向前！\n看水面！'}));
  const result=await wait(j.id);assert.equal(result.status,'failed');assert.match(result.error,/改动了原稿/);
  assert.deepEqual(store.get(p.id),p);
  const edited=store.write(update(p,{...p,script:p.script.replace('左','右')}),p.version);
  assert.deepEqual(voiceStatus(edited).missing,['s0','s2']);
  assert.ok(!edited.shots[0].subtitleTracks?.zh);
  assert.deepEqual(edited.shots[1].subtitleTracks,p.shots[1].subtitleTracks);
  assert.deepEqual(edited.shots[1].assetIds,p.shots[1].assetIds);
});
test('短句字幕保留全部文字、实测边界与停顿，SRT二次处理不改变结果',()=>{
  const text='月亮为什么总是大致用同一面对着地球？难道它不自转吗？我们从地球上方看，在月亮朝向地球的一面做个标记，接着看它怎样绕地球运动。';
  const original=[{from:12,until:300,lang:'zh',zh:text,timing:'精确起止'},{from:320,until:360,lang:'zh',zh:'继续观察。'}];
  const cues=displayCaptions(captionDisplayCues(original,360,'voice'));
  assert.ok(cues.length>2);assert.equal(cues.map(c=>c.zh).join(''),text+'继续观察。');
  assert.equal(cues[0].from,12);assert.equal(cues.at(-2).until,300);assert.equal(cues.at(-1).from,320);
  assert.ok(cues.filter(c=>c.displayTiming).every(c=>c.displayTiming.includes('非词级实测')));
  assert.deepEqual(displayCaptions(cues),cues);
  const film={canvas:{fps:24},captions:cues,variant:'zh',captionMode:'voice'};
  assert.equal(srt(film),srt({...film,captions:displayCaptions(cues)}));
});
test('字幕显示与语言选择不会改变动画输入，正文变动仍需更新动画',()=>{
  const p=prepared(),s=p.shots[0],input=motionInputs(p,s),before=sceneProps(p,s.id);
  p.captionMode='bilingual';s.captionLayout='short';
  assert.ok(sameMotionInputs(input,motionInputs(p,s)));assert.deepEqual(renderIssues(p,s.id,p.voice),[]);
  assert.deepEqual(sceneProps(p,s.id).voices,before.voices);
  s.zh+='新内容';assert.ok(!sameMotionInputs(input,motionInputs(p,s)));
});
test('字幕意见只触发本地渲染，保留配音、BGM、动画、来源和旧视频',async()=>{
  const p=prepared(),source=fakeRender(p,p.shots[0].id,p.voice);let renders=0;
  store.persistJob({...source,review:{decision:'changes',scope:'captions',note:'字幕太长',time:.6}});
  const result=reviseSegment(p,store.job(source.id),'captions','',{interval:1,approve:()=>{throw Error('不能重新调用AI动画');},render:(...args)=>{renders++;return fakeRender(...args);}});
  assert.equal((await wait(result.batch.id)).status,'done');assert.equal(renders,1);
  const next=store.get(p.id);assert.deepEqual(next.assets,p.assets);assert.deepEqual(next.claims,p.claims);
  assert.deepEqual(next.shots[0].motionPlan,p.shots[0].motionPlan);assert.equal(next.shots[0].captionLayout,'short');
  assert.ok(fs.existsSync(path.join(store.data,'exports',source.id,'sample.mp4')));
  assert.equal(segmentStatus(next).rows[0].status,'review');assert.equal(store.jobs(p.id).filter(j=>j.task==='motion').length,0);
});
test('已有待修改分段不混入缺失生成范围，取消保留当前段并停止后续',async()=>{
  const p=prepared(),first=fakeRender(p,p.shots[0].id,p.voice);
  store.persistJob({...first,review:{decision:'changes',scope:'visual',note:'需要调整',time:.2}});
  const batch=startSegments(p,{shotIds:[p.shots[0].id]},'',{interval:1,approve:()=>{throw Error('不应重做已有片');},render:()=>{throw Error('不应重渲已有片');}});
  assert.equal((await wait(batch.id)).status,'done');assert.equal(segmentStatus(p).rows[0].status,'changes');
  const {p:input}=motionFixture();input.shots.push({...input.shots[0],id:uid()});explanationScriptFixture(input);const q=store.write(input,0);
  const cancelled=startSegments(q,{},'',{approve:()=>{throw Error('取消后不能提交');}});cancelSegments(cancelled.id);
  assert.equal((await wait(cancelled.id)).status,'cancelled');assert.ok(store.job(cancelled.id).items.every(i=>i.status==='waiting'));
});
test('未制作段落显示等待，而不是动作校验错误',()=>{
  const {p:input}=motionFixture(),p=store.write(input,0),row=segmentStatus(p).rows[0];
  assert.equal(row.status,'waiting');assert.deepEqual(row.quality.designIssues,[]);
});
test('已返回的无效动画自动定向修复；次数有限且未知提交绝不重发',async()=>{
  const {p:input,raw}=motionFixture(),p=store.write(input,0);let count=0;
  const j=broker.prepare(p,p.shots[0].id,'motion');
  broker.approve(j.id,async prompt=>{count++;if(count===2)assert.match(prompt,/previousOutput/);return count===1?{...raw,claimIds:[]}:raw;});
  const done=await wait(j.id);assert.equal(done.status,'ready');assert.equal(count,2);assert.equal(done.validationAttempts.length,1);
  const {p:other}=motionFixture(),q=store.write(other,0),uncertain=broker.prepare(q,q.shots[0].id,'motion');let calls=0;
  broker.approve(uncertain.id,async()=>{calls++;throw Object.assign(Error('结果待核对'),{uncertain:true});});
  assert.equal((await wait(uncertain.id)).status,'unknown');assert.equal(calls,1);
  const {p:last,raw:broken}=motionFixture(),r=store.write(last,0),bad=broker.prepare(r,r.shots[0].id,'motion');let repairs=0;
  broker.approve(bad.id,async()=>{repairs++;return {...broken,claimIds:[]};});
  const failed=await wait(bad.id);
  assert.equal(failed.status,'failed');assert.equal(repairs,2);assert.match(failed.error,/停止重复生成/);
});
test('正常观看记录跨播放器累计，只映射到合成文件的原分段版本',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  let state={ranges:[],last:null};
  for(let i=0;i<=12;i++)state=observePlayback(state,{time:i*.25,wall:i*250,rate:1,seeking:false,playing:true});
  saveWatched(storage,'clip-a',3,state.ranges);assert.ok(playbackComplete(readWatched(storage,'clip-a',3),3));
  assert.deepEqual(readWatched(storage,'clip-new',3),[]);
  const parts=joinedCoverage([{jobId:'first',frames:48},{jobId:'second',frames:72}],24,[[0,2.5],[4,5]]);
  assert.deepEqual(parts[0].ranges,[[0,2]]);assert.deepEqual(parts[1].ranges,[[0,.5],[2,3]]);
  assert.equal(playbackComplete(parts[1].ranges,3),false);
  const seek=observePlayback(state,{time:20,wall:3250,rate:1,seeking:true,playing:true});assert.deepEqual(seek.ranges,state.ranges);
});
test('播放错误的解决方案不混入配音付费操作，语音连接错误提供本机替代',()=>{
  const video=issueHelp('样片加载失败',{area:'样片播放'});
  assert.ok(!/配音|付费/.test(video.steps.join('')));
  const voice=issueHelp('fetch failed',{area:'豆包配音'});assert.match(voice.steps.join(''),/本机离线/);
});

test('只补英文字幕保留中文配音、BGM与有效动画，不会掩盖本来过期的动画',async()=>{
  for(const stale of [false,true]) {
    const base=prepared(),input=structuredClone(base);input.captionMode='bilingual';input.shots[0].en='';
    input.shots[0].motionPlan.inputs=motionInputs(input,input.shots[0]);
    if(stale)input.shots[0].visual+='新增尚未制作的画面';
    const p=store.write(input,base.version),j=broker.prepare(p,null,'translation',{captionTranslation:true});
    broker.approve(j.id,async()=>({segments:[{id:p.shots[0].id,en:'Test narration.'}]}));assert.equal((await wait(j.id)).status,'ready');
    const next=broker.applyJob(j.id);assert.equal(next.voice,'zh');assert.deepEqual(next.assets,p.assets);
    assert.deepEqual(next.scienceFlow.proofs,p.scienceFlow.proofs);assert.deepEqual(next.shots[0].motionPlan.nodes,p.shots[0].motionPlan.nodes);
    assert.equal(next.shots[0].en,'Test narration.');assert.equal(next.shots[0].reviewed,false);
    const issues=renderIssues(next,next.shots[0].id,'zh');
    if(stale)assert.match(issues.join('；'),/内容已修改/);else assert.deepEqual(issues,[]);
  }
});

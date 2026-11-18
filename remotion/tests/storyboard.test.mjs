import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {emptyClaim, emptyShot, uid, update} from '../shared/model.mjs';
import {scriptReady} from '../shared/science-flow.mjs';
import {motionFixture,explanationScriptFixture} from './fixtures/motion.mjs';
import {motionReferences, referenceMotionKey, referenceScriptKey} from '../shared/reference-motion.mjs';
import {directTask, mergeGeneratedProject} from '../shared/automatic-workflow.mjs';
import {storyboardContext, storyboardResult, checkedStoryboardDraft, writeStoryboardSchema} from '../server/storyboard.mjs';

process.env.FRAMEBOARD_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'frameboard-storyboard-'));
const {write, get, job, jobs, persistJob, data} = await import('../server/store.mjs');
const {prepare, approve, applyJob, prompt, validateResult, recoverSavedStoryboard} = await import('../server/codex.mjs');

function fixture(count = 7) {
  const {p, raw} = motionFixture();
  p.claims.push({...emptyClaim(), text:'待核实的补充资料'});
  p.shots = Array.from({length:count}, (_, i) => {
    const zh = i < 2 ? '同一句口播' : '第 ' + (i + 1) + ' 段口播';
    return {...emptyShot(), zh, en:i === 0 ? 'Saved translation' : '', seconds:2, assetIds:['voice'],
      subtitleTracks:{zh:{assetId:'voice', text:zh, segments:[{from:0,until:2,text:zh}]}}};
  });
  p.script = p.shots.map(s => s.zh).join('\n');
  p.scienceFlow.referenceVideoUrls = 'https://example.org/reference.mp4';
  const ref = motionReferences(p)[0];
  p.scienceFlow.referenceMotion = [{referenceId:ref.id,inputKey:referenceMotionKey(ref),name:'镜头参考',duration:5,
    mediaHash:'test',summary:'柱形依次显现',segments:[{from:1,until:3,camera:'固定机位'},{from:4,until:5,camera:'近景'}],
    excluded:[{from:0,until:1},{from:3,until:4}]}];
  p.scienceFlow.rhythm = p.shots.map((_,i) =>
    '• ' + (i * 2) + '｜cueId=design｜对象=柱形｜动作=揭示第 ' + (i + 1) + ' 列｜形式=reveal').join('\n');
  p.scienceFlow.referenceScript = {inputs:referenceScriptKey(p), text:p.scienceFlow.rhythm,
    applications:[{referenceId:ref.id,from:1,until:2,scriptFrom:0,scriptUntil:2,adaptation:'先显示刻度，再显示第一列'}]};
  const rows = p.shots.map((s,i) => ({
    shotId:s.id, title:'第 ' + (i + 1) + ' 镜', purpose:'读出变化', visual:'沿同一标尺揭示第 ' + (i + 1) + ' 列',
    zh:'模型改写', en:'Generated translation', seconds:8, assetIds:['bgm'], graphic:'对照图', labels:['刻度'],
    annotations:[], beats:['认出刻度','揭示数值','停留'], continuity:raw.continuity, claimIds:raw.claimIds,
    scriptLine:i + 1, referenceId:ref.id, segmentNumber:1, adaptation:'沿用原片固定机位与顺次显现',
  }));
  explanationScriptFixture(p);
  return {p:write(p,0), rows};
}

async function finish(id) {
  for (let i = 0; i < 100 && job(id).status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(job(id).status,'ready',job(id).error);
}

test('一次提交覆盖七镜并按 ID 同时写入两块设计、对应脚本和参考时段，保留录音和重复旁白', async () => {
  const {p,rows} = fixture();
  const request = prepare(p,null,'storyboard');
  assert.equal(directTask(p,'storyboard'),true);
  assert.equal(prepare(p,null,'storyboard').id,request.id);
  const context = JSON.parse(prompt(p,request).split('\n').find(line => line.startsWith('{"autoMotionLibrary"')));
  assert.equal(context.shotTimeline.length,7);
  assert.deepEqual(context.shotTimeline[6].actionLines,[7]);
  assert.equal(context.shotTimeline[6].from,12);
  assert.equal(context.rhythmLines.join('\n'),p.scienceFlow.rhythm);
  assert.equal(context.referenceMotion.references[0].segments[0].camera,'固定机位');
  assert.equal(context.referenceMotion.references[0].segments[1].segmentNumber,2);
  assert.deepEqual(context.shotTimeline[0].referenceOptions.map(option=>option.segmentNumber),[1]);
  assert.deepEqual(context.shotTimeline[1].referenceOptions.map(option=>option.segmentNumber),[1,2]);
  assert.equal(context.referenceMotion.applications[0].adaptation,'先显示刻度，再显示第一列');
  const schema = JSON.parse(fs.readFileSync(writeStoryboardSchema(path.join(process.env.FRAMEBOARD_DATA,'schema.json'))));
  assert.ok(schema.properties.shots.items.required.includes('shotId'));
  assert.ok(schema.properties.shots.items.required.includes('continuity'));
  let calls = 0;
  approve(request.id,async () => {calls++; return {shots:[...rows].reverse()};});
  assert.throws(() => prepare(p,p.shots[0].id,'storyboard'),/正在生成/);
  await finish(request.id);
  assert.throws(() => prepare(p,null,'storyboard'),/待写入/);
  assert.ok(scriptReady(p));
  const result = applyJob(request.id);
  assert.equal(calls,1);
  assert.equal(result.version,p.version + 1);
  assert.equal(result.script,p.script);
  assert.deepEqual(result.claims,p.claims);
  assert.ok(scriptReady(result));
  assert.equal(result.scienceFlow.rhythm,p.scienceFlow.rhythm);
  assert.deepEqual(result.shots.map(s => s.id),p.shots.map(s => s.id));
  for (const [i,s] of result.shots.entries()) {
    const original = p.shots[i];
    assert.equal(s.title,rows[i].title);
    assert.equal(s.visual,rows[i].visual);
    assert.deepEqual(s.continuity,rows[i].continuity);
    assert.equal(s.zh,original.zh);
    assert.equal(s.en,original.en || rows[i].en);
    assert.equal(s.seconds,original.seconds);
    assert.deepEqual(s.assetIds,original.assetIds);
    assert.deepEqual(s.subtitleTracks,original.subtitleTracks);
    assert.equal(s.storyboardBasis.text,context.rhythmLines[i]);
    assert.equal(s.storyboardBasis.from,1);
    assert.equal(s.storyboardBasis.until,3);
    assert.equal(s.reviewed,false);
  }
  assert.equal(job(request.id).status,'applied');
  const editing = structuredClone(p);
  editing.shots[0].continuity = {camera:'刚才手写的机位'};
  const merged = mergeGeneratedProject(p,editing,result,'storyboard');
  assert.equal(merged.shots[0].continuity.camera,'刚才手写的机位');
  assert.equal(merged.shots[0].continuity.path,rows[0].continuity.path);
  assert.equal(merged.shots[0].visual,rows[0].visual);
  assert.equal(merged.shots[6].visual,rows[6].visual);
});

test('原片时间唯一匹配应用记录时修正误数的编号，原返回稿保持不变', () => {
  const {p,rows} = fixture(1);
  rows[0].segmentNumber = 2;
  rows[0].adaptation = '对应参考第2段1–3秒和本片0–2秒：固定刻度，依次揭示柱形。';
  const raw = {shots:rows}, original = structuredClone(raw);
  assert.throws(()=>storyboardResult(raw,p,{},validateResult),/对应记录.*第2段.*4–5秒.*第1段.*1–3秒/);
  const checked = checkedStoryboardDraft(raw,p,{},validateResult);
  assert.deepEqual(raw,original);
  assert.equal(checked.raw.shots[0].segmentNumber,1);
  assert.equal(checked.result[0].storyboardBasis.adaptation,'对应参考第1段1–3秒和本片0–2秒：固定刻度，依次揭示柱形。');
  assert.deepEqual(checked.adjustments,[{shotId:rows[0].shotId,referenceId:rows[0].referenceId,
    fromSegment:2,toSegment:1,from:1,until:3}]);
});

test('没有明确原片时间、仅近似或范围不全时不猜选参考，冲突引用与歧义继续拒绝', () => {
  const {p,rows} = fixture(1);
  for (const adaptation of ['顺次显示柱形','对应参考第2段1.1–3秒：顺次显示','对应参考第2段1–2秒：顺次显示',
    '本片1–3秒；没有选择参考','不采用参考第2段1–3秒', '对应参考第1段1–3秒']) {
    assert.throws(()=>checkedStoryboardDraft({shots:[{...rows[0],segmentNumber:2,adaptation}]},p,{},validateResult),/对应记录|编号与借鉴说明/);
  }
  const wrong = {shots:[{...rows[0],segmentNumber:2,adaptation:'对应参考第2段1–3秒：顺次显示'}]};
  const ambiguous = structuredClone(p);
  ambiguous.scienceFlow.referenceMotion[0].segments.push({...ambiguous.scienceFlow.referenceMotion[0].segments[0]});
  ambiguous.scienceFlow.referenceScript.inputs=referenceScriptKey(ambiguous);
  assert.throws(()=>checkedStoryboardDraft(wrong,ambiguous,{},validateResult),/对应记录/);
  const excluded = structuredClone(p);
  excluded.scienceFlow.referenceMotion[0].excluded.push({from:1,until:3});
  assert.throws(()=>checkedStoryboardDraft(wrong,excluded,{},validateResult),/对应记录/);
  assert.throws(()=>checkedStoryboardDraft({shots:[{...wrong.shots[0],referenceId:'unknown'}]},p,{},validateResult),/参考视频片段/);
});

test('两个片段都可用时不以文字时间覆盖另一个有效选择，也不修复其他分镜错误', () => {
  const {p,rows} = fixture(2);
  assert.throws(()=>checkedStoryboardDraft({shots:[{...rows[1],segmentNumber:2,
    adaptation:'对应参考第2段1–3秒：顺次显示'}]},p,{shotId:rows[1].shotId},validateResult),/不能自动改选/);
  const mismatch = {...rows[0],segmentNumber:2,adaptation:'对应参考第2段1–3秒：顺次显示'};
  for (const [patch,pattern] of [[{scriptLine:2},/脚本行/],[{claimIds:['unknown']},/科学依据/],
    [{assetIds:['unknown']},/未知素材/],[{continuity:{...mismatch.continuity,handoff:''}},/衔接/]]) {
    assert.throws(()=>checkedStoryboardDraft({shots:[{...mismatch,...patch},rows[1]]},p,{},validateResult),pattern);
  }
});

test('六位小数切点不会把下一镜的参考误列给前镜，实际跨镜重叠仍保留', () => {
  const {p,rows} = fixture(2);
  p.scienceFlow.referenceScript.applications[0].scriptUntil=2.0000003;
  p.scienceFlow.referenceScript.applications.push({referenceId:rows[0].referenceId,from:4,until:5,
    scriptFrom:1.9999997,scriptUntil:4,adaptation:'第二镜采用近景'});
  let context=storyboardContext(p);
  assert.deepEqual(context.shotTimeline.map(shot=>shot.referenceOptions.map(option=>option.segmentNumber)),[[1],[2]]);
  assert.throws(()=>storyboardResult({shots:[{...rows[0],segmentNumber:2}, {...rows[1],segmentNumber:2}]},p,{},validateResult),/对应记录/);
  p.scienceFlow.referenceScript.applications[1].scriptFrom=1.9;
  context=storyboardContext(p);
  assert.deepEqual(context.shotTimeline[0].referenceOptions.map(option=>option.segmentNumber),[1,2]);
});

test('编号修正复用一次生成的原稿并记录调整，不自动再调用生成服务', async () => {
  const {p,rows}=fixture(1), request=prepare(p,null,'storyboard');
  rows[0].segmentNumber=2; rows[0].adaptation='对应参考第2段1–3秒：固定刻度顺序揭示。';
  let calls=0;
  approve(request.id,async()=>{calls++;return {shots:rows};});
  await finish(request.id);
  const ready=job(request.id);
  assert.equal(calls,1);
  assert.equal(ready.localStoryboardAdjustments.length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'jobs',ready.id,'received-storyboard.json'))).shots[0].segmentNumber,2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'jobs',ready.id,'completed-storyboard.json'))).shots[0].segmentNumber,1);
  const saved=applyJob(ready.id);
  assert.equal(saved.shots[0].storyboardBasis.from,1);
  assert.deepEqual(saved.shots[0].subtitleTracks,p.shots[0].subtitleTracks);
});

function failedStoryboard(p,rows) {
  const request=prepare(p,null,'storyboard');
  const dir=path.join(data,'jobs',request.id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({shots:rows}));
  return persistJob({...request,status:'failed',error:'参考片段与对应记录不符'});
}

test('本地恢复保留失败回执与原文件、重复恢复幂等，采用后保留音频和脚本', () => {
  const {p,rows}=fixture(1);
  rows[0].segmentNumber=2; rows[0].adaptation='对应参考第2段1–3秒：固定刻度顺序揭示。';
  const source=failedStoryboard(p,rows),file=path.join(data,'jobs',source.id,'result.json'),original=fs.readFileSync(file,'utf8');
  const restored=recoverSavedStoryboard(source.id,p.version);
  assert.equal(restored.recoveryOf,source.id);
  assert.equal(restored.localStoryboardAdjustments.length,1);
  assert.equal(recoverSavedStoryboard(source.id,p.version).id,restored.id);
  const saved=applyJob(restored.id);
  assert.equal(recoverSavedStoryboard(source.id,saved.version).id,restored.id);
  assert.equal(job(source.id).status,'failed');
  assert.equal(job(source.id).error,source.error);
  assert.equal(fs.readFileSync(file,'utf8'),original);
  assert.deepEqual(saved.assets,p.assets);
  assert.deepEqual(saved.shots[0].subtitleTracks,p.shots[0].subtitleTracks);
  assert.equal(saved.scienceFlow.rhythm,p.scienceFlow.rhythm);
  assert.equal(jobs(p.id).length,2);
});

test('草稿换版、请求执行中或待核对、含歧义的原稿均不能恢复覆盖', () => {
  for (const mode of ['version','running','unknown','ambiguous','missing']) {
    const {p,rows}=fixture(1);
    rows[0].segmentNumber=2;rows[0].adaptation='无法确认参考时间';
    const source=failedStoryboard(p,rows);
    if (mode==='version')write({...p,title:'用户刚才改过'},p.version);
    if (['running','unknown'].includes(mode))persistJob({...source,status:mode});
    if (mode==='missing')fs.unlinkSync(path.join(data,'jobs',source.id,'result.json'));
    const current=get(p.id),before=jobs(p.id);
    assert.throws(()=>recoverSavedStoryboard(source.id,current.version),/已修改|仅可恢复|对应记录|没有完整/);
    assert.deepEqual(get(p.id),current);
    assert.deepEqual(jobs(p.id),before);
  }
});

test('缺少参考、脚本已过期或提交待核对时不能另发分镜请求', () => {
  const {p} = fixture();
  for (const [key,value,pattern] of [
    ['referenceMotion',[],/完成参考视频分析/], ['rhythm','',/生成节奏脚本/],
    ['rhythm','修改后的节奏脚本',/更新上方的节奏脚本/],
  ]) {
    const changed = {...p,scienceFlow:{...p.scienceFlow,[key]:value}};
    assert.throws(() => prepare(changed,null,'storyboard'),pattern);
  }
  persistJob({id:uid(),project:p.id,version:p.version,type:'codex',task:'rhythm',status:'unknown'});
  assert.throws(() => prepare(p,null,'storyboard'),/节奏脚本的提交结果待核对/);
  assert.ok(!jobs(p.id).some(j => j.task === 'storyboard'));
});

test('不采用串镜或残缺的结果、错配脚本行、删除的参考段与不符的参考对应关系', () => {
  const {p,rows} = fixture(13);
  const validate = (shots) => storyboardResult({shots},p,{shotId:null},validateResult);
  assert.equal(validate(rows).length,13);
  assert.throws(() => validate(rows.slice(1)),/完整覆盖/);
  const rejected = (patch,pattern) => assert.throws(() => validate([{...rows[0],...patch},...rows.slice(1)]),pattern);
  rejected({shotId:rows[1].shotId},/镜头编号/);
  rejected({scriptLine:2},/脚本行/);
  rejected({segmentNumber:3},/参考视频片段/);
  rejected({segmentNumber:2},/对应记录/);
  rejected({continuity:{...rows[0].continuity,handoff:''}},/衔接/);
  rejected({claimIds:['unknown']},/科学依据/);
  p.scienceFlow.referenceMotion[0].excluded.push({from:2,until:2.5});
  rejected({},/参考视频片段/);
  assert.equal(get(p.id).version,p.version);
});

test('单镜重做只更新选定 ID；生成后稿件换版时保留旧结果', async () => {
  const {p:base,rows} = fixture(2);
  const p = write({...base,shots:base.shots.map((s,i) =>
    i === 0 ? {...s,claimIds:[base.claims[0].id],reviewed:true} : s)}, base.version);
  const j = prepare(p,p.shots[1].id,'storyboard');
  approve(j.id,async () => ({shots:[rows[1]]}));
  await finish(j.id);
  const result = applyJob(j.id);
  assert.equal(result.shots[0].visual,p.shots[0].visual);
  assert.equal(result.shots[0].continuity,undefined);
  assert.equal(result.shots[0].reviewed,true);
  assert.equal(result.shots[1].reviewed,false);
  assert.deepEqual(result.claims,p.claims);
  assert.ok(scriptReady(result));
  assert.equal(result.shots[1].continuity.path,rows[1].continuity.path);
  const {p:other,rows:otherRows} = fixture(2);
  const old = prepare(other,null,'storyboard');
  approve(old.id,async () => ({shots:otherRows}));
  await finish(old.id);
  const saved = write({...other,title:'用户刚编辑的新版本'},other.version);
  assert.throws(() => applyJob(old.id),/旧版本/);
  assert.equal(get(other.id).version,saved.version);
  assert.equal(get(other.id).shots[0].visual,'');
});

test('分镜引用不能代替资料核实，改动原结论或出处仍使核实失效', () => {
  const {p} = fixture(1);
  const changed = structuredClone(p);
  changed.claims[0].locator = '修改后的出处章节';
  changed.claims[1].verified = true;
  const saved = update(p,changed,{storyboardShotIds:new Set([p.shots[0].id])});
  assert.ok(saved.claims.every(c => !c.verified));
  assert.equal(scriptReady(saved),false);
});

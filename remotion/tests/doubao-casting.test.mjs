import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { draft, emptyShot, timeline } from "../shared/model.mjs";
import { castingChoice } from "../shared/direction.mjs";
import { wave } from "../server/wave.mjs";
import {voiceAssemblyPlan} from '../shared/voice-assembly.mjs';
import {segmentFingerprint} from '../server/segment-fingerprint.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frameboard-doubao-"));
process.env.FRAMEBOARD_DATA = dir;
const { save, get, db, write } = await import("../server/store.mjs");
const {upload}=await import('../server/media.mjs');
after(() => {
  db.close();
  if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith("frameboard-doubao-"))
    fs.rmSync(dir, { recursive: true, force: true });
});
const { doubaoCasting } = await import("../server/doubao-casting.mjs");
const outputs = path.join(dir, "speech");
const bytes = wave(Float32Array.from({length:8000*3},(_,i)=>.15*Math.sin(2*Math.PI*220*i/8000)), 8000);
const hash = createHash("sha256").update(bytes).digest("hex");
const shots = () => [1, 2].map(() => ({ ...emptyShot(), zh: "进入。离开。", en: "Enter. Leave." }));
const newProject = () => save({ ...draft("science"), topic: "试听验证", shots: shots() });

function simulatedSpeech({ disconnect = false, captions = true, uncertain=false } = {}) {
  const requests = new Map(), calls = [];
  async function call(name, args) {
    calls.push(name);
    if (name === "doubao_prepare_speech") {
      const id = randomUUID();
      const record = { id, kind: "speech", status: "prepared", payload: args,
        summary: { voice: "测试音色", characters: Array.from(args.text).length } };
      requests.set(id, record);
      return record;
    }
    const record = requests.get(args.request_id);
    if (name === "doubao_get_request") return record;
    assert.equal(name, "doubao_execute_request");
    if(args.billing_mode==='paid_approved'){
      assert.match(args.billing_note,/点击生成/);assert.ok(args.billing_note.includes(args.request_id));
      assert.match(args.billing_note,/未声明免费额度/);
    }
    assert.equal(record.status, "prepared");
    if(uncertain){record.status='needs_review';record.error='fetch failed';return record;}
    const { text, speaker_id } = record.payload;
    const segments = text.startsWith("进入") ? ["进入。", "离开。"] : ["Enter.", " Leave."];
    fs.mkdirSync(path.join(outputs, record.id), { recursive: true });
    fs.writeFileSync(path.join(outputs, record.id, "narration.wav"), bytes);
    record.status = "completed";
    record.result = { request_id: record.id, text, speaker_id, duration: 3, sha256: hash,
      captions: captions ? [{ text: segments[0], start: .2, end: 1 }, { text: segments[1], start: 1.5, end: 2.8 }] : [] };
    if (disconnect) throw Error("模拟提交后的连接中断");
    return record;
  }
  return { casting: doubaoCasting(call, outputs, async id=>requests.get(id)), calls, requests };
}
const confirmed = { confirmed: true, billingNote: "模拟服务，不消耗额度", billingMode: "free_quota" };

async function legacyTake() {
  let p=newProject();
  const music={...upload('music.wav',wave(new Float32Array(8000*10),8000)),role:'music'};
  p=save({...p,assets:[music],scienceFlow:{bgmId:music.id}});
  p=write({...p,scienceFlow:{...p.scienceFlow,analysis:{clipId:music.id,from:0,until:10,marks:[{time:.5,change:'声音增强'}]}}},p.version);
  const sim=simulatedSpeech(),input={shotId:p.shots[0].id,lang:'zh',speaker:'Vivi'};
  const take=await sim.casting.prepare(p,input);
  const done=await sim.casting.execute(p,{...input,requestId:take.id,...confirmed});
  const old={...upload('历史停顿.wav',wave(new Float32Array(8000*4),8000),{
    ...done.candidate,segments:done.candidate.segments.map(s=>({...s,from:s.from+1,until:s.until+1})),
    voiceMusic:{...done.candidate.voiceMusic,processingVersion:1,mode:'sentence-pauses',alignedDuration:4,insertions:[{at:.2,seconds:1}]},
  }),role:'zh',confirmed:true};
  p=save(castingChoice(p,input.shotId,old));
  p=write({...p,shots:p.shots.map((s,i)=>i? s:{...s,reviewed:true}),scienceFlow:{...p.scienceFlow,rhythm:'旧的四秒节奏脚本',scriptVersion:p.version,proofVersion:p.version,proofs:[{},{},{}],sampleJob:'old-film'}},p.version);
  db.prepare('UPDATE doubao_auditions SET body=? WHERE id=?').run(JSON.stringify({...done,candidate:old}),take.id);
  return {...sim,p,old,take,input:{...input,assetId:old.id,version:p.version}};
}

test('从本机原件恢复旧停顿录音：不重新调用配音，字节及字幕真实时间恢复，旧版本保留并失效旧时序',async()=>{
  const {p,old,take,input,casting,calls}=await legacyTake(),before=calls.length;
  const next=await casting.restoreOriginal(p,input),s=next.shots[0],voice=next.assets.find(a=>s.assetIds.includes(a.id));
  assert.equal(calls.length,before);
  assert.deepEqual(fs.readFileSync(path.join(dir,'uploads',path.basename(voice.src))),bytes);
  assert.equal(voice.duration,3);assert.equal(voice.voiceMusic.mode,'preserve-speech');
  assert.equal(s.subtitleTracks.zh.segments[0].from,.2);
  assert.equal(s.seconds,3);assert.equal(timeline(next).rows[1].from/next.fps,3);
  assert.equal(s.reviewed,false);assert.equal(next.scienceFlow.rhythm,'');assert.equal(next.scienceFlow.proofVersion,undefined);
  assert.notEqual(voiceAssemblyPlan(p).signature,voiceAssemblyPlan(next).signature);
  assert.notEqual(segmentFingerprint(p,s.id,'zh'),segmentFingerprint(next,s.id,'zh'));
  assert.ok(next.assets.some(a=>a.id===old.id));assert.ok(get(p.id,p.version).shots[0].assetIds.includes(old.id));
  assert.deepEqual(next.shots[1].assetIds,p.shots[1].assetIds);
  const history=casting.history(next,input).find(r=>r.id===take.id);
  assert.equal(history.candidate.id,voice.id);assert.equal(history.previousCandidates[0].id,old.id);
  await assert.rejects(casting.restoreOriginal(p,input),/已更新/);
  await assert.rejects(casting.restoreOriginal(next,{...input,version:next.version,assetId:voice.id}),/没有可恢复/);
});

test('恢复拒绝过期台词、未采用资产、错误回执及损坏原件，失败不改当前版本',async()=>{
  const {p,input,take,casting,requests,calls}=await legacyTake(),count=calls.length;
  await assert.rejects(casting.restoreOriginal(p,{...input,shotId:p.shots[1].id}),/没有可恢复/);
  const changed=structuredClone(p);changed.shots[0].zh='已改台词';
  await assert.rejects(casting.restoreOriginal(changed,input),/台词已变化/);
  const receipt=requests.get(take.id),speaker=receipt.result.speaker_id;
  receipt.result.speaker_id='wrong';await assert.rejects(casting.restoreOriginal(p,input),/不匹配/);receipt.result.speaker_id=speaker;
  receipt.status='needs_review';await assert.rejects(casting.restoreOriginal(p,input),/不匹配/);receipt.status='completed';
  fs.writeFileSync(path.join(outputs,take.id,'narration.wav'),Buffer.from('损坏'));
  await assert.rejects(casting.restoreOriginal(p,input),/校验失败/);
  assert.equal(get(p.id).version,p.version);assert.equal(calls.length,count);
});

test('绕过界面提交英语音色配中文，在准备请求前阻止',async()=>{
  const p=newProject(),{casting,calls}=simulatedSpeech();
  await assert.rejects(casting.prepare(p,{shotId:p.shots[0].id,lang:'zh',speaker:'en_male_tim_uranus_bigtts'}),/Tim.*美式英语.*中文/);
  assert.deepEqual(calls,[]);
});
test('不明请求保持阻止重发，仅明确核对并授权后可创建新请求，旧记录保留',async()=>{
  const p=newProject(),{casting,calls}=simulatedSpeech({uncertain:true}),input={shotId:p.shots[0].id,lang:'zh',speaker:'Vivi'};
  const first=await casting.prepare(p,input),b={...input,requestId:first.id,...confirmed};
  const result=await casting.execute(p,b);assert.equal(result.error,'fetch failed');
  const callsBefore=calls.length;
  assert.deepEqual(casting.workbenchStatus(p).map(j=>[j.shotId,j.status,j.error]),[[input.shotId,'unknown','fetch failed']]);
  assert.deepEqual(casting.workbenchStatus({...p,shots:[]}),[]);
  assert.equal(calls.length,callsBefore);
  await assert.rejects(casting.prepare(p,input),/待核对/);
  assert.throws(()=>casting.authorizeRetry(p,b),/明确/);
  casting.authorizeRetry(p,{...b,acknowledgeUncertain:true});
  assert.deepEqual(casting.workbenchStatus(p),[]);
  const second=await casting.prepare(p,input);assert.notEqual(second.id,first.id);
  assert.equal(calls.filter(n=>n==='doubao_execute_request').length,1);
  assert.equal(casting.history(p,input).find(r=>r.id===first.id).status,'retry_authorized');
  assert.equal((await casting.check(p,b)).status,'retry_authorized');
});
test('BGM 实测变化和语速进入云端请求，返回音频与原始字幕时间保持连续',async()=>{
  let p=newProject();
  const music={...upload('music.wav',wave(new Float32Array(24000*10).fill(.1),24000)),role:'music'};
  p=save({...p,assets:[music],scienceFlow:{bgmId:music.id}});
  p=write({...p,scienceFlow:{...p.scienceFlow,analysis:{clipId:music.id,from:0,until:10,marks:[{time:.5,change:'声音增强'},{time:1.5,change:'声音减弱'},{time:2.5,change:'声音增强'}]}}},p.version);
  const {casting,requests}=simulatedSpeech(),input={shotId:p.shots[0].id,lang:'zh',speaker:'Vivi'};
  const take=await casting.prepare(p,input),payload=requests.get(take.id).payload;
  assert.equal(payload.speech_rate,8);assert.match(payload.direction,/声音增强/);
  const done=await casting.execute(p,{...input,requestId:take.id,...confirmed});
  assert.equal(done.candidate.voiceMusic.mode,'preserve-speech');
  assert.equal(done.candidate.segments[0].from,.2);
  const changed=structuredClone(p);changed.scienceFlow.analysis.marks[0].time=.7;
  assert.doesNotThrow(()=>casting.adopt(changed,{...input,requestId:take.id}));
  p=get(p.id);
  const adopted=casting.adopt(p,{...input,requestId:take.id});
  assert.equal(adopted.shots[0].subtitleTracks.zh.segments[0].from,.2);
  assert.equal(adopted.assets.find(a=>a.id===done.candidate.id).voiceMusic.key,take.musicPlan.key);
});
test('选择音色后直接生成，授权绑定当前请求，不伪造免费额度或重复提交',async()=>{
  const p=newProject(),{casting,calls}=simulatedSpeech();
  const input={shotId:p.shots[0].id,lang:'zh',speaker:'Vivi'};
  const prepared=await casting.prepare(p,input);
  const body={...input,requestId:prepared.id,directAuthorization:true,confirmed:true};
  const done=await casting.execute(p,body);assert.ok(done.candidate);
  await casting.execute(p,body);
  assert.equal(calls.filter(n=>n==='doubao_execute_request').length,1);
});
test("镜头试听从准备到采用可重开，中文英文分别对时，其他镜头保持原音轨", async () => {
  let p = newProject();
  const { casting, calls } = simulatedSpeech();
  const shotId = p.shots[0].id;
  for (const lang of ["en", "zh"]) {
    const input = { shotId, lang, speaker: lang === "en" ? "S_trained" : "Vivi" };
    const take = await casting.prepare(p, input);
    assert.equal((await casting.prepare(p, input)).id, take.id);
    const b = { ...input, requestId: take.id };
    await assert.rejects(casting.execute(p, b), /核对/);
    await assert.rejects(casting.execute(p, { ...b, shotId: p.shots[1].id, ...confirmed }), /不属于/);
    const done = await casting.execute(p, { ...b, ...confirmed });
    assert.equal(done.candidate.duration, 3);
    assert.equal((await casting.execute(p, { ...b, ...confirmed })).candidate.id, done.candidate.id);
    p = casting.adopt(p, b);
    const reloaded = get(p.id);
    assert.equal(reloaded.shots[0].subtitleTracks[lang].assetId, done.candidate.id);
    assert.equal(reloaded.shots[0].subtitleTracks[lang].segments[1].from, 1.5);
    assert.deepEqual(reloaded.shots[1].assetIds, []);
  }
  assert.equal(p.shots[0].assetIds.length, 2);
  assert.equal(calls.filter(name => name === "doubao_execute_request").length, 2);
  const cues = timeline(p, "zh").rows[0].captionCues;
  assert.equal(cues[0].from, Math.round(.2 * p.fps));
  assert.ok(cues[0].until < cues[1].from);
  const old = { ...p.assets.find(a => a.role === "zh"), id: randomUUID(), doubaoRequestId: undefined };
  const local = castingChoice(p, shotId, old);
  assert.equal(local.shots[0].subtitleTracks.zh, undefined);
  assert.ok(local.shots[0].subtitleTracks.en);
});
test("中断后按原编号恢复，缺时间戳不造字幕，改稿后不能采用旧音频", async () => {
  const p = newProject(), { casting, calls } = simulatedSpeech({ disconnect: true, captions: false });
  const input = { shotId: p.shots[0].id, lang: "zh", speaker: "Vivi" };
  const take = await casting.prepare(p, input);
  const b = { ...input, requestId: take.id, ...confirmed };
  await assert.rejects(casting.execute(p, b), /中断/);
  await assert.rejects(casting.prepare(p, input), /待核对/);
  assert.equal(casting.history(p, input)[0].status, "submitted");
  const recovered = await casting.check(p, b);
  assert.equal(recovered.candidate.segments, undefined);
  assert.equal((await casting.check(p, b)).candidate.id, recovered.candidate.id);
  assert.equal(calls.filter(n => n === "doubao_execute_request").length, 1);
  const changed = save({ ...p, shots: p.shots.map(s => ({ ...s, zh: "换了台词。" })) });
  assert.throws(() => casting.adopt(changed, b), /已变化/);
  const copy = save({ ...draft("science"), topic: "只读隔离校验", shots: p.shots });
  await assert.rejects(casting.check(copy, b), /不属于/);
});

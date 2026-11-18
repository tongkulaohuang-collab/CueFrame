import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { db, save, get, conflict } from "./store.mjs";
import { upload } from "./media.mjs";
import { castingChoice } from "../shared/direction.mjs";
import {voiceMusicPlan,musicDirection} from '../shared/voice-music.mjs';
import {alignVoiceToMusic} from './voice-music.mjs';
import catalog from '../vendor/doubao-speech/voices.json' with {type:'json'};
import {callWorkbenchSpeech,workbenchSpeech} from './doubao-service.mjs';
import {voiceTextIssue} from '../shared/voice-language.mjs';

async function callTool(name, args) {
  return callWorkbenchSpeech(name,args);
}
db.exec(`CREATE TABLE IF NOT EXISTS doubao_auditions (
  id TEXT PRIMARY KEY, project TEXT NOT NULL, shot TEXT NOT NULL, lang TEXT NOT NULL, body TEXT NOT NULL
)`);
function store(record) {
  db.prepare("INSERT OR REPLACE INTO doubao_auditions VALUES (?,?,?,?,?)")
    .run(record.id, record.project, record.shot, record.lang, JSON.stringify(record));
  return record;
}
function binding(p, b) {
  const shot = p.shots.find(s => s.id === b.shotId);
  if (!shot || !["zh", "en"].includes(b.lang)) throw Error("请选择当前项目中的镜头和试听语言");
  return shot;
}
function lookup(p, b) {
  binding(p, b);
  const row = db.prepare("SELECT body FROM doubao_auditions WHERE id=? AND project=? AND shot=? AND lang=?")
    .get(b.requestId || "", p.id, b.shotId, b.lang);
  if (!row) throw Error("这个试听请求不属于当前镜头及语言");
  return JSON.parse(row.body);
}
function assertCurrent(p, record, sameVersion) {
  const shot = p.shots.find(s => s.id === record.shot);
  if (shot?.[record.lang] !== record.text || (sameVersion && p.version !== record.version))
    throw conflict("镜头台词或草稿版本已变化，请重新准备试听");
  const preserved=!sameVersion&&record.candidate?.voiceMusic?.processingVersion===2&&record.candidate.voiceMusic.mode==='preserve-speech';
  if(!preserved&&record.musicPlan && voiceMusicPlan(p,record.shot,record.lang)?.key!==record.musicPlan.key)
    throw conflict('BGM 或前段时长已变化，请按当前音乐重新生成本段');
}
function precision(captions, text, duration) {
  if (!Array.isArray(captions) || !captions.length) return;
  const clean = value => value.replace(/\s/gu, "");
  const segments = captions.map(c => ({ text: c.text, from: c.start, until: c.end }));
  if (segments.some((s, i) => typeof s.text !== "string" || !s.text.trim() ||
      !Number.isFinite(s.from) || !Number.isFinite(s.until) || s.from < 0 ||
      s.until > duration || s.until < s.from + .01 || (i && s.from < segments[i - 1].until))) return;
  if (clean(segments.map(s => s.text).join("")) === clean(text)) return segments;
}
async function importResult(record, remote, outputs) {
  const result = remote.result;
  if (remote.id !== record.id || remote.kind !== "speech" || remote.status !== 'completed' || result?.request_id !== record.id ||
      result.speaker_id !== record.speaker || result.text !== record.text.trim())
    throw Error("返回的音频与本次试听不匹配");
  const base = fs.realpathSync(outputs);
  const file = fs.realpathSync(path.join(base, record.id, "narration.wav"));
  if (path.relative(base, file) !== path.join(record.id, "narration.wav"))
    throw Error("音频文件不在本次请求的输出目录");
  const bytes = fs.readFileSync(file);
  if (createHash("sha256").update(bytes).digest("hex") !== result.sha256) throw Error("音频文件校验失败");
  const segments = precision(result.captions, record.text, result.duration);
  const aligned=await alignVoiceToMusic(bytes,segments,record.musicPlan);
  const asset = upload("豆包-" + record.label + "-" + record.id.slice(0, 8) + ".wav", aligned.bytes, {
    voiceLang: record.lang, voiceLabel: record.label, scriptText: record.text,
    doubaoRequestId: record.id, speakerId: record.speaker, ...(aligned.segments ? { segments:aligned.segments } : {}),
    ...(aligned.voiceMusic?{voiceMusic:aligned.voiceMusic}:{}),
  });
  return { ...asset, role: record.lang, originType: "generated", source: "豆包语音 · " + record.label,
    credit: "豆包语音", license: "豆包语音服务条款", confirmed: false };
}

export function doubaoCasting(call = callTool, outputs = workbenchSpeech.outputs, readOriginal = id => workbenchSpeech.getRequest(id)) {
  async function sync(record, remote) {
    if (remote.id !== record.id || remote.kind !== "speech") throw Error("返回了不同的试听请求");
    const latest = JSON.parse(db.prepare("SELECT body FROM doubao_auditions WHERE id=?").get(record.id).body);
    if (latest.candidate) return latest;
    const candidate = remote.status === "completed" ? await importResult(record, remote, outputs) : null;
    const status=latest.status==='retry_authorized'&&!candidate?'retry_authorized':remote.status;
    return store({ ...latest, status, error: remote.error || "", errorCode:remote.error_code,
      submissionState:remote.submission_state,candidate });
  }
  return {
    async voices() {
      const { configured, selected_voice, voices } = await call("doubao_speech_status", {});
      return { configured, selectedVoice: selected_voice, voices, catalogSource:catalog.source, catalogUpdated:catalog.updated };
    },
    history(p, b) {
      // The storyboard can open casting before its new shot has been saved.
      if (["zh", "en"].includes(b.lang) && !p.shots.some(s => s.id === b.shotId)) return [];
      binding(p, b);
      return db.prepare("SELECT body FROM doubao_auditions WHERE project=? AND shot=? AND lang=? ORDER BY rowid DESC LIMIT 12")
        .all(p.id, b.shotId, b.lang).map(row => JSON.parse(row.body));
    },
    workbenchStatus(p) {
      const shots=new Map(p.shots.map(s=>[s.id,s]));
      const latest=new Set(),out=[];
      for(const row of db.prepare("SELECT body FROM doubao_auditions WHERE project=? ORDER BY COALESCE(json_extract(body,'$.created'),'') DESC,rowid DESC").iterate(p.id)){
        const r=JSON.parse(row.body),shot=shots.get(r.shot);
        if(!shot||shot[r.lang]!==r.text||r.status==='prepared')continue;
        const target=r.shot+':'+r.lang;
        const uncertain=['submitted','needs_review'].includes(r.status);
        if(!uncertain&&latest.has(target))continue;
        latest.add(target);
        if(r.status!=='failed'&&!uncertain)continue;
        out.push({id:r.id,type:'voice',project:p.id,shotId:r.shot,variant:r.lang,version:r.version,created:r.created,
          status:uncertain?'unknown':'failed',error:r.error||(uncertain?'配音已提交，请查询原请求的结果。':'原配音请求失败。')});
      }
      return out;
    },
    async prepare(p, b) {
      const shot = binding(p, b), text = shot[b.lang];
      if (!text?.trim()) throw Error("请先填写本镜对应语言的台词");
      const languageIssue=voiceTextIssue(catalog.voices.find(v=>v.speaker_id===b.speaker),text);
      if(languageIssue)throw Error(languageIssue);
      const musicPlan=voiceMusicPlan(p,shot.id,b.lang);
      const requests = this.history(p, b).filter(r => r.text === text && r.speaker === b.speaker);
      if (requests.some(r => ["submitted", "needs_review"].includes(r.status)))
        throw Error("这段台词已有待核对请求，请先查看原请求");
      const pending = requests.find(r => r.status === "prepared" && r.version === p.version &&
        r.direction === (b.direction || "") && (r.musicPlan?.key||null)===(musicPlan?.key||null));
      if (pending) return pending;
      const remote = await call("doubao_prepare_speech", {
        text, speaker_id: b.speaker, direction: musicDirection(musicPlan,b.direction||''), format: "wav",
        speech_rate:musicPlan?.speechRate||0,
        tone_fidelity: true,
      });
      if (!/^[a-f0-9-]{36}$/.test(remote.id) || remote.kind !== "speech" || remote.status !== "prepared")
        throw Error("未收到有效的试听请求编号");
      return store({ id: remote.id, project: p.id, version: p.version, created:new Date().toISOString(), shot: shot.id, lang: b.lang,
        text, speaker: remote.payload.speaker_id, label: remote.summary.voice, direction:b.direction||'', musicPlan,
        characters: remote.summary.characters, billing: remote.billing, status: remote.status, candidate: null });
    },
    async check(p, b) {
      const record = lookup(p, b);
      if (record.candidate) return record;
      return sync(record, await call("doubao_get_request", { request_id: record.id }));
    },
    authorizeRetry(p,b) {
      const record=lookup(p,b);
      if(record.status!=='needs_review'||b.acknowledgeUncertain!==true||b.confirmed!==true)
        throw Error('请核对这条原请求，再明确选择继续生成');
      return store({...record,status:'retry_authorized',retryAuthorizedAt:new Date().toISOString(),retryAuthorizedVersion:p.version});
    },
    async execute(p, b) {
      const record = lookup(p, b);
      if (record.candidate) return record;
      assertCurrent(p, record, true);
      if (record.status !== "prepared") throw Error("请先查询原试听请求的状态");
      const languageIssue=voiceTextIssue(catalog.voices.find(v=>v.speaker_id===record.speaker),record.text);
      if(languageIssue)throw Error(languageIssue);
      // The generate button authorizes this bound request; never claim free quota
      // or an account balance that the local workbench cannot actually read.
      if(b.confirmed===true && b.directAuthorization===true) b={...b,billingMode:'paid_approved',
        billingNote:`用户选择音色并点击生成，授权本次请求 ${record.id}（${record.characters} 字，${record.label}），按豆包账户实际资费结算；未声明免费额度。`};
      if (b.confirmed !== true || !["free_quota", "paid_approved"].includes(b.billingMode) ||
          typeof b.billingNote !== "string" || !b.billingNote.trim() || b.billingNote.length > 500)
        throw Error("请先核对本次额度或费用，并确认生成");
      store({ ...record, status: "submitted" });
      const remote = await call("doubao_execute_request", { request_id: record.id, confirmed: true,
        billing_mode: b.billingMode, billing_note: b.billingNote.trim() });
      return sync(record, remote);
    },
    adopt(p, b) {
      const record = lookup(p, b);
      assertCurrent(p, record, false);
      if (!record.candidate) throw Error("请先取得本镜的试听音频");
      return save(castingChoice(p, record.shot, { ...record.candidate, confirmed: true }));
    },
    async restoreOriginal(p,b) {
      const shot=binding(p,b);
      if(b.version!==p.version||get(p.id)?.version!==p.version)throw conflict('草稿已更新，请重新打开后再恢复原始配音');
      const chosen=p.assets.find(a=>a.id===b.assetId&&shot.assetIds.includes(a.id)&&a.kind==='audio'&&a.role===b.lang);
      if(!chosen?.doubaoRequestId||!['sentence-pauses','paragraph-entry'].includes(chosen.voiceMusic?.mode))
        throw Error('当前采用的配音没有可恢复的旧停顿处理');
      const record=lookup(p,{...b,requestId:chosen.doubaoRequestId});
      if(shot[b.lang]!==record.text||chosen.scriptText!==record.text)throw conflict('台词已变化，原始录音不再匹配当前段落');
      let original;
      try { original=await readOriginal(record.id); }
      catch(e) { if(e.code==='ENOENT')throw Error('找不到本机原始配音记录，已保留当前录音');throw e; }
      let candidate;
      try { candidate=await importResult(record,original,outputs); }
      catch(e) { if(e.code==='ENOENT')throw Error('找不到本机原始录音文件，已保留当前录音');throw e; }
      // Adopt through the usual path: real duration, original cues, invalidated
      // timeline/review signatures, and retained previous assets and versions.
      const draft=castingChoice(p,shot.id,{...candidate,confirmed:chosen.confirmed});
      if(draft.scienceFlow)draft.scienceFlow={...draft.scienceFlow,rhythm:''};
      const next=save(draft);
      const latest=lookup(next,{...b,requestId:record.id});
      store({...latest,candidate,previousCandidates:[...(latest.previousCandidates||[]),latest.candidate].filter(Boolean),restoredOriginalAt:new Date().toISOString()});
      return next;
    },
  };
}

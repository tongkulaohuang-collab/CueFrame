import { normalize, apply } from "../vendor/timeline/core.mjs";
import { continuityFields, continuityIssues, continuousChecks, processMediaIssues } from './continuous-direction.mjs';
import { approvalKey, linesFor, views, validStarts } from "./direction.mjs";
import { overlayIssues } from './overlays.mjs';
import { retainScienceFlow, scienceGate } from './science-flow.mjs';
import {imageNodeId,imageBoxOK} from './shot-images.mjs';
import {lemoStyle} from './lemo.mjs';
import {referenceDocuments} from './references.mjs';
import {matchNarrationParagraphs,phrasingText} from './automatic-workflow.mjs';
import {invalidateTranslations} from './narration-language.mjs';
import {validateLibraryShot} from './motion-library.mjs';
import {validateActorCatalog,actorCatalogInput,actorSkinIssues} from './actor-catalog.mjs';
import {validateContentBrief} from './content-contract.mjs';
import {validateSemanticScene,compileSemanticScene} from './semantic-scenes.mjs';
import {validateFilmStyle,reconcileFilmStyle,filmStyleContext,handoffInputs} from './film-style.mjs';
import {bridgeIssues} from './cross-handoff.mjs';
import {validatePhraseEdits,resolvePhraseEdits,applyPhraseEdits} from './phrase-edits.mjs';

export const sourceTypes = [
  "科研机构或高校",
  "政府部门或专业学会",
  "同行评审论文",
  "专业教材",
  "注明原始出处的科普文章",
  "自编示例与可复算模型",
  "标准组织或官方技术文档",
];
export const locks = [
  "实物外形、颜色与结构",
  "软件界面与按钮文案",
  "Logo、品牌色与字体",
  "规格参数与卖点",
];
export const productChecks = (type) => [locks[type === "software" ? 1 : 0], locks[2], locks[3]];
export const sourceChecked = (asset) => !!(asset.confirmed && asset.source?.trim() && asset.license?.trim());
export const quality = [
  "文字与标注清晰",
  "构图层次分明",
  "关键元素无遮挡",
  "图形放大后仍清楚",
  "动效无闪烁或跳帧",
];
export const screening = [
  ...quality,
  "缩小后文字仍可读",
  "叙事节奏与音画匹配",
  "品牌一致或科学示意准确",
];
export const qualityFor = p => p.kind === 'science' ? [...quality, ...continuousChecks] : quality;
export const stages = ["脚本", "分镜", "样镜", "导出前"];
export const graphics = ["产品特写", "步骤图", "对照图", "月相示意"];
export const filmLayouts = {
  observe: "月面观测",
  light: "日光照明",
  orbit: "地月视线",
  compare: "双视角对照",
  answer: "结论与来源",
  product: "产品操作特写",
};
export const uid = () => crypto.randomUUID();
export const emptyShot = () => ({
  id: uid(),
  title: "新镜头",
  purpose: "",
  zh: "",
  en: "",
  visual: "",
  graphic: "步骤图",
  labels: [],
  claimIds: [],
  assetIds: [],
  seconds: 6,
  reviewed: false,
});
export const emptyClaim = () => ({
  id: uid(),
  text: "",
  type: sourceTypes[0],
  title: "",
  url: "",
  locator: "",
  original: "",
  revision: 1,
  verified: false,
});
// The science narration draft is the source for voice segments. Unchanged
// paragraphs retain their identities/audio; changed text cannot reuse old takes.
export function syncNarration(p, {clearEmpty=false}={}) {
  if(p.kind!=='science' || !p.script?.trim() && !clearEmpty)return p;
  const paragraphs=matchNarrationParagraphs(p.script,p.shots);
  if(paragraphs.length===p.shots.length && paragraphs.every(({shot},i)=>shot===p.shots[i]))return p;
  const reserved=new Set(paragraphs.filter(row=>row.shot).map(row=>row.shot.id));
  const sameContent=phrasingText(p.shots.map(s=>s.zh).join('\n'))===phrasingText(p.script);
  const claims=[...new Set(p.shots.flatMap(s=>s.claimIds))];
  const shots=paragraphs.map(({text:zh,shot:exact},i)=>{
    if(exact)return exact;
    const old=p.shots[i];
    const reuse=old&&!reserved.has(old.id);
    const shot=sameContent&&reuse ? {...old} : {...emptyShot(),...(reuse?{id:old.id}:{})};
    Object.assign(shot,{zh,en:'',translationSourceZh:undefined,title:'口播 '+(i+1),reviewed:false,approvedLook:null,filmQA:[],motionReview:''});
    if(sameContent)shot.claimIds=claims;
    shot.assetIds=shot.assetIds.filter(id=>!p.assets.some(a=>a.id===id&&a.kind==='audio'&&['zh','en'].includes(a.role)));
    if(shot.subtitleTracks){shot.subtitleTracks={...shot.subtitleTracks};delete shot.subtitleTracks.zh;delete shot.subtitleTracks.en;}
    if(shot.manualTiming){shot.manualTiming={...shot.manualTiming};delete shot.manualTiming.zh;delete shot.manualTiming.en;}
    return shot;
  });
  return {...p,shots,scienceFlow:{...p.scienceFlow,rhythm:'',scriptVersion:null,proofVersion:null,proofs:null,sampleJob:null}};
}
export function draft(kind = "product") {
  return {
    id: uid(),
    version: 0,
    kind,
    filmStyle: {version:1,preset:kind==='science'?'editorial':'minimal',entityOrder:[],narrationFocus:true,narrationMotion:true,matchCuts:true},
    productType: "software",
    title: "",
    topic: "",
    script: "",
    references: "",
    referenceDocuments: [],
    width: 1920,
    height: 1080,
    look: "directed",
    fps: 24,
    target: null,
    language: "bilingual",
    voice: "zh",
    burnCaptions: true,
    captionMode: 'voice',
    captionLayout: 'short',
    flow: "review",
    pauses: ["分镜", "样镜"],
    overflow: "ask",
    assets: [],
    claims: [],
    shots: [],
    passed: [],
  };
}
const inRange = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
export function validateDraft(p, previous) {
  validateFilmStyle(p.filmStyle);
  for(const s of p.shots||[]){
    validatePhraseEdits(s.phraseEdits);
    if(s.handoff&&(!['continue','compare','reset','bridge'].includes(s.handoff.mode)||typeof s.handoff.reason!=='string'))throw Error('镜头交接信息无效');
    if(s.handoff?.mode==='bridge'){const issues=bridgeIssues(p.shots[p.shots.indexOf(s)-1]?.semanticScene,s.semanticScene,s.handoff);if(issues.length)throw Error(issues.join('；'));}
    if(s.semanticSync&&(['startQuote','endQuote'].some(k=>typeof s.semanticSync[k]!=='string'||s.semanticSync[k].length>120)||['startOccurrence','endOccurrence'].some(k=>s.semanticSync[k]!=null&&(!Number.isInteger(s.semanticSync[k])||s.semanticSync[k]<1||s.semanticSync[k]>100))))throw Error('动作同步台词无效');
  }
  validateContentBrief(p.contentBrief);
  for(const shot of p.shots||[])if(shot.semanticScene)validateSemanticScene(shot.semanticScene,p.assets);
  for(const s of p.shots||[])validateLibraryShot(s);
  if(p.productionMode!=null&&!['local-process','model-process','standard'].includes(p.productionMode))throw Error('制作流程无效');
  if(p.burnCaptions!=null&&typeof p.burnCaptions!=='boolean') throw Error('字幕烧录选项无效');
  if(p.captionMode!=null&&!['voice','bilingual'].includes(p.captionMode)) throw Error('字幕语言设置无效');
  if(p.captionLayout!=null&&!['short','original'].includes(p.captionLayout)) throw Error('字幕分句设置无效');
  if(p.shots.some(s=>s.captionLayout!=null&&!['short','original'].includes(s.captionLayout)))throw Error('分段字幕设置无效');
  if (p.look != null && !["directed", "classic"].includes(p.look))
    throw Error("未知画面风格");
  if (
    !["product", "science"].includes(p.kind) ||
    !["software", "physical"].includes(p.productType)
  )
    throw Error("请选择有效的视频和产品类型");
  if (
    ![p.topic, p.script, p.references].some(
      (s) => typeof s === "string" && s.trim(),
    ) &&
    !p.assets?.length &&
    !(p.kind==='science' && (lemoStyle(p.scienceFlow?.lemoStyleId) || lemoStyle(previous?.scienceFlow?.lemoStyleId)))
  )
    throw Error("请提供主题、脚本、素材或参考资料中的至少一项");
  if (
    ![p.width, p.height].every(
      (v) => Number.isInteger(v) && inRange(v, 160, 4096),
    ) ||
    !Number.isInteger(p.fps) ||
    !inRange(p.fps, 1, 60) ||
    (p.target != null && p.target !== 0 && !inRange(p.target, 1, 3600))
  )
    throw Error("画布边长需为 160–4096 像素，帧率 1–60；预设时长可留空或为 1–3600 秒");
  if (
    !["bilingual", "separate", "sequential"].includes(p.language) ||
    !["review", "direct"].includes(p.flow) ||
    !["zh", "en"].includes(p.voice) ||
    !["ask", "extend"].includes(p.overflow)
  )
    throw Error("语言、审稿或时长设置无效");
  for (const list of [p.assets, p.claims, p.shots]) {
    if (
      !Array.isArray(list) ||
      list.length > 250 ||
      list.some((x) => !x || typeof x.id !== "string" || !x.id) ||
      new Set(list.map((x) => x.id)).size !== list.length
    )
      throw Error("素材、结论或镜头编号无效");
  }
  if (!Array.isArray(p.pauses) || p.pauses.some((s) => !stages.includes(s)))
    throw Error("暂停节点无效");
  for (const s of p.shots)
    if (
      !inRange(s.seconds, 0.25, 3600) ||
      !graphics.includes(s.graphic) ||
      ![s.title, s.purpose, s.zh, s.en, s.visual].every(
        (x) => typeof x === "string",
      ) ||
      ![s.claimIds, s.assetIds, s.labels].every(
        (a) => Array.isArray(a) && a.every((x) => typeof x === "string"),
      )
    )
      throw Error("分镜的文本、时长、图形或关联项无效");
  for (const s of p.shots) {
    if(s.imageBindings!=null && (!Array.isArray(s.imageBindings)||s.imageBindings.length>160||
      new Set(s.imageBindings.map(b=>b?.nodeId)).size!==s.imageBindings.length||
      s.imageBindings.some(b=>!b||!imageNodeId(b.nodeId)||typeof b.label!=='string'||!b.label.trim()||
        !p.assets.some(a=>a.kind==='image'&&a.id===b.assetId)||(b.box!=null&&!imageBoxOK(b.box)))))
      throw Error('本镜的图片、对象或取景位置无效');
    if (s.annotations != null && (!Array.isArray(s.annotations) || s.annotations.some(a=>!a || typeof a !== 'object')))
      throw Error('关键节点注释格式无效');
    if (s.subtitleTracks != null && (typeof s.subtitleTracks !== 'object' || Array.isArray(s.subtitleTracks) ||
        Object.values(s.subtitleTracks).some(t=>!t || typeof t !== 'object' || !Array.isArray(t.segments) || t.segments.some(c=>!c || typeof c !== 'object'))))
      throw Error('精确字幕格式无效');
    if(s.processVideoId!=null&&typeof s.processVideoId!=='string') throw Error('连续视频编号无效');
    if(s.continuity != null && (typeof s.continuity !== 'object' || Object.keys(continuityFields).some(k=>s.continuity[k]!=null&&typeof s.continuity[k]!=='string')))
      throw Error('连续镜头设计字段应为文字');
    if(s.processOffset != null && !inRange(s.processOffset,0,3600)) throw Error('连续视频起点无效');
    if (
      (s.layout && !Object.hasOwn(filmLayouts, s.layout)) ||
      (s.transition && !["cut", "dissolve"].includes(s.transition))
    )
      throw Error("未知镜头构图或转场");
    for (const field of ["beats", "beatSources", "beatViews"])
      if (
        s[field] != null &&
        (!Array.isArray(s[field]) ||
          s[field].length !== 3 ||
          !s[field].every((x) => typeof x === "string"))
      )
        throw Error("每镜需要三个画面节拍");
    if (
      s.beatViews?.some((x) => !views.includes(x)) ||
      (s.pace && !["明快", "舒展"].includes(s.pace))
    )
      throw Error("镜头取景或节奏无效");
    if (
      s.beatOffsets != null &&
      (!Array.isArray(s.beatOffsets) ||
        s.beatOffsets.length !== 3 ||
        s.beatOffsets.some((x) => !inRange(x, 0, 3600)))
    )
      throw Error("视频入点无效");
    for (const lang of ["zh", "en"]) {
      const m = s.manualTiming?.[lang];
      if (!m) continue;
      const a = p.assets.find((x) => x.id === m.assetId);
      if (
        a &&
        m.text === s[lang] &&
        !validStarts(m.starts, linesFor(s)[lang].length, a.duration)
      )
        throw Error("手动语句入点应从 0 递增，并在音频长度以内");
    }
  }
  if(p.shots.some(s=>s.phraseEdits?.length))for(const row of timeline(p).rows){
    const s=row.shot;if(!s.phraseEdits?.length)continue;
    const edits=resolvePhraseEdits(s,row,p.voice,p.fps),duration=row.frames/p.fps;
    // A new reference may be saved before its analysis. Validate the authored
    // phrase targets here; only preview/render requires a resolved appearance.
    if(s.semanticScene){const style=filmStyleContext(p);compileSemanticScene(s.semanticScene,{width:p.width,height:p.height,fps:p.fps,duration,assets:p.assets,filmStyle:style?.ready===false?null:style,phraseEdits:edits});}
    else if(s.motionPlan)applyPhraseEdits(structuredClone(s.motionPlan.nodes),edits,duration);
    else throw Error('词组编辑需要可编辑的文字画面');
  }
}
export function evidenceOK(c) {
  const source = (s) =>
    /^https?:\/\/[^\s/]+/i.test(s || "") ||
    /^\/media\/[a-f0-9-]+\.(pdf|txt)$/i.test(s || "");
  return !!(
    c?.text?.trim() &&
    sourceTypes.includes(c.type) &&
    c.title?.trim() &&
    source(c.url) &&
    c.locator?.trim() &&
    (c.type !== sourceTypes[4] || source(c.original))
  );
}
const fields = (o, keys) => JSON.stringify(keys.map((k) => o?.[k]));
const claimFields = ["text", "type", "title", "url", "locator", "original"];
const shotFields = [
  'voiceAlignment','semanticSync','handoff','phraseEdits',
  "semanticScene",
  'motionLibrary','libraryTransition',
  'subtitleTracks', 'annotations', 'captionLayout',
  'continuity', 'processVideoId', 'processOffset', 'motionPlan', 'processEngine', 'localProcess',
  "title",
  "purpose",
  "zh",
  "en",
  "visual",
  "graphic",
  "labels",
  "claimIds",
  "assetIds",
  "beats",
  "beatSources",
  "beatViews",
  "beatOffsets",
  "pace",
  "layout",
  "titleEn",
];
const assetFields = [
  "id",
  "src",
  "source",
  "license",
  "credit",
  "role",
  "confirmed",
  "checks",
  "kind",
  "originType",
  "referenceId",
];
export function update(previous, input, {storyboardShotIds} = {}) {
  let p = structuredClone(input);
  if(p.kind==='science' && p.scienceFlow && previous && p.script!==previous.script)
    p=syncNarration(p,{clearEmpty:true});
  p=invalidateTranslations(previous,p);
  reconcileFilmStyle(previous,p);
  p.referenceDocuments = referenceDocuments(p);
  if (p.target == null || p.target === 0) p.target = null;
  validateDraft(p,previous);
  const actorCatalog=validateActorCatalog(p);
  const actorConflicts=actorSkinIssues(p);if(actorConflicts.length)throw Error(actorConflicts.join('；'));
  if(actorCatalog.length)p.actorCatalog=actorCatalog;
  const changedClaims = new Set(),
    changedAssets = new Set();
  for (const c of p.claims) {
    const old = previous?.claims.find((x) => x.id === c.id);
    const changed = fields(old, claimFields) !== fields(c, claimFields);
    if (changed) changedClaims.add(c.id);
    c.revision = (old?.revision || 0) + (changed ? 1 : 0);
    c.verified = !!old?.verified && !changed;
  }
  for (const a of p.assets) {
    const old = previous?.assets.find((x) => x.id === a.id);
    if (fields(old, assetFields) !== fields(a, assetFields))
      changedAssets.add(a.id);
  }
  for (const s of p.shots) {
    const old = previous?.shots.find((x) => x.id === s.id);
    const actorChanged=JSON.stringify(actorCatalogInput(previous||{},old?.motionPlan))!==JSON.stringify(actorCatalogInput(p,s.motionPlan));
    const changed = fields(old, shotFields) !== fields(s, shotFields)||actorChanged||JSON.stringify(previous?.filmStyle)!==JSON.stringify(p.filmStyle)||previous&&JSON.stringify(filmStyleContext(previous))!==JSON.stringify(filmStyleContext(p))||JSON.stringify(handoffInputs(previous,old))!==JSON.stringify(handoffInputs(p,s));
    // Retiming the same narration invalidates shot review without changing the underlying scientific claim.
    const meaningKeys = shotFields.filter((k) => !["assetIds", "subtitleTracks", "manualTiming", "captionLayout",'voiceAlignment','semanticSync','handoff','phraseEdits'].includes(k) &&
      !(k === 'motionPlan' && !s.motionPlan));
    const visualIds = (project, shot) =>
      shot.assetIds.filter((id) =>
        project.assets.some((a) => a.id === id && a.kind !== "audio"),
      );
    const meaningChanged =
      old &&
      (fields(old, meaningKeys) !== fields(s, meaningKeys) ||
        JSON.stringify(visualIds(previous, old)) !==
          JSON.stringify(visualIds(p, s)));
    const visualChanged = s.assetIds.some(
      (id) =>
        changedAssets.has(id) &&
        p.assets.some((a) => a.id === id && a.kind !== "audio"),
    );
    // A validated storyboard uses existing source claims. Review its new
    // depiction on the shot. Edits to a claim or its source still invalidate it.
    const generatedDesign = storyboardShotIds?.has(s.id);
    if ((visualChanged || (meaningChanged && !generatedDesign)) && p.kind === "science")
      for (const id of s.claimIds) changedClaims.add(id);
    s.reviewed =
      !!old?.reviewed &&
      !generatedDesign &&
      !changed &&
      !s.assetIds.some(
        (id) => changedAssets.has(id) || !p.assets.some((a) => a.id === id),
      );
  }
  for (const c of p.claims) if (changedClaims.has(c.id)) c.verified = false;
  for (const s of p.shots)
    if (
      s.claimIds.some(
        (id) => changedClaims.has(id) || !p.claims.some((c) => c.id === id),
      )
    )
      s.reviewed = false;
  if (
    previous &&
    (p.kind !== previous.kind || p.productType !== previous.productType)
  )
    for (const s of p.shots) s.reviewed = false;
  if (previous && (previous.look || "classic") !== (p.look || "classic")) {
    for (const s of p.shots) s.reviewed = false;
    if (p.kind === "science") for (const c of p.claims) c.verified = false;
  }
  for (const s of p.shots) {
    const old = previous?.shots.find((x) => x.id === s.id);
    s.approvedLook =
      s.reviewed && old?.approvedLook === approvalKey(p, s)
        ? old.approvedLook
        : null;
    s.filmQA =
      s.reviewed && old && approvalKey(previous, old) === approvalKey(p, s)
        ? old.filmQA || []
        : [];
    s.motionReview = s.reviewed && old && approvalKey(previous,old) === approvalKey(p,s) ? old.motionReview || '' : '';
  }
  if (previous && p.shots.some((s) => s.filmQA.length)) {
    for (const lang of p.language === "separate" ? ["zh", "en"] : [p.voice]) {
      const localTiming = (project) =>
        new Map(
          timeline(project, lang).rows.map((r, i, rows) => [
            r.shot.id,
            JSON.stringify([
              r.frames,
              r.overlap,
              r.overlap ? rows[i - 1]?.shot.id : null,
              rows[i + 1]?.overlap || 0,
              rows[i + 1]?.overlap ? rows[i + 1].shot.id : null,
            ]),
          ]),
        );
      const before = localTiming(previous),
        after = localTiming(p);
      for (const s of p.shots)
        if (before.get(s.id) !== after.get(s.id)) s.filmQA = [];
    }
  }
  retainScienceFlow(previous, p);
  p.passed = [];
  return p;
}
export function shotIssues(p, s, { requireReview = p.kind !== 'science' } = {}) {
  const issues = [];
  if (!s) return ["请先建立分镜"];
  issues.push(...overlayIssues(p,s));
  if(p.kind==='science') issues.push(...continuityIssues(s));
  if (!s.title?.trim() || !s.visual?.trim() || !s.purpose?.trim())
    issues.push("请补齐镜头标题、表达目的与画面说明");
  const languages=p.language==='sequential'||p.language==='separate'||p.burnCaptions&&p.captionMode==='bilingual'?['zh','en']:[p.voice];
  for(const lang of languages)if(!s[lang]?.trim())issues.push(`请补齐${lang==='zh'?'中文':'英文'}旁白与字幕文本`);
  const linked = s.assetIds.map((id) => p.assets.find((a) => a.id === id));
  if (linked.some((a) => !a)) issues.push("关联素材已移除");
  if (
    s.beatSources?.some(
      (id) =>
        id &&
        !linked.some(
          (a) =>
            a?.id === id &&
            a.role === "product" &&
            ["image", "video"].includes(a.kind),
        ),
    )
  )
    issues.push("节拍所用的真实画面已解除关联，请重新选择");
  for (const [i, id] of (s.beatSources || []).entries()) {
    const a = linked.find((x) => x?.id === id);
    if (a?.kind === "video" && (s.beatOffsets?.[i] || 0) >= a.duration)
      issues.push("节拍视频入点超过素材时长");
  }
  for (const a of linked.filter(
    (a) => a?.scriptText && ["zh", "en"].includes(a.role),
  ))
    if (a.scriptText !== s[a.role])
      issues.push("台词已修改，请重配对应语种的旁白");
  for (const lang of ["zh", "en"])
    if (linked.filter((a) => a?.kind === "audio" && a.role === lang).length > 1)
      issues.push("每种语言只选一条正式旁白");
  if (p.kind === "product") {
    const real = linked.filter(
      (a) =>
        a?.role === "product" &&
        a.originType !== "generated" &&
        ["image", "video"].includes(a.kind) &&
        a.src && sourceChecked(a),
    );
    if (!real.length)
      issues.push("缺少已确认、可核对来源的真实产品截图、录屏或实拍");
    for (const a of linked.filter(
      (a) => a?.role === "product" && a.originType === "generated",
    ))
      if (!real.some((ref) => ref.id === a.referenceId))
        issues.push("生成的产品画面须在本镜关联它所依据的已确认真实参考");
    const missing = productChecks(p.productType).filter(item => !real.some(a => a.checks?.includes(item)));
    if (real.length && missing.length)
      issues.push("请在本镜关联素材下核对：" + missing.join("、"));
  } else {
    if (!s.claimIds.length) issues.push("请为这条镜头关联科学结论");
    for (const id of s.claimIds) {
      const c = p.claims.find((x) => x.id === id);
      if (!evidenceOK(c) || !c.verified)
        issues.push("科学结论缺少可靠出处或仍待复核");
    }
  }
  for (const a of linked.filter(Boolean))
    if (!a.source?.trim() || !a.license?.trim() || !a.confirmed)
      issues.push("素材 " + a.name + " 尚未核对来源、授权或使用依据");
  if (requireReview && !s.reviewed) issues.push("镜头文字与图形待核对");
  return [...new Set(issues)];
}
export function review(p, kind, id, check, pass) {
  if (kind === "claim") {
    const c = p.claims.find((x) => x.id === id);
    if (!evidenceOK(c)) throw Error("需填写可靠来源、具体段落及必要的原始出处");
    c.verified = true;
  } else if (kind === "shot") {
    const s = p.shots.find((x) => x.id === id);
    const errors = shotIssues(p, s, { requireReview: false });
    if (errors.length) throw Error(errors.join("；"));
    s.reviewed = true;
  } else if (kind === "look") {
    const s = p.shots.find((x) => x.id === id);
    const errs = shotIssues(p, s);
    if (errs.length) throw Error(errs.join("；"));
    s.approvedLook = approvalKey(p, s);
  } else if (kind === "visual") {
    const s = p.shots.find((x) => x.id === id);
    if (!(p.kind==='science' ? s && !shotIssues(p,s,{requireReview:false}).length : s?.reviewed) || !qualityFor(p).includes(check) || typeof pass !== "boolean")
      throw Error("请先核对镜头，再记录有效的画面检查项");
    s.filmQA = [
      ...new Set([
        ...(s.filmQA || []).filter((x) => x !== check),
        ...(pass ? [check] : []),
      ]),
    ];
  } else if(kind === 'motion') {
    const s=p.shots.find(x=>x.id===id);
    if(!s||shotIssues(p,s,{requireReview:false}).length||p.kind!=='science'||typeof check!=='string'||!check.trim()||!/\d+:\d+/.test(check)) throw Error('请记录正常速度审片的版本、时间码和实际观察');
    s.motionReview=check.trim();
  } else if (kind === "stage" && stages.includes(id))
    p.passed = [...new Set([...p.passed, id])];
  else throw Error("未知审核项");
}
export function timeline(p, variant = p.voice) {
  const fps = p.fps,
    rows = [];
  for (const s of p.shots) {
    const linked = s.assetIds
      .map((id) => p.assets.find((a) => a.id === id))
      .filter(Boolean);
    const audios = linked.filter((a) => a.kind === "audio");
    const order = p.language === "sequential" ? ["zh", "en"] : [variant];
    let audioFrames = 0;
    const voices = [],
      cues = [];
    for (const lang of order) {
      const a = audios.find((x) => x.role === lang);
      if (a) {
        // ffprobe prints microsecond-rounded durations; avoid a spurious frame
        // when an exact frame-length WAV rounds a fraction of a microsecond up.
        const frames = Math.ceil(a.duration * fps - 0.0001);
        voices.push({ asset: a, from: audioFrames, frames });
        audioFrames += frames;
      }
      const start =
        voices.find((v) => v.asset.role === lang)?.from ?? audioFrames;
      cues.push({ lang, from: start, text: s[lang], en: s.en, zh: s.zh });
    }
    const frames = Math.max(1, Math.round(s.seconds * fps), audioFrames);
    if (order.length === 2 && !voices.length)
      cues[1].from = Math.round(frames / 2);
    rows.push({
      shot: s,
      frames,
      audioFrames,
      voices,
      cues,
      music: p.kind === 'science' && p.scienceFlow?.bgmId ? p.assets.find(a => a.id === p.scienceFlow.bgmId) : audios.find((a) => a.role === "music"),
    });
  }
  // A dissolve may borrow only the previous shot's silent tail. Speech never overlaps.
  for (const [i, row] of rows.entries()) {
    const prev = rows[i - 1];
    row.overlap =
      prev && row.shot.transition === "dissolve"
        ? Math.min(
            Math.round(fps * 0.32),
            prev.frames - prev.audioFrames,
            Math.floor(prev.frames / 2),
            Math.floor(row.frames / 2),
          )
        : 0;
  }
  const minimum = rows.reduce((n, row) => n + row.frames - row.overlap, 0);
  // An unset target follows the measured narration and necessary shot holds.
  // Keep explicit targets in older projects compatible without padding new drafts.
  const hasTarget = Number.isFinite(p.target) && p.target > 0;
  const desired = hasTarget ? Math.round(p.target * fps) : minimum;
  const slack = Math.max(0, desired - minimum);
  // Reserve reading time proportionally to the editor's shot lengths, preserving whole frames.
  const totalWeight = rows.reduce((n, r) => n + r.shot.seconds, 0);
  let weight = 0,
    assigned = 0,
    cursor = 0;
  for (const row of rows) {
    weight += row.shot.seconds;
    const end = Math.round((slack * weight) / totalWeight);
    row.padding = end - assigned;
    assigned = end;
    row.frames += row.padding;
    row.from = cursor - row.overlap;
    cursor = row.from + row.frames;
  }
  const extra = Math.max(0, minimum - desired);
  for (const r of rows) r.captionCues = captionTimes(r, variant, fps, p.captionMode !== 'bilingual');
  return {
    rows,
    frames: cursor,
    required: minimum / fps,
    target: hasTarget ? p.target : null,
    narrationReady: rows.length > 0 && rows.every(r => {
      const order = p.language === "sequential" ? ["zh", "en"] : [variant];
      return order.every(lang => r.shot.silentOK && !r.shot[lang]?.trim() ||
        r.voices.some(v => v.asset.role === lang && Number.isFinite(v.asset.duration) && v.asset.duration > 0));
    }),
    extra: extra / fps,
    blocked: extra > 0 && p.flow === "review" && p.overflow !== "extend",
  };
}
export function captionTimes(row, variant, fps, voiceOnly = false) {
  const out = [];
  for (const [i, c] of row.cues.entries()) {
    const track = row.voices.find((v) => v.asset.role === c.lang),
      end = row.cues[i + 1]?.from ?? row.frames,
      span = Math.min(end - c.from, track?.frames || row.frames);
    const recorded = track?.asset.segments;
    const matchesRecording = lines => recorded?.length > 1 && recorded.length === lines[c.lang].length &&
      recorded.every((segment,k) => segment.text === lines[c.lang][k]);
    const paired = linesFor(row.shot, true);
    let groups = paired;
    if (!matchesRecording(paired)) {
      const spoken = voiceOnly && linesFor({[c.lang]:row.shot[c.lang]}, true);
      groups = spoken && matchesRecording(spoken) ? spoken : linesFor(row.shot);
    }
    const {zh,en} = groups;
    const parts = (c.lang || variant) === "en" ? en : zh,
      total = parts.reduce((n, t) => n + t.length, 0) || 1;
    const precise = row.shot.subtitleTracks?.[c.lang];
    if (precise && track && precise.assetId === track.asset.id && precise.text === row.shot[c.lang]) {
      // Audio timestamps remain authoritative. Attach the existing translation
      // of the sentence group that overlaps each spoken segment; do not invent
      // new translated phrase boundaries when the two languages split differently.
      const other=c.lang==='en'?'zh':'en',translated=other==='zh'?zh:en;
      const length=text=>String(text||'').replace(/\s/g,'').length;
      let groupOffset=0,spokenOffset=0;
      const groups=parts.map((text,k)=>{const start=groupOffset;groupOffset+=length(text);return {start,end:groupOffset,text:translated[k]};});
      for (const segment of precise.segments) {
        const start=spokenOffset;spokenOffset+=length(segment.text);
        const translation=segment.translation??groups.filter(g=>g.end>start&&g.start<spokenOffset).map(g=>g.text).filter(Boolean).join(other==='zh'?'':' ');
        out.push({
          from: c.from + Math.round(segment.from * fps),
          until: Math.min(end, c.from + Math.round(segment.until * fps)),
          lang: c.lang, [c.lang]: segment.text, [other]:translation, timing: precise.alignmentReceipt ? (precise.timing||'本地字词起点（待听审）') : '精确起止',
          translationTiming:segment.translation?'逐段核对译文':'沿用已有句组',
          ...(segment.display?{display:segment.display}:{}),
        });
      }
      continue;
    }
    let weight = 0;
    const mark = row.shot.manualTiming?.[c.lang];
    const manual =
      mark &&
      track &&
      mark.assetId === track.asset.id &&
      mark.text === row.shot[c.lang] &&
      validStarts(mark.starts, parts.length, track.asset.duration);
    const measured = manual
      ? parts.map((text, i) => ({ text, from: mark.starts[i] }))
      : track?.asset.segments;
    const useMeasured =
      Array.isArray(measured) &&
      measured.length === parts.length &&
      measured.every((m, i) => m.text === parts[i] && Number.isFinite(m.from));
    zh.forEach((text, k) => {
      out.push({
        from:
          c.from +
          Math.min(
            Math.max(0, span - 1),
            useMeasured
              ? Math.round(measured[k].from * fps)
              : Math.round((span * weight) / total),
          ),
        timing: manual ? "人工标记" : useMeasured ? "实测" : "估算",
        ...(useMeasured && !manual && Number.isFinite(measured[k].until) && measured[k].until > measured[k].from
          ? {until:Math.min(end,c.from+Math.round(measured[k].until*fps))} : {}),
        lang: c.lang,
        zh: text,
        en: en[k],
      });
      weight += parts[k].length;
    });
  }
  return out;
}
// Map stable shot IDs to the upstream editor. It operates in seconds; Remotion renders in frames.
export function resizeShots(p, id, sec) {
  if (!inRange(sec, 0.25, 3600)) throw Error("镜头时长超出范围");
  let t = 0;
  const cuts = p.shots.map((s) => {
    const c = { id: s.id, t, d: s.seconds, src: "clip:" + s.id + "@0" };
    t += s.seconds;
    return c;
  });
  const index = cuts.findIndex((x) => x.id === id);
  if (index < 0) throw Error("找不到镜头");
  const delta = sec - cuts[index].d;
  const ops = [
    { op: "update", track: "cuts", id, patch: { d: sec } },
    ...cuts.slice(index + 1).map((c) => ({
      op: "update",
      track: "cuts",
      id: c.id,
      patch: { t: c.t + delta },
    })),
  ];
  const doc = normalize({ fps: p.fps, bpm: 120, cuts }),
    result = apply(doc, ops);
  if (!result.ok) throw Error("时间轴编辑失败");
  return {
    shots: p.shots.map((s) => ({
      ...s,
      seconds: result.doc.cuts.find((c) => c.id === s.id).d,
    })),
    undo: apply(result.doc, result.inverse).doc.cuts.map((c) => ({
      id: c.id,
      seconds: c.d,
    })),
  };
}
export function renderIssues(
  p,
  id,
  variant = p.voice,
  schedule = timeline(p, variant),
  options = {},
) {
  const s = p.shots.find((x) => x.id === id);
  const errs = shotIssues(p, s);
  if (p.scienceFlow) errs.push(...scienceGate(p,false,options));
  errs.push(...processMediaIssues(p,s,schedule.rows.find(r=>r.shot.id===id)?.frames));
  const voices =
    s?.assetIds
      .map((key) => p.assets.find((a) => a.id === key))
      .filter((a) => a?.kind === "audio")
      .map((a) => a.role) || [];
  if (
    p.language === "sequential" &&
    !["zh", "en"].every((k) => voices.includes(k))
  )
    errs.push("依次播报需要关联中英文两条旁白");
  if (p.language === "separate" && !voices.includes(variant))
    errs.push("所选独立语言版本缺少对应旁白");
  if (p.flow === "review" && !p.scienceFlow)
    for (const k of p.pauses.filter((x) => x === "脚本" || x === "分镜"))
      if (!p.passed.includes(k)) errs.push("请在「" + k + "」节点确认继续");
  if (schedule.blocked) errs.push("实测超时，请选择延长，或缩稿并更新配音");
  if (
    s &&
    p.look === "directed" &&
    p.flow === "review" &&
    p.pauses.includes("样镜") &&
    !p.scienceFlow &&
    s.approvedLook !== approvalKey(p, s)
  )
    errs.push("请先对照开场、动作和结果三张风格帧，并确认本镜构图");
  if (
    s &&
    p.look === "directed" &&
    p.flow === "review" &&
    p.pauses.includes("样镜") &&
    p.language === "bilingual" &&
    !voices.includes(variant) &&
    !s.silentOK
  )
    errs.push("请采用旁白或明确选择无旁白样镜");
  return errs;
}

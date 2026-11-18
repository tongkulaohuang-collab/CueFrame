import {isAuthoredProcess} from './production-mode.mjs';
import {timeline} from './model.mjs';
import {actionTiming,measuredReadingPause} from './action-timing.mjs';
import {sampleMotion} from './motion-dynamics.mjs';
import {cameraAt} from './camera-plan.mjs';
import {worldPoint,screenPoint,worldState} from './actor-rig.mjs';
import {nodeVisualState} from './graphics-state.mjs';
import {nodePathBounds} from './coverage-geometry.mjs';

export const EXPLANATION_VERSION = 1;
const fail = message => { throw Object.assign(Error('讲解过程：' + message), {code:'EXPLANATION_INCOMPLETE'}); };
const words = value => typeof value === 'string' && value.trim().length > 1 && value.length <= 500;
export const explanationBeats = (p, shotId) => (p.scienceFlow?.referenceScript?.explanationBeats || []).filter(b => b.shotId === shotId);

// Apply the same contract to saved projects and fresh model responses. A legacy
// approval or an imported draft cannot stand in for an actual explanation plan.
export function explanationScriptNeeds(p) {
  if(p.kind!=='science'||isAuthoredProcess(p))return [];
  const script=p.scienceFlow?.referenceScript;
  if(script?.explanationVersion!==EXPLANATION_VERSION||!script.explanationBeats?.length)
    return ['当前脚本尚无逐句讲解过程，请到「节奏脚本」重新编写；已有视频仍可播放'];
  try {validateExplanationBeats(script.explanationBeats,p);return [];}
  catch(error){return [error.message+'；请重新编写节奏脚本'];}
}

// Editorial limits, not a claim about an ideal universal speaking speed. A long
// sentence can contain several changes; reading/comparison holds need a reason.
export function validateExplanationBeats(beats, p) {
  if (!Array.isArray(beats) || !beats.length || beats.length > 500) fail('缺少逐句的信息变化计划');
  const ids = new Set();
  const rowStarts=new Map(timeline(p).rows.map(row=>[row.shot.id,row.from/p.fps]));
  for (const b of beats) {
    const row = timeline(p).rows.find(r => r.shot.id === b?.shotId);
    if (!row || !/^[\w-]{1,80}$/.test(b.id) || ids.has(b.id)) fail('信息节拍编号或分段无效');
    ids.add(b.id);
    if (!Number.isFinite(b.from) || !Number.isFinite(b.until) || b.from < 0 || b.until <= b.from || b.until > row.frames/p.fps + .001) fail(b.id + ' 时间超出本段');
    if (!['establish','reveal','replace','change','compare','result','hold'].includes(b.intent) || !words(b.before) || !words(b.after)) fail(b.id + ' 缺少前后状态');
    if (b.intent !== 'hold' && b.before.trim() === b.after.trim()) fail(b.id + ' 没有推进信息');
    if (!Array.isArray(b.entities) || !b.entities.length || b.entities.length > 12 || new Set(b.entities).size !== b.entities.length || b.entities.some(e => !words(e))) fail(b.id + ' 缺少变化对象');
    const timing = actionTiming(p, b.shotId, p.voice, row);
    const readingPause=b.intent==='hold'&&measuredReadingPause(timing.speech,b.from,b.until)&&
      beats.some(a=>a.shotId===b.shotId&&Math.abs(a.until-b.from)<.001&&b.dependsOn?.includes(a.id)&&b.entities.every(id=>a.entities?.includes(id)));
    if (!Array.isArray(b.cueIds) || (!b.cueIds.length&&!readingPause) || b.cueIds.some(id => !timing.speech.some(c => c.id === id && b.from < (c.until ?? timing.duration)+.35 && b.until > c.time-.35))) fail(b.id + ' 没有对应这一时段的实际旁白');
    if (!Array.isArray(b.dependsOn) || b.dependsOn.some(id => id === b.id || !beats.some(a => a.id === id && rowStarts.get(a.shotId)+a.until <= rowStarts.get(b.shotId)+b.from+.001))) fail(b.id + ' 因果顺序无效');
    if (b.until-b.from > 6.5 && (b.intent !== 'hold' || !words(b.holdReason))) fail(b.id + ' 连续信息阶段超过 6.5 秒，请拆出实际中间状态；有阅读需要的停留须写明理由');
    if (b.intent === 'hold' && (!words(b.holdReason) || b.until-b.from > 10)) fail(b.id + ' 停留需要明确且有限的阅读/比较用途');
  }
  for (const row of timeline(p).rows) {
    const own = beats.filter(b => b.shotId === row.shot.id).sort((a,b) => a.from-b.from);
    if (!own.length) fail('有分段未设计讲解过程');
    let end = 0;
    for (const b of own) { if (b.from > end+.75) fail(b.id + ' 之前存在未安排的信息空档'); end = Math.max(end,b.until); }
    if (row.frames/p.fps-end > .75) fail('本段结尾存在未安排的信息空档');
    for (const cue of actionTiming(p,row.shot.id,p.voice,row).speech) if (!own.some(b => b.cueIds.includes(cue.id))) fail('旁白 '+cue.id+' 没有对应画面变化');
  }
  return beats;
}

// Evidence is checked against the compiled track, not the model's description.
// Every changing entity needs visible geometry; a label fade cannot stand in
// for multiplication, transfer, traversal or another narrated mechanism.
export function validateExplanationEvidence(plan, beats) {
  if (!beats.length) return;
  const evidence = plan.explanationEvidence;
  if (!Array.isArray(evidence) || evidence.length !== beats.length || new Set(evidence.map(e=>e.beatId)).size !== beats.length) fail('动画未逐项实现信息节拍');
  for (const b of beats) {
    const e = evidence.find(e=>e.beatId===b.id);
    if (!e || !Number.isFinite(e.resultAt) || e.resultAt < b.from || e.resultAt > b.until+.001) fail(b.id+' 结果出现时间不在讲解区间内');
    if (!Array.isArray(e.changes) || e.changes.length !== b.entities.length || new Set(e.changes.map(c=>c.entity)).size!==b.entities.length || new Set(e.changes.map(c=>c.nodeId)).size!==e.changes.length) fail(b.id+' 须分别实现每个变化对象');
    for (const change of e.changes) {
      const n = plan.nodes.find(n=>n.id===change.nodeId);
      const allowed = ['x','y','scaleX','scaleY','rotation','draw','opacity','reveal','textProgress','textValue','morph','emphasis','mediaZoom','focusX','focusY'];
      if (!b.entities.includes(change.entity) || !n || n.role==='decoration' || !allowed.includes(change.property)) fail(b.id+' 引用了无效的变化对象');
      const a={...worldState(plan,b.from).get(n.id)}, z={...worldState(plan,e.resultAt).get(n.id)};
      if(change.property==='morph'){
        const pathIndex=change.pathIndex??0;
        if(!Number.isInteger(pathIndex)||!n.graphics?.morphs.some(m=>m.pathIndex===pathIndex))fail(b.id+' 形变证据没有对应的路径');
        a.morph=a.morphByPath[pathIndex];z.morph=z.morphByPath[pathIndex];
      }
      a.opacity=a.visibleOpacity;z.opacity=z.visibleOpacity;
      const bounds=nodePathBounds(n,e.resultAt,plan),point=bounds?{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}:n.rig?.pivot;
      const c=cameraAt(plan,e.resultAt),{x:screenX,y:screenY}=screenPoint(plan,c,worldPoint(plan,n.id,e.resultAt,point));
      if(screenX<0||screenX>plan.width||screenY<0||screenY>plan.height*.84)fail(b.id+' 变化结果不在可见主体区域');
      const text=change.property==='textValue';
      if (text?typeof change.from!=='string'||typeof change.to!=='string'||a.textValue!==change.from||z.textValue!==change.to:
        ![change.from,change.to].every(Number.isFinite)||Math.abs((a[change.property]??1)-change.from)>.001||Math.abs((z[change.property]??1)-change.to)>.001) fail(b.id+' 声明状态与实际关键帧不符');
      const visible=v=>v.opacity>=.5&&v.reveal>=.5&&v.textProgress>=.5;
      if (b.intent==='hold') { if(!visible(z)) fail(b.id+' 停留对象不可见'); continue; }
      const mechanism = ['change','compare','result'].includes(b.intent);
      if (mechanism && (['opacity','textValue','textProgress','reveal','emphasis','mediaZoom','focusX','focusY'].includes(change.property) || n.text && !n.paths.length && !n.media)) fail(b.id+' 不能用文字/透明度变化替代机制过程');
      if(text&&!['replace','establish'].includes(b.intent))fail(b.id+' 文字内容变化须声明为信息替换');
      const minimum={x:plan.width*.01,y:plan.height*.01,scaleX:.06,scaleY:.06,rotation:5,draw:.15,opacity:.4,reveal:.4,textProgress:.4,morph:.15,emphasis:.05,mediaZoom:.05,focusX:2,focusY:2}[change.property];
      if ((text?change.from===change.to:Math.abs(change.to-change.from)<minimum) || !visible(z)) fail(b.id+' 缺少可见的状态变化');
      if(change.property==='morph'&&JSON.stringify(a.graphics.paths)===JSON.stringify(z.graphics.paths))fail(b.id+' 形变进度变化但实际几何未变');
      if (change.property==='draw' && !n.paths.some(p=>p.stroke!=='none'&&p.strokeWidth>0)) fail(b.id+' 描线对象没有实际线条');
      if (mechanism && !visible(a)) fail(b.id+' 起始状态不可见，无法比较变化前后');
    }
  }
}

export const explanationInstructions = '同时输出 explanationBeats：按实际 actionTiming.speech 的 cueIds，将每段旁白拆为可观察的前状态 before → 后状态 after。shotId 与 from/until 使用本段秒数；intent 为 establish/reveal/replace/change/compare/result/hold；reveal是信息显现，replace是文字或内容替换，不能将物理机制改成这两类逃避因果检查，entities 必须包含可在画面中定位的对象。变化节拍列出实际变化的对象，hold 填持续可见、供阅读或比较的对象，与对应 hold 动作的 actorId 或部件一致，dependsOn 引用按全片时间已完成的节拍 ID，可跨段承接。每一实测语句都要覆盖；普通阶段不超过 6.5 秒，长句拆成真实中间状态，禁止靠循环漂动、显现标签或换机位填时间。有阅读比较用途的停留填 holdReason，最多 10 秒，其余 holdReason 为空。上限是本工作台的编辑检查线，不是要求加速声音。机制必须用对象数量、尺寸、位置、连接或状态的变化表达；图中数值按依据计算。不要杜撰词级时间。';

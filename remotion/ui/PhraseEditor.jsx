import React,{useMemo,useState} from 'react';
import {Player} from '@remotion/player';
import {MotionScene} from '../video/MotionScene';
import {Input,Select} from './fields';
import {timeline} from '../shared/model.mjs';
import {compileSemanticScene} from '../shared/semantic-scenes.mjs';
import {semanticOptions} from '../shared/semantic-context.mjs';
import {applyPhraseEdits,phraseRange,resolvePhraseEdits} from '../shared/phrase-edits.mjs';

export function PhraseEditor({p,set,sel,busy}){
  const s=p.shots.find(v=>v.id===sel)||p.shots[0],row=timeline(p).rows.find(r=>r.shot.id===s?.id);
  const [form,F]=useState({nodeId:'',phrase:'',occurrence:1,mode:'emphasis',color:'#b83b2d',kind:'manual',from:0,until:2,quote:'',voiceOccurrence:1,hold:.4}),[editing,E]=useState(''),[message,M]=useState('');
  const base=useMemo(()=>{try{if(!s)return {};return {plan:s.semanticScene?compileSemanticScene(s.semanticScene,semanticOptions(p,{...s,phraseEdits:[]},row)):s.motionPlan?structuredClone(s.motionPlan):null};}catch(e){return {error:e.message};}},[p,s,row]);
  if(!s||!row)return null;
  const duration=row.frames/p.fps,nodes=base.plan?.nodes.filter(n=>n.text&&!n.id.startsWith('handoff-'))||[],target=nodes.find(n=>n.id===form.nodeId)||nodes[0];
  const change=v=>{F(f=>({...f,...v}));M('');};
  const build=()=>{if(!target)throw Error('请先建立包含文字的画面');return {id:editing||'phrase-'+crypto.randomUUID(),nodeId:target.id,text:target.text.value,...phraseRange(target.text.value,form.phrase,form.occurrence),mode:form.mode,color:form.color,timing:form.kind==='voice'?{kind:'voice',quote:form.quote,occurrence:Number(form.voiceOccurrence),hold:Number(form.hold)}:{kind:'manual',from:Number(form.from),until:Number(form.until)}};};
  const compile=edits=>{const list=resolvePhraseEdits({...s,phraseEdits:edits},row,p.voice,p.fps),plan=structuredClone(base.plan);if(!plan)throw Error('请先建立文字画面');applyPhraseEdits(plan.nodes,list,duration,{replaceAutomatic:!!s.semanticScene});return {plan,list};};
  let current;try{current=compile(s.phraseEdits||[]);}catch(e){current={error:e.message};}
  const commit=list=>set({shots:p.shots.map(v=>v.id===s.id?{...v,phraseEdits:list}:v)});
  const load=e=>{const phrase=e.text.slice(e.start,e.end);let occurrence=1,at=e.text.indexOf(phrase);while(at>=0&&at<e.start){occurrence++;at=e.text.indexOf(phrase,at+1);}E(e.id);F({nodeId:e.nodeId,phrase,occurrence,mode:e.mode,color:e.color,kind:e.timing.kind,from:e.timing.from??0,until:e.timing.until??2,quote:e.timing.quote||'',voiceOccurrence:e.timing.occurrence||1,hold:e.timing.hold??.4});M('修改后点击“更新词组动效”，再保存项目。');};
  return <details className="panel phrase-editor"><summary>词组编辑 · {s.title||'当前段'}</summary>
    <p>选择固定画面文字中的完整词组，设置短时强调或按词组显现。布局保持完整，不改变文案、图片和录音。数字与单位、英文单词须整体选择。</p>
    {base.error&&<p role="alert">{base.error}</p>}
    {!nodes.length?<p>采用内容组件或生成可编辑文字画面后，即可编辑词组。烧录在视频或图片中的字不能单独编辑。</p>:<>
      <Select title="要编辑的画面文字" value={target?.id||''} options={nodes.map(n=>[n.id,n.text.value])} onChange={nodeId=>change({nodeId,phrase:'',occurrence:1})}/>
      <label className="field">完整画面文字（可用鼠标或键盘选词）<textarea readOnly value={target?.text.value||''} onSelect={e=>{const a=e.currentTarget.selectionStart,b=e.currentTarget.selectionEnd;if(b>a){const text=e.currentTarget.value,phrase=text.slice(a,b);let occurrence=1,at=text.indexOf(phrase);while(at>=0&&at<a){occurrence++;at=text.indexOf(phrase,at+1);}change({nodeId:target.id,phrase,occurrence});}}}/></label>
      <div className="content-brief-grid"><Input title="选中的词组（也可直接输入）" value={form.phrase} onChange={phrase=>change({phrase})}/><Input type="number" min="1" title="画面词组第几次出现" value={form.occurrence} onChange={occurrence=>change({occurrence})}/>
        <Select title="词组效果" value={form.mode} options={[["emphasis","短时着色强调"],["reveal","按词组显现并保留"]]} onChange={mode=>change({mode})}/><Input type="color" title="强调颜色" value={form.color} onChange={color=>change({color})}/>
        <Select title="词组时间依据" value={form.kind} options={[["manual","手动设置本段秒数"],["voice","跟随已采用的台词定位"]]} onChange={kind=>change({kind})}/>
      </div>
      {form.kind==='voice'?<div className="content-brief-grid"><Input title="词组对应原台词" value={form.quote} onChange={quote=>change({quote})}/><Input type="number" min="1" title="对应台词第几次出现" value={form.voiceOccurrence} onChange={voiceOccurrence=>change({voiceOccurrence})}/><Input type="number" min="0" max="3" step=".1" title="台词结束后延长（秒）" value={form.hold} onChange={hold=>change({hold})}/></div>:<div className="content-brief-grid"><Input type="number" min="0" max={duration} step=".05" title="词组开始（本段秒）" value={form.from} onChange={from=>change({from})}/><Input type="number" min="0" max={duration} step=".05" title="词组结束（本段秒）" value={form.until} onChange={until=>change({until})}/></div>}
      <p className="muted">本段 {duration.toFixed(2)} 秒。显现效果开始前隐藏选中词组，显现后保留；结束时间仅限制显现过程。台词定位会显示实际精度，改稿或换录音后须重新定位。</p>
      <button disabled={busy} onClick={()=>{try{const edit=build(),list=editing?(s.phraseEdits||[]).map(e=>e.id===editing?edit:e):[...(s.phraseEdits||[]),edit];compile(list);commit(list);E('');M('词组动效已加入草稿，请保存项目；已有录音保留。');}catch(e){M(e.message);}}}>{editing?'更新词组动效':'添加词组动效'}</button>
      {editing&&<button onClick={()=>{E('');M('已退出本项编辑。');}}>退出本项编辑</button>}
    </>}
    {message&&<p role="status">{message}</p>}{current.error&&<p role="alert">{current.error}。可删除失效项后重新选择。</p>}
    <ul className="phrase-list">{(s.phraseEdits||[]).map(e=>{const r=current.list?.find(v=>v.id===e.id);return <li key={e.id}><b>{e.text.slice(e.start,e.end)}</b> · {e.mode==='emphasis'?'强调':'显现'} · {r?`${r.from.toFixed(2)}–${r.until.toFixed(2)} 秒 · ${r.precision}`:'待重新定位'} <button disabled={busy} onClick={()=>load(e)}>编辑</button> <button disabled={busy} onClick={()=>{commit(s.phraseEdits.filter(v=>v.id!==e.id));if(editing===e.id)E('');M('已从当前草稿移除，历史版本保留。');}}>删除词组动效</button></li>;})}</ul>
    {current.plan&&!!s.phraseEdits?.length&&<div className="semantic-preview"><Player component={MotionScene} inputProps={{plan:current.plan,assets:p.assets}} durationInFrames={row.frames} compositionWidth={p.width} compositionHeight={p.height} fps={p.fps} controls style={{width:'100%',aspectRatio:`${p.width}/${p.height}`}}/><p className="muted">词组预览不播放配音；保存后在样片中核对音画。</p></div>}
  </details>;
}

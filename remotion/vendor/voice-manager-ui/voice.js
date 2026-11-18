import {issueHelp,safeIssueText} from '/voice-issue-help.mjs';
import {analyzeIssue} from '/voice-issue-client.mjs';
async function workbenchRequest(url,body){
  const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'工作台请求失败');return value;
}
function showIssue(id,error){
  const target=$(id),help=issueHelp(error),project=new URLSearchParams(location.search).get('project');
  const canAnalyze=project&&/^[\w-]{1,90}$/.test(project);
  target.innerHTML='<section class="issue-notice" role="alert"><strong>'+escape(help.title)+'</strong><p><b>问题原因：</b>'+escape(help.cause)+'</p><b>解决方案：</b><ol>'+help.steps.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ol><b>需要 AI 帮忙吗？</b><div class="issue-choice"><p class="muted">'+(canAnalyze?'AI 只分析原因和步骤，不自动提交配音、复刻或修改连接。使用当前 Codex 账户额度。':'从项目打开音色管理后可直接让 AI 分析；也可复制这条问题交给 AI。')+'</p><div class="issue-actions">'+(canAnalyze?'<button type="button" data-analyze>让 AI 分析原因</button>':'')+'<button type="button" data-copy>复制给 AI</button></div></div><button type="button" data-decline>暂不处理</button><div class="issue-analysis" hidden></div><p data-status role="status"></p><details><summary>技术详情</summary><p>'+escape(help.raw)+'</p></details></section>';
  const card=target.querySelector('.issue-notice'),choice=card.querySelector('.issue-choice'),statusLine=card.querySelector('[data-status]');
  card.querySelector('[data-decline]').onclick=event=>{choice.hidden=!choice.hidden;event.currentTarget.textContent=choice.hidden?'展开处理选项':'暂不处理';};
  card.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText('音色管理\n问题：'+help.raw+'\n原因：'+help.cause+'\n方案：'+help.steps.join('；'));statusLine.textContent='已复制';}catch{statusLine.textContent='复制未完成，请展开技术详情手动复制。';}};
  const analyze=card.querySelector('[data-analyze]');
  if(analyze)analyze.onclick=async()=>{
    analyze.disabled=true;analyze.textContent='正在分析…';statusLine.textContent='';
    try {
      const p=await workbenchRequest('/api/projects/'+encodeURIComponent(project));
      const advice=await analyzeIssue(workbenchRequest,p,{area:'音色管理',message:help.raw});
      const result=card.querySelector('.issue-analysis');result.hidden=false;
      result.innerHTML='<b>AI 分析建议 · 尚未执行</b><p>'+escape(advice.cause)+'</p><ol>'+advice.steps.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ol><p>'+escape(advice.needsUser)+'</p>';
    }catch(e){const failure=issueHelp(e);statusLine.textContent='本次分析未完成：'+failure.cause+' '+failure.steps.join(' ');}
    finally{analyze.disabled=false;analyze.textContent='让 AI 分析原因';}
  };
}
window.addEventListener('unhandledrejection',e=>showIssue('manager-issue',e.reason));
window.addEventListener('error',e=>{if(e.target?.tagName==='AUDIO')showIssue('manager-issue','音频未能载入，请查询音色最新试听地址。');});
'use strict';
const $=id=>document.getElementById(id);
let status=null,pending=null,existing=false,previewUrl=null,noticeTimer=null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(endpoint,body){const r=await fetch('/api/speech/'+endpoint,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'请求失败');return d;}
function notify(s){$('notice').textContent=s;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',5000);}
async function busy(button,errorId,fn){button.disabled=true;$(errorId).textContent='';const label=button.textContent;button.textContent='处理中…';try{await fn();}catch(e){showIssue(errorId,e);}finally{button.disabled=false;button.textContent=label;}}
function voiceChanged(){const v=status?.voices.find(v=>v.speaker_id===$('voice').value),clone=v?.kind==='clone';$('direction-field').hidden=clone;$('fidelity-field').hidden=!clone;$('voice-help').textContent=clone?'本人音色：使用声音复刻 2.0，可保留录音中的音色和讲述风格。':'预设音色：可通过下方指令描述讲解语气。';}
async function refreshStatus(){const previous=$('voice').value;status=await api('status');$('connection').textContent=status.configured?'语音 API 已配置':'待配置语音 API';$('voice').innerHTML=status.voices.map(v=>`<option value="${escape(v.speaker_id)}">${escape(v.name)}${v.speaker_id===status.selected_voice?' · 工作流默认':''}</option>`).join('');$('voice').value=status.voices.some(v=>v.speaker_id===previous)?previous:status.selected_voice;voiceChanged();}
const stateNames={prepared:'待确认',submitted:'已提交',completed:'已完成',needs_review:'结果待核对',failed:'失败'};
async function refreshHistory(){const list=await api('history');$('history').replaceChildren();if(!list.length){$('history').innerHTML='<p class="muted">暂无请求</p>';return;}for(const r of list){const b=document.createElement('button');b.type='button';b.innerHTML=`${escape(r.summary.voice)} · ${r.kind==='speech'?'配音':'复刻'}<small>${escape(stateNames[r.status]||r.status)} · ${escape(new Date(r.created_at).toLocaleString())}</small>`;b.addEventListener('click',()=>showResult(r));$('history').append(b);}}
function showResult(r){const out=r.result;if(r.status!=='completed'){$('result').innerHTML=`<p>${escape(stateNames[r.status]||r.status)}</p><p class="muted">${escape(r.error||'这条请求还没有完成。')}</p>${['submitted','needs_review'].includes(r.status)?'<p class="muted">请核对豆包控制台记录，避免重复提交。</p>':''}`;if(['submitted','needs_review','failed'].includes(r.status))showIssue('result',r.error||'原请求状态待核对，请先核对服务方记录。');return;}
  if(r.kind==='speech'){const base=`/api/speech/files/${r.id}/`;$('result').innerHTML=`<p><strong>${escape(r.summary.voice)}</strong> · ${Number(out.duration).toFixed(2)} 秒</p><audio controls src="${escape(out.audio_url)}"></audio><div><a href="${escape(out.audio_url)}" download>下载配音</a>${out.subtitle_path?`<a href="${base}subtitles.srt" download>下载 SRT</a>`:''}<a href="${base}timing.json" download>时间标记与工程信息</a></div><p class="helper">${out.subtitle_path?'字幕时间来自本次音频，仍需试听校对。':'本次未返回可用时间戳，请对音频转写对齐后再安排字幕。'}</p>`;
  }else{const demo=out.speaker_status?.find(s=>s.model_type===5)?.demo_audio;let audio='';try{if(demo&&new URL(demo).protocol==='https:')audio=`<audio controls src="${escape(demo)}"></audio>`;}catch{}$('result').innerHTML=`<p><strong>${escape(r.summary.voice)}</strong> · 复刻请求已返回</p><p>音色状态：${escape({0:'未找到',1:'训练中',2:'可试听',3:'训练失败',4:'已激活'}[out.status]||out.status)}</p>${audio}<p class="helper">试听地址可能一小时后失效。可以在“我的音色”查询最新状态。</p>`;}}
function confirmRequest(r){pending=r;$('confirm-title').textContent=r.kind==='speech'?'确认本次配音':'确认本次声音复刻';$('request-summary').textContent=r.kind==='speech'?`${r.summary.voice} · ${r.summary.characters} 字\n\n${r.summary.text}${r.summary.warnings.length?'\n\n'+r.summary.warnings.join('\n'):''}`:`${r.summary.voice} · ${r.summary.duration.toFixed(1)} 秒录音\n音色：${r.summary.speaker_id}\n${r.summary.warning}\n\n试听文案：${r.summary.demo_text}`;$('request-confirmed').checked=false;$('billing-note').value='';$('confirm-error').textContent='';$('confirm').showModal();}
$('script').addEventListener('input',()=>$('char-count').textContent=[...$('script').value].length);
$('voice').addEventListener('change',voiceChanged);
$('tab-speech').addEventListener('click',()=>tab(false));$('tab-clone').addEventListener('click',()=>tab(true));
function tab(clone){$('speech-form').hidden=clone;$('clone-panel').hidden=!clone;for(const [id,on] of [['tab-speech',!clone],['tab-clone',clone]]){$(id).classList.toggle('active',on);if(on)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}}
function cloneMode(value){existing=value;$('new-voice-fields').hidden=value;$('clone-submit').textContent=value?'保存已有音色':'准备复刻';$('mode-existing').classList.toggle('active',value);$('mode-new').classList.toggle('active',!value);}
$('mode-new').addEventListener('click',()=>cloneMode(false));$('mode-existing').addEventListener('click',()=>cloneMode(true));
$('settings-open').addEventListener('click',()=>$('settings').showModal());for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('settings').addEventListener('close',()=>$('api-key').value='');
$('settings-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,'settings-error',async()=>{await api('config',{ttsApiKey:$('api-key').value.trim()});$('api-key').value='';$('settings').close();await refreshStatus();notify('连接设置已保存在本机');});});
$('use-default').addEventListener('click',e=>busy(e.currentTarget,'speech-error',async()=>{await api('voices/select',{speaker_id:$('voice').value});await refreshStatus();notify('已设为视频工作流的默认音色');}));
$('speech-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,'speech-error',async()=>{if(!status?.configured){$('settings').showModal();throw Error('请先填写豆包语音 API Key。');}const kind=status.voices.find(v=>v.speaker_id===$('voice').value).kind;confirmRequest(await api('prepare',{kind:'speech',payload:{text:$('script').value,speaker_id:$('voice').value,direction:kind==='clone'?'':$('direction').value,speech_rate:Number($('speed').value),loudness_rate:Number($('loudness').value),format:$('format').value,tone_fidelity:$('fidelity').checked}}));});});
$('recording').addEventListener('change',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);const f=$('recording').files[0];$('recording-preview').hidden=!f;if(f){previewUrl=URL.createObjectURL(f);$('recording-preview').src=previewUrl;}});
function dataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('读取录音失败'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});}
$('clone-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,'clone-error',async()=>{const common={speaker_id:$('speaker-id').value.trim(),name:$('voice-name').value.trim()};if(existing){await api('voices/register',common);await refreshStatus();notify('已登记，返回生成配音即可选择');return;}if(!status?.configured){$('settings').showModal();throw Error('请先配置豆包语音 API Key。');}const f=$('recording').files[0];if(!f)throw Error('请先选择本人录音。');if(!$('voice-consent').checked)throw Error('请确认这段录音的上传与复刻授权。');if(f.size>10*1024*1024)throw Error('录音不能超过 10MB。');const local=await api('upload',{format:f.name.split('.').pop().toLowerCase(),data:await dataUrl(f)});confirmRequest(await api('prepare',{kind:'clone',payload:{...common,audio_path:local.path,reference_text:$('reference-text').value,demo_text:$('demo-text').value,language:0}}));});});
$('query-voice').addEventListener('click',e=>busy(e.currentTarget,'clone-error',async()=>{const r=await api('voices/query',{speaker_id:$('speaker-id').value.trim()});$('voice-query').textContent=`状态：${{0:'未找到',1:'训练中',2:'可试听',3:'失败',4:'已激活'}[r.status]||r.status}；剩余训练次数：${r.available_training_times??'未知'}`;showResult({kind:'clone',status:'completed',summary:{voice:$('voice-name').value||'我的音色'},result:r});}));
$('confirm-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,'confirm-error',async()=>{if(!pending)throw Error('请重新准备请求。');const r=await api('execute',{request_id:pending.id,confirmed:$('request-confirmed').checked,billing_mode:$('billing-mode').value,billing_note:$('billing-note').value,voice_consent:pending.kind==='clone'&&$('voice-consent').checked});pending=null;$('confirm').close();showResult(r);await refreshStatus();await refreshHistory();notify(r.status==='completed'?'本次请求已完成':'请求已记录，请查看结果说明');});});
$('refresh-history').addEventListener('click',()=>refreshHistory().catch(e=>showIssue('manager-issue',e)));
if(new URLSearchParams(location.search).get('frameboard')==='voices'){
  document.body.classList.add('frameboard-voices');
  tab(true);
}
Promise.all([refreshStatus(),refreshHistory()]).catch(e=>showIssue('manager-issue',e));

import {currentVoice} from '../shared/voice-status.mjs';
export function voiceResultError(result) {
  const detail=result.error || (result.status==='failed'?'配音生成失败':result.status==='needs_review'?'配音提交结果不明，请核对原请求':'配音仍未返回可用音频，请查询原请求');
  return detail+(result.id?'（请求 '+result.id.slice(0,8)+'）':'');
}
export async function waitForVoiceResult(initial,{check,isCurrent,onStatus=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=10}) {
  let result=initial;
  for(let i=0;!result.candidate&&result.status==='submitted'&&i<attempts;i++){
    if(!isCurrent())throw Error('项目或内容已变化，已停止等待原请求。');
    onStatus(result);await sleep(1500);result=await check();
  }
  if(!result.candidate)throw Object.assign(Error(voiceResultError(result)),{voiceResult:result});
  return result;
}
export const voiceBatchInput=(p,lang)=>JSON.stringify([p.id,p.version,p.title,p.topic,p.script,p.references,p.width,p.height,p.fps,p.language,p.voice,p.scienceFlow,
  p.shots,p.claims,p.assets]);
export async function generateVoiceBatch({project,ids,lang,speaker,skipExisting=true,isCurrent,synthesize,adopt,onSaved,onProgress}) {
  let q=project,done=0;
  const check=()=>{if(!isCurrent(q))throw Error('项目或内容已变化，已停止后续配音；已完成结果仍保留。');};
  for(const id of ids){
    check();const s=q.shots.find(s=>s.id===id);
    if(!s?.[lang]?.trim())throw Error('当前段落缺少所选语言的台词');
    if(skipExisting&&currentVoice(q,s,lang)){
      onProgress({done:++done,total:ids.length,text:'已保留当前采用的配音'});continue;
    }
    onProgress({done,total:ids.length,text:'正在生成第 '+(done+1)+' 段'});
    const result=await synthesize(q,s);check();
    q=await adopt(q,s,result);
    // Commit the new version before validating or submitting the next paragraph.
    await onSaved(q);
    onProgress({done:++done,total:ids.length,text:'已保存第 '+done+' 段'});
  }
  return q;
}

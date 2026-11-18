import React,{useMemo,useRef,useState} from 'react';
import {designReport,observePlayback,playbackComplete,needsMotionDesignUpdate} from '../shared/director-quality.mjs';
import {IssueNotice} from './IssueNotice';
import {readWatched,saveWatched,mergeWatched} from '../shared/playback-record.mjs';
import {timeline} from '../shared/model.mjs';

export function useDirectorPlayback(duration,id,initial=[],onRanges) {
  const start=()=>mergeWatched(initial,id?readWatched(sessionStorage,id,duration):[]);
  const current=useRef({ranges:start(),last:null}),[ranges,setRanges]=useState(start);
  const observe=event=>{
    const v=event.currentTarget;
    const rect=v.getBoundingClientRect(),visible=document.visibilityState==='visible'&&rect.bottom>0&&rect.top<innerHeight;
    current.current=observePlayback(current.current,{time:v.currentTime,wall:performance.now(),rate:v.playbackRate,
      seeking:v.seeking,playing:visible&&(event.type==='ended'||!v.paused&&!v.ended)});
    if(id)current.current.ranges=saveWatched(sessionStorage,id,duration,current.current.ranges);
    onRanges?.(current.current.ranges);
    setRanges(current.current.ranges);
  };
  return {watched:ranges,observe,complete:playbackComplete(ranges,duration)};
}
export function DirectorChecks({p,job,checks,onChange,watched,complete,disabled=false}) {
  const report=useMemo(()=>designReport(p,job.shotId),[p,job.shotId]);
  const duration=job.evidence?.frames/p.fps||0;
  const seconds=Math.min(duration,watched.reduce((sum,r)=>sum+r[1]-r[0],0));
  const start=(timeline(p,job.variant).rows.find(r=>r.shot.id===job.shotId)?.from||0)/p.fps;
  return <section className="director-checks" aria-label="声音、画面与文字检查">
    <h3>逐项检查这一段</h3>
    <p className="muted" role="status">{complete?'已完成正常速度连续观看':`正常速度已观看 ${seconds.toFixed(1)} / ${duration.toFixed(1)} 秒`}。可暂停继续，拖动或倍速不会补记未看的部分。</p>
    {!!report.issues.length&&<DesignNotice p={p} shotId={job.shotId} issues={report.issues} area="画面落实"/>}
    <fieldset disabled={disabled}>
      <legend>{report.mode==='content-model'?'内容模型的变化与结果是否清楚':'脚本要求的动作是否实际可见'}</legend>
      {report.actions.map(item=><label className="director-check" key={item.id}>
        <input type="checkbox" checked={checks.actions.includes(item.id)} disabled={!!item.problem}
          onChange={e=>onChange({...checks,actions:e.target.checked?[...checks.actions,item.id]:checks.actions.filter(id=>id!==item.id)})}/>
        <span><b>本段 {item.at.toFixed(2)} 秒 · {item.object}</b><small>全片 {(start+item.at).toFixed(2)} 秒</small><span>{item.action}</span>{item.problem&&<small>待修复：{item.problem}</small>}</span>
      </label>)}
      <label className="director-check"><input type="checkbox" checked={!!checks.audioChecked} onChange={e=>onChange({...checks,audioChecked:e.target.checked})}/><span>已实际试听：语句连续，无异常断裂或重复，音乐没有盖过人声；无声段已确认按设计静音</span></label>
      <label className="director-check"><input type="checkbox" checked={checks.styleChecked} onChange={e=>onChange({...checks,styleChecked:e.target.checked})}/><span>画面主次清楚，环境、人物和数据依次突出；构图与动作符合所选风格</span></label>
      <label className="director-check"><input type="checkbox" checked={checks.captionsChecked} onChange={e=>onChange({...checks,captionsChecked:e.target.checked})}/><span>文字层级统一，字幕同步，过期标签与注释及时退出，没有遮挡关键动作</span></label>
    </fieldset>
    <details><summary>查看本段的风格安排</summary>{report.style.map(s=><p key={s.aspect}><b>{s.label}：</b>{s.evidence?.description||'尚未提供'}{s.problem?' · '+s.problem:''}</p>)}</details>
    <p className="muted">完整播放不会自动完成听审。声音有问题时，分别记录网页播放中断或音轨断裂；播放日志不能代替实际试听。</p>
  </section>;
}

export function DesignNotice({p,shotId,issues,area}) {
  const summary=needsMotionDesignUpdate(p,shotId)?'这段使用旧版或已变更脚本的动画，缺少当前动作与风格的核对记录。请按当前脚本重新制作；已有视频可继续预览。':issues[0]+(issues.length>1?`；另有 ${issues.length-1} 项需要处理，见下方缺项清单。`:'');
  return <IssueNotice area={area} summary={summary} error={issues.join('；')}>
    <details><summary>查看动作与风格缺项（{issues.length}）</summary><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>
  </IssueNotice>;
}

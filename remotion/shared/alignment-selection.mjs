export function selectAlignmentCandidate(base,candidate,{engine='auto',error}={}){
 if(candidate?.applicable)return {...candidate,selection:{requested:engine,used:'ctc',reason:'声学路径及独立稿件检查通过'}};
 const diagnostic=candidate?{applicable:candidate.applicable,forced:candidate.forced,warning:candidate.warning}:null;
 if(engine==='auto'&&base.applicable)return {...base,selection:{requested:engine,used:'asr',reason:error||'声学候选未通过，保留已通过逐字稿件核对的基础定位',rejectedForced:diagnostic},
  ...(error?{forcedUnavailable:error}:{}),warning:base.warning+' 声学候选未采用，已保留基础定位；未增加精度声明。'};
 if(candidate)return {...candidate,selection:{requested:engine,used:'none',reason:'候选未通过，原字幕不变'}};
 return {...base,...(error?{forcedUnavailable:error}:{}),selection:{requested:engine,used:base.applicable?'asr':'none',reason:error||'使用基础定位'},warning:base.warning+(error?' 声学强制对齐未采用：'+error:'')};
}

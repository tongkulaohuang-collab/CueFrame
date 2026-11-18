export const repairTasks=['motion','proofs','rhythm','phrasing','narration','translation','shots','materials'];
export function safeIssueText(value) {
  return String(value?.message||value?.error||value||'操作没有完成')
    .replace(/Bearer\s+\S+|sk-[\w-]+/gi,'[已隐藏凭据]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|authorization)["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi,'$1[已隐藏凭据]').slice(0,4000);
}
export function issueHelp(error,{area='',job}={}) {
  const raw=safeIssueText(error),has=pattern=>pattern.test(raw);
  let title='操作未完成',cause='系统返回：'+raw,steps=['保留当前内容，先在任务记录中核对原请求的状态和技术详情。','仅凭这条回执还不能确认更深层原因，可以让 AI 根据项目情况进一步分析。'],action='tasks';
  if(job?.errorCode==='WORKBENCH_RUNTIME_STALE'||has(/工作台服务已更新|当前进程尚未切换/)) {
    title='服务更新中断了后续处理';
    cause=job?.type==='segments'?'分段任务在服务更新后停止；已经返回的动画结果和完成的视频保留在原任务中。':raw;
    steps=['在当前工作台点击「继续未完成分段」，复用已返回的结果，跳过已完成的视频。','尚未开始的段落继续按原范围制作；结果待核对时先查询原任务，不重复提交。'];action='tasks';
  } else if(has(/动画结构校验|动画绑定编译|动画对象编号|动画主体无效|部件映射无效|主体设计：|部件身份、父节点/)) {
    title='动画对象与部件数据不一致';cause=raw;
    steps=['按具体对象和字段修复编号、部件登记及节点引用；已有配音和素材无需重做。','工作台会先兼容无歧义的旧编号，再检查完整动作；相同错误没有改善时停止重复生成，原结果继续保留。'];action='tasks';
  } else if(has(/依据编号为空|未引用已有的已核科学依据|引用了.*(?:未核|未知).*依据/)) {
    title='动画的科学依据关联不完整';cause=has(/编号为空/)?raw:'动画结果没有关联有效的已核科学依据；这不代表项目资料丢失。';
    steps=['为这一镜关联支持其内容的已核依据；开场提问可关联问题的背景依据，并说明引用范围。','重新校验保存的动画结果，再合入现有配音和音乐；无需重新录制声音。'];action='evidence';
  } else if(has(/参考视频(?:第\s*\d+\s*段|分析只到|尚未分析完整|分析存在缺段)/)) {
    title='参考视频分析未通过';cause=raw;steps=['在「风格与参考」打开对应样片，按提示的时间码核对原片。','需要重新分析时，可在该面板重试未通过的样片分析。'];action='style';
  } else if(has(/画面注释.*(?:太长|24|对应|时间|位置)|动画注释/)) {
    title='动画注释未通过检查';cause=raw;steps=['保留动画主体，只修改出错注释的文字、对象或显示时间。','修复后重新校验；完整来源名称留在依据记录中。'];
  } else if(has(/逐句讲解过程|讲解过程：|重新编写节奏脚本/)) {
    title='讲解与画面的对应还未完成';cause=raw;
    steps=['在「节奏脚本」按实际配音重新编写每句对应的对象、前后状态与结果。已有录音不需要因此重做。','动画必须实现这些变化，不能只显现标签。修复后重新制作受影响的画面，旧视频仍可观看。'];action='direction';
  } else if(has(/观察区域超出实际渲染图形/)) {
    title='动画部件与观察区域不匹配';cause=raw;
    steps=['按报错时间检查部件形变前、变化中和恢复后的实际边界，观察框须在完整覆盖区间内有效。','保持可读尺寸和动作时间，修复图形或观察框后重新渲染；已有配音和素材继续保留。'];action='sample';
  } else if(has(/排版检查|画面层级：|实测排版/)) {
    title='画面文字或连线未通过检查';cause=raw;
    steps=['按报错时间与对象检查重叠、穿线、文字宽度和字幕安全区，调整排布或文字的显示时段。','保留已有配音，修复画面后重新渲染；实际检查通过后再正常速度看片。'];action='sample';
  } else if(has(/脚本动作：|动作设计：/)) {
    title='脚本动作尚未完整落实';cause=raw;
    steps=['按提示定位这一段的时间与对象，补齐真实运动、描线、显现或必要停留；不要用装饰或注释替代核心动作。','若缺少动作行，先在节奏脚本补齐时间、对象和动作；已有失败结果可让 AI 定向修复，沿用原配音和音乐。'];action='direction';
  } else if(has(/风格落实：|风格素材：|风格文字：/)) {
    title='所选风格还有缺项';cause=raw;
    steps=['核对风格的构图、素材质感和动作节奏是否在画面中实际出现，而非只换颜色。','图片须来自已确认来源与使用条件的素材；补齐素材或修复现有画面后，重新制作受影响段落。'];action='style';
  } else if(has(/导演检查：/)) {
    title='这段画面还没有完成导演检查';cause=raw;
    steps=['在视频预览中打开对应段落，按正常速度连续看完；可以分次看，拖动和倍速不计为完整检查。','逐项核对动作、风格和字幕遮挡。有问题先写修改意见或重做，全部通过后再导出已审成片；待审预览仍可合成。'];action='review';
  } else if(has(/镜头安排：/)) {
    title='镜头切换与景别设计未完成';cause=raw;
    steps=['按口播语义安排全景、近景或特写及切换时间，补齐对应的相机关键帧。','检查实际远近变化和切镜后的构图，保留已生成配音、音乐及完整动作时间。'];
  } else if(has(/画幅|轨迹|关键帧|动画形状|实际配音时长|cueId|声音.*绑定|锚点/)) {
    title='动画数据与当前项目不一致';cause=raw;steps=['沿用当前画幅、真实配音时长和已选效果图，修正报错的动画字段。','重新校验修复结果，再进行本地渲染。'];
  } else if(has(/待核对|状态不明|未得到可确认|没有返回可用音频|没有可用音频|空音频|已中断|超过.*等待上限/)) {
    title='上次请求还不能确认完成';cause=raw;steps=['先查询原请求或查看已有结果与服务方记录。','确认原请求结果后再决定是否重试；重新提交可能再次占用额度或计费。'];
  } else if(has(/草稿.*(?:版本|更新)|版本.*变化|旧版本|台词.*修改|内容已修改|最新版本|内容已更新|先保存当前编辑/)) {
    title='结果对应的是旧版本';cause=raw;steps=['先保存或保留当前编辑，再核对最新草稿和原任务版本。','已有结果保留在任务记录中；不要让旧结果覆盖新内容。'];
  } else if(has(/密钥|凭据|鉴权|401|403|unauthorized|authentication|未确认 ChatGPT 登录/i)) {
    title='服务连接或登录未通过';cause=raw;steps=['检查对应服务的登录、密钥和调用权限。','连接恢复后重新检查原请求；请勿把密钥粘贴给 AI。'];action=/ChatGPT|Codex/i.test(raw)?'tasks':'connection';
  } else if(has(/余额|额度不足|欠费|限流|429|quota|rate.limit/i)) {
    title='服务额度或调用频率受限';cause=raw;steps=['核对服务账户的可用额度或限流状态。','额度恢复或限流解除后再提交，不连续自动重试。'];action='connection';
  } else if(has(/英语.*中文|语种.*不匹配|官方标注语种|缺少.*(?:英文|台词)|英文翻译/)) {
    title='配音语言或译文尚未准备好';cause=raw;steps=['在音色与配音中选择需要的语种，英文口播需先完成翻译。','确认音色和台词语言一致后，再提交配音。'];action='voice';
  } else if(has(/BGM|背景音乐|音乐分析|音乐.*(?:未|缺|先)/)) {
    title='背景音乐尚未就绪';cause=raw;steps=['到口播与音乐中选择并采用背景音乐，完成节奏分析。','沿用已生成的口播，再继续当前操作。'];action='voice';
  } else if(has(/科学资料|科学依据|核实.*依据|已核.*资料/)) {
    title='科学资料还需要核对';cause=raw;steps=['到选题与资料核对相关结论、出处与适用条件。','把已核依据关联到相关镜头，再继续生成。'];action='evidence';
  } else if(has(/链接|网页|PDF|正文|参考资料.*读取/)) {
    title='参考资料没有完整读取';cause=raw;steps=['检查链接是否可公开打开，或直接粘贴需要引用的正文。','重新读取成功后再生成；读取失败的正文不会传入 AI。'];action='evidence';
  } else if(has(/fetch|network|ECONN|ENOTFOUND|网络|连接失败|Failed to fetch|Unexpected.*JSON|请求失败|请求没有返回完整数据/i)) {
    title='请求没有正常返回';cause=raw;steps=['检查本机工作台是否运行，以及对应服务的网络连接。','如果刚才提交过生成，先查询原任务，确认结果后再重试。'];
  } else if(has(/FFmpeg|ffmpeg|ffprobe|Blender|Manim|TeX|运行依赖|渲染进程|启动.*失败/)) {
    title='本地制作工具未完成操作';cause=raw;steps=['在科普工具中检查对应工具的安装与连接状态。','保留已有声音和动画设计，修复工具后再执行本地渲染。'];action='tools';
  } else if(has(/未能载入|播放|音频.*加载|试听.*失败|样片加载失败/)) {
    title='媒体暂时无法播放';cause=raw;steps=['确认媒体文件或示例链接可用，再重新载入播放器。','已有生成结果先从任务或素材库恢复，不直接重新付费生成。'];
  }
  const voice=/配音|音色|语音|豆包/.test(area)||job?.type==='doubao';
  if(action==='connection'&&!voice&&area)action=/动画|渲染|视频|样片/.test(area)?'tools':'tasks';
  if(/媒体暂时/.test(title))steps=['重新载入或下载已有媒体，核对文件是否可以播放。','检查工作台与文件路径；播放失败不会要求重新生成已有内容。'];
  if(voice&&/请求没有正常返回/.test(title))steps=['先检查工作台连接，再查询原配音请求；未完成不等于未计费。','豆包恢复前可切换本机离线配音，保留已采用录音，只补缺失段落。'];
  return {title,cause,steps,action,raw};
}

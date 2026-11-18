# 工作台豆包配音适配副本

2026-11-09 空音频反馈后的补充适配：对官方标注为英语且未声明中文/多语种能力的预置音色，中文字符输入在准备和执行前拦截；未知复刻语种不臆测。空音频响应保留 `needs_review`，另记 HTTP 状态、服务端 Logid、状态码、脱敏消息、接收/音频字节数及供应方返回的计费字数（如有），不自动重发，不把空响应视作完成。原工作流文件仍未修改。

`service.mjs` 复制自本工作区 `video-workflow/lib/doubao-speech.mjs`（2026-11-09 文件快照，原文件 SHA-256 `94588391ab21740cf2706ab28a8acc260b0d4009661a3d9f332b317eab5165da`）。原工作流未修改。本副本调整共享 settings/media 的导入位置及预置目录来源，并补充上述语种校验与响应诊断；沿用原鉴权、请求持久化、提交锁、异常待核对和费用确认。连接设置、请求记录、输出目录仍与原工作流共享，凭据未复制进本目录。没有可核实的独立上游版本号，不将本地代码标成火山引擎 SDK。

`voices.json` 来自火山引擎[语音合成 2.0 音色列表](https://docs.volcengine.com/docs/doubao-voice/tone-list-3?lang=zh)，文档更新时间 `2026-11-06T05:54:41Z`，本地核对日 2026-11-09。仅取两个 TTS 2.0 小节的 457 个唯一标识，排除 S2S 专用及 1.0 音色。原文 Markdown SHA-256 `53d94537e483c0505179bec6574e470dd0c1d87d8b79cb543c602d7313d56fca`。本地目录不是账户已开通权限清单。

7 条公开试听 URL 来自火山引擎[语音技术产品页](https://www.volcengine.com/product/voice-tech)公开资源，匹配音色 ID 后引用。示例在线播放，不作为项目素材、模型或可再分发音频交付；没有赋予其额外使用许可。产品 bundle 版本和来源 URL 保留在目录元数据中。远程示例可因网络或官方更新失效；UI 提供明确失败提示及短文 API 试听入口。

生成目录：`node scripts/import-voice-catalog.mjs` 从 `examples/voice-management/official-router.json` 和 `official-voice-tech.js` 的保存快照读取文本，绝不执行下载的 JavaScript。没有复制第三方 UI 或引入新依赖。界面复用现有 Input、Select、原生播放器与项目样式。

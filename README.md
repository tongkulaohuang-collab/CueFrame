# CueFrame

接入豆包语音 API，按配音时间戳同步 Remotion 动画与字幕。

CueFrame 是一个在本机运行的视频制作工作台。从选题或已有脚本开始，可以编辑分镜、试听旁白、调整动画、逐镜审片，最终导出有声 MP4 和 SRT 字幕。支持科普讲解和产品演示。

## 从旁白到画面

- **生成分镜**　Node.js 调用本机 Codex CLI，通过 JSON Schema 接收结构化分镜，保留镜头编号、素材来源及项目版本。
- **对齐语音**　豆包语音适配器读取配音时间戳，MCP 提供配音及音色管理工具。工作台也支持本地语音合成、离线对齐和手动校时。
- **渲染与返修**　React 和 Remotion 按同一份帧时间表预览和渲染，FFmpeg 合成音视频。审片意见关联到版本、镜头和帧，SQLite 保存本地项目与任务记录。

## 在本机运行

已在 Windows、Node.js 24 下验证。渲染需要 Chrome 或 Edge。请在仓库根目录执行以下命令。

```sh
npm --prefix video-workflow ci
npm --prefix remotion ci
npm --prefix remotion run build
npm --prefix remotion start
```

用浏览器打开 [本机工作台](http://127.0.0.1:4173)。首次进入时创建一个科普或产品项目，即可使用分镜编辑器。Windows 用户也可在安装依赖后双击 [启动工作台](remotion/启动工作台.cmd)。

## 可选服务

| 能力 | 配置 |
| --- | --- |
| AI 起草脚本和分镜 | 安装 Codex CLI，在同一用户账号下完成 `codex login`，确保终端可以运行 `codex`。 |
| 豆包配音 | 在工作台的音色设置中配置自己已开通的豆包语音服务。也可使用 `DOUBAO_TTS_API_KEY`。独立语音服务使用系统 FFmpeg 或 `FFMPEG_PATH` 指定的程序。 |
| 本地配音 | 运行 `npm --prefix remotion run setup:voice` 下载 Kokoro 语音模型。 |
| 离线语音对齐 | 运行 `npm --prefix remotion run setup:alignment`。需要字词强制对齐时，再运行 `npm --prefix remotion run setup:forced-alignment`。 |
| Manim、Blender | 可选的本地科学动画渲染器，安装和联调见[工具说明](视频制作/工具/science-mcp/README.md)。 |

模型、项目数据库、上传素材、配音与导出文件由使用者在本机生成。云端配音按使用者自己的服务账号计费。

## 测试与代码入口

```sh
npm --prefix video-workflow test
npm --prefix remotion test
```

| 目录 | 内容 |
| --- | --- |
| [ui](remotion/ui) | React 工作台、配音、审片和时间线编辑 |
| [server](remotion/server) | 本地 HTTP 接口、项目版本、任务编排和语音对齐 |
| [shared](remotion/shared) | 分镜模型、字幕时间、动作和帧数计算 |
| [video](remotion/video) | Remotion 合成、图文动画和字幕组件 |
| [video-workflow](video-workflow) | 豆包语音服务和 stdio MCP 接口 |
| [视频制作](视频制作) | 科普与产品片制作单、镜头约束和科学动画工具 |

还可以直接下载 [24 秒原创动效样片](remotion/examples/motion-library/preview-v2.mp4)，查看文字显现、颜色过渡和粒子运动。

## 许可证

CueFrame 原创代码采用 [MIT 许可证](LICENSE)。随仓库提供的第三方代码、目录和封面沿用各自许可，详见[第三方来源与许可](THIRD_PARTY.md)。

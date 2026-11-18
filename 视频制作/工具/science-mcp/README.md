# 可选科学动画工具

本目录提供 Windows 本机的 Manim 和 Blender 渲染桥。普通剪辑、预览与字幕导出可直接使用工作台。

如需这两种渲染器，在此目录用 Python 3.11 或 3.12 创建专用虚拟环境，再运行安装器。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe install_runtime.py
```

脚本安装 Python 依赖、Blender 和公式排版工具，并在备份后登记本机 Codex MCP 配置。完成后重启 MCP 连接，在工作台的「科普工具」面板检查引擎状态。安装器从各上游网站下载运行时，需要联网和可用磁盘空间。

源码与许可见 [第三方来源](../../../THIRD_PARTY.md)。

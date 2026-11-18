@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
".venv\Scripts\python.exe" install_runtime.py
if errorlevel 1 (
  echo 安装尚未完成。请恢复网络后再次运行本文件，已有源码和完整下载会保留。
) else (
  echo 安装完成，请在 Codex 设置中重启 MCP，再到 Frameboard 科普工具检查连接。
)
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\remotion\package.json" (
  echo 请先在当前目录运行 npm ci，然后重新打开此文件。
  pause
  exit /b 1
)
node scripts\launch.mjs
if errorlevel 1 pause

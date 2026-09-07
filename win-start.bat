@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "WS_SCRCPY_CONFIG=%ROOT%config.yaml"

if not exist "%ROOT%tools\frpc.exe" (
  echo Missing "%ROOT%tools\frpc.exe"
  pause
  exit /b 1
)

if not exist "%ROOT%tools\adb.exe" (
  echo Missing "%ROOT%tools\adb.exe"
  pause
  exit /b 1
)

if not exist "%ROOT%ws-scrcpy.exe" (
  echo Missing "%ROOT%ws-scrcpy.exe"
  pause
  exit /b 1
)

echo Starting ws-scrcpy Windows portable with "%WS_SCRCPY_CONFIG%"
echo Open http://127.0.0.1:8000/ in your browser.
"%ROOT%ws-scrcpy.exe"

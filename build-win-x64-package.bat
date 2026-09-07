@echo off
setlocal

set "ROOT=%~dp0"
set "APP=%ROOT%portable\ws-scrcpy-win-x64"
set "OUT=%ROOT%portable"
set "WIN_TOOLS=%ROOT%tools\win-x64"

cd /d "%ROOT%"

if not exist "%ROOT%config.yaml" (
  echo Missing config file:
  echo   %ROOT%config.yaml
  echo Create it from config.example.yaml and rerun this script.
  pause
  exit /b 1
)

if not exist "%WIN_TOOLS%\frpc.exe" (
  echo Missing Windows x64 frpc:
  echo   %WIN_TOOLS%\frpc.exe
  echo Put the Windows x64 frpc.exe binary there and rerun this script.
  pause
  exit /b 1
)

if not exist "%WIN_TOOLS%\adb.exe" (
  echo Missing Windows x64 adb:
  echo   %WIN_TOOLS%\adb.exe
  echo Put the Windows x64 adb.exe binary there and rerun this script.
  pause
  exit /b 1
)

echo Building Windows x64 backend bundle...
set "WS_SCRCPY_PORTABLE_BUNDLE=true"
call npm run dist:dev
set "WS_SCRCPY_PORTABLE_BUNDLE="
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "%OUT%" mkdir "%OUT%"
if exist "%APP%" rmdir /S /Q "%APP%"
mkdir "%APP%"
mkdir "%APP%\tools"
mkdir "%APP%\tmp\frpc"

xcopy "%ROOT%dist\public" "%APP%\public\" /E /I /Y >nul
xcopy "%ROOT%dist\vendor" "%APP%\vendor\" /E /I /Y >nul

copy /Y "%ROOT%dist\package.json" "%APP%\package.json" >nul
copy /Y "%ROOT%dist\LICENSE" "%APP%\LICENSE" >nul
copy /Y "%ROOT%config.yaml" "%APP%\config.yaml" >nul
copy /Y "%ROOT%win-start.bat" "%APP%\start.bat" >nul

copy /Y "%WIN_TOOLS%\frpc.exe" "%APP%\tools\frpc.exe" >nul
copy /Y "%WIN_TOOLS%\adb.exe" "%APP%\tools\adb.exe" >nul
if exist "%WIN_TOOLS%\AdbWinApi.dll" copy /Y "%WIN_TOOLS%\AdbWinApi.dll" "%APP%\tools\AdbWinApi.dll" >nul
if exist "%WIN_TOOLS%\AdbWinUsbApi.dll" copy /Y "%WIN_TOOLS%\AdbWinUsbApi.dll" "%APP%\tools\AdbWinUsbApi.dll" >nul
if exist "%WIN_TOOLS%\libusb-1.0.dll" copy /Y "%WIN_TOOLS%\libusb-1.0.dll" "%APP%\tools\libusb-1.0.dll" >nul

call npx --yes @yao-pkg/pkg "%ROOT%dist\index.js" --sea --targets node22-win-x64 --output "%APP%\ws-scrcpy.exe"
if errorlevel 1 (
  pause
  exit /b 1
)

tar -acf "%OUT%\ws-scrcpy-win-x64.zip" -C "%OUT%" ws-scrcpy-win-x64
if errorlevel 1 (
  pause
  exit /b 1
)

echo Windows x64 portable package updated:
echo   %APP%
echo Archive:
echo   %OUT%\ws-scrcpy-win-x64.zip

@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "CONFIG_PATH=%~1"
if "%CONFIG_PATH%"=="" set "CONFIG_PATH=%ROOT%config.yaml"

if not exist "%CONFIG_PATH%" (
  echo Missing config file:
  echo   %CONFIG_PATH%
  echo Create it from config.example.yaml or pass a config path as the first argument.
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo Missing node_modules. Run npm install first.
  pause
  exit /b 1
)

if not exist "%ROOT%dist\index.js" (
  echo Missing dist\index.js. Building development bundle...
  call npm run dist:dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

set "WS_SCRCPY_CONFIG=%CONFIG_PATH%"

echo Starting ws-scrcpy with "%WS_SCRCPY_CONFIG%"
echo Open http://127.0.0.1:8000/ in your browser, unless config.yaml uses another port.
node "%ROOT%dist\index.js"

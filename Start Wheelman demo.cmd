@echo off
rem Starts the Wheelman demo: invented customers and cars, stand-in services, nothing real.
cd /d "%~dp0"
title Wheelman demo
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 3 /nobreak 1>nul & start http://localhost:3211"
node --disable-warning=ExperimentalWarning demo/start.js
echo.
echo The demo has stopped.
pause

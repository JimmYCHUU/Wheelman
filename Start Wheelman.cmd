@echo off
rem Starts Wheelman, the Carbarn reply assistant. Double-click this file, or run it from a terminal.
cd /d "%~dp0"
title Wheelman
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not "%REPLY_AGENT_NO_BROWSER%"=="1" start "" /b cmd /c "timeout /t 3 /nobreak 1>nul & start http://localhost:3210"
node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/app.js
echo.
echo Wheelman has stopped.
pause

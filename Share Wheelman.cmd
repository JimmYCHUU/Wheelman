@echo off
rem Starts Wheelman and shares the page with the team: a Cloudflare tunnel to this computer, behind
rem the team password in the .env file (TEAM_PASSWORD). Double-click this file. The address to give
rem colleagues is printed in this window and shown on the page's welcome panel. Close the window
rem to stop both Wheelman and the tunnel.
cd /d "%~dp0"
title Wheelman (shared with the team)
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
set SHARE=1
if not "%REPLY_AGENT_NO_BROWSER%"=="1" start "" /b cmd /c "timeout /t 3 /nobreak 1>nul & start http://localhost:3210"
node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/app.js
echo.
echo Wheelman has stopped.
pause

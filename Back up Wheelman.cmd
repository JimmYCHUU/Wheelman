@echo off
rem Writes a backup of Wheelman now, into the backup folder. Works while Wheelman is open.
rem Double-click this file. The same happens by itself when Wheelman closes, and once a day.
cd /d "%~dp0"
title Wheelman backup
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --env-file-if-exists=.env --disable-warning=ExperimentalWarning scripts/backup.js
echo.
pause

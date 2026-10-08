@echo off
rem Puts a backup back. Close Wheelman first. Double-click this file to restore the newest backup
rem in the backup folder, or drop a backup file onto this file to restore that one.
cd /d "%~dp0"
title Wheelman restore
where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --env-file-if-exists=.env --disable-warning=ExperimentalWarning scripts/restore.js %1
echo.
pause

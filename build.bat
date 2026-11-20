@echo off
title Build Slim Reaper
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed yet. Opening nodejs.org - install the LTS version, then run this again.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo  Downloading what Slim Reaper needs...
  call npm install
  if errorlevel 1 ( echo  Install failed. & pause & exit /b )
)
echo.
echo  Building the Windows installer and portable .exe (a few minutes the first time)...
call npm run dist
if errorlevel 1 ( echo. & echo  Build failed - copy the red text above and send it to Claude. & pause & exit /b )
echo.
echo  Done! Your installer is in the "dist" folder.
explorer dist
pause

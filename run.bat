@echo off
title Slim Reaper
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  Opening nodejs.org - download the LTS version, install it, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo.
  echo  First run: downloading what Slim Reaper needs. This takes a minute or two...
  call npm install
  if errorlevel 1 ( echo. & echo  Install failed. Check your internet connection and try again. & pause & exit /b )
)
call npm start

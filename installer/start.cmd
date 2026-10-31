@echo off
rem Jailbreak My TV.exe opens this. It gets LG's free tools the first time, then walks you through the install.
title Jailbreak My TV installer
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo The installer needs Node.js, which is free. Opening its download page.
  echo Install the LTS version, then double-click Jailbreak My TV again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules\.bin\ares-install.cmd (
  echo.
  echo Getting LG's free TV tools. This takes a minute or two, and the warnings it prints are normal.
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo That did not finish. Check your internet connection, then double-click Jailbreak My TV again.
    pause
    exit /b 1
  )
)
node install.js
echo.
pause

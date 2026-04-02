@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-extension.ps1"
if errorlevel 1 (
  echo.
  echo Install failed. Please keep this folder intact and try again.
  pause
  exit /b 1
)
echo.
echo Install completed.
pause

@echo off
REM Unicorn Run - double-click me to play (Bianco's Labs)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause

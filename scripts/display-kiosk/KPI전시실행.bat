@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-BrowserKiosk.ps1" -Browser Chrome
if errorlevel 1 pause

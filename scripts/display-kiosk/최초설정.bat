@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [안내] Chrome 로그인 세션을 다시 설정합니다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-BrowserKiosk.ps1" -Browser Chrome -Setup
if errorlevel 1 pause

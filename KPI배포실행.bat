@echo off
chcp 65001 >nul
title CTST KPI 배포
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
if errorlevel 1 (
  echo.
  echo [실패] 위 메시지를 확인하세요. 아무 키나 누르면 창이 닫힙니다.
  pause >nul
  exit /b 1
)

echo.
echo [완료] 3초 후 창이 닫힙니다.
timeout /t 3 >nul
exit /b 0

@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"

if not exist "%FRONTEND_DIR%" (
  echo Frontend folder not found:
  echo %FRONTEND_DIR%
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Frontend packages are missing.
  echo Run this first inside the frontend folder:
  echo npm install
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Install Node.js first, then try again.
  pause
  exit /b 1
)

cd /d "%FRONTEND_DIR%"
call npm run dev

echo.
echo Frontend stopped or failed to start.
pause

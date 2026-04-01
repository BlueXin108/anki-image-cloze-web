@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"
set "BACKEND_STARTER=%PROJECT_ROOT%start-backend.cmd"
set "FRONTEND_STARTER=%PROJECT_ROOT%start-frontend.cmd"

if not exist "%BACKEND_STARTER%" (
  echo Backend launcher not found:
  echo %BACKEND_STARTER%
  pause
  exit /b 1
)

if not exist "%FRONTEND_STARTER%" (
  echo Frontend launcher not found:
  echo %FRONTEND_STARTER%
  pause
  exit /b 1
)

start "anki-backend" "%BACKEND_STARTER%"
start "anki-frontend" "%FRONTEND_STARTER%"

echo Started two windows:
echo Frontend: http://127.0.0.1:5173
echo Backend:  http://127.0.0.1:8000
echo.
echo If either window shows an error, send me the last lines.
pause

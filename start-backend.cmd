@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%BACKEND_PYTHON%" (
  set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\bin\python.exe"
)

if not exist "%BACKEND_DIR%" (
  echo Backend folder not found:
  echo %BACKEND_DIR%
  pause
  exit /b 1
)

if not exist "%BACKEND_PYTHON%" (
  echo Backend Python not found.
  echo Run this first inside the backend folder:
  echo python -m venv .venv
  pause
  exit /b 1
)

cd /d "%BACKEND_DIR%"
call "%BACKEND_PYTHON%" -c "import fastapi, uvicorn, httpx, PIL, pydantic_settings, multipart" >nul 2>nul
if errorlevel 1 (
  echo Backend packages are missing.
  echo Install them with:
  echo "%BACKEND_PYTHON%" -m pip install fastapi "uvicorn[standard]" pydantic-settings pillow httpx python-multipart
  pause
  exit /b 1
)

call "%BACKEND_PYTHON%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

echo.
echo Backend stopped or failed to start.
pause

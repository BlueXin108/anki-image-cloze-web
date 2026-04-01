Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$frontendDir = Join-Path $projectRoot "frontend"
$backendDir = Join-Path $projectRoot "backend"
$backendPython = Join-Path $backendDir ".venv\bin\python.exe"
$frontendNodeModules = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $frontendDir)) {
  Write-Host "Frontend folder not found: $frontendDir" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $backendDir)) {
  Write-Host "Backend folder not found: $backendDir" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $backendPython)) {
  Write-Host "Backend Python was not found." -ForegroundColor Red
  Write-Host "Create the backend environment first, then try again:" -ForegroundColor Yellow
  Write-Host "cd `"$backendDir`"" -ForegroundColor Yellow
  Write-Host "python -m venv .venv" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $frontendNodeModules)) {
  Write-Host "Frontend packages are missing." -ForegroundColor Red
  Write-Host "Run this once, then try again:" -ForegroundColor Yellow
  Write-Host "cd `"$frontendDir`"" -ForegroundColor Yellow
  Write-Host "npm install" -ForegroundColor Yellow
  exit 1
}

$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  Write-Host "npm is not available in this PowerShell session." -ForegroundColor Red
  exit 1
}

$shellPath = (Get-Process -Id $PID).Path
if (-not $shellPath) {
  $shellPath = "powershell.exe"
}

$backendCommand = @"
Set-Location '$backendDir'
& '$backendPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

$frontendCommand = @"
Set-Location '$frontendDir'
npm run dev
"@

Start-Process -FilePath $shellPath -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null
Start-Sleep -Milliseconds 500
Start-Process -FilePath $shellPath -ArgumentList "-NoExit", "-Command", $frontendCommand | Out-Null

Write-Host "Started backend and frontend in separate windows." -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Cyan

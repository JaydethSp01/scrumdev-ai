# ============================================================================
#  ScrumDev AI - Arranca TODO en Windows (backend all-in-one + frontend)
#  Uso:  powershell -ExecutionPolicy Bypass -File .\scripts\run_windows.ps1
#  Para apagar: cierra las dos ventanas que se abren, o Ctrl+C en cada una.
# ============================================================================
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

Write-Host "==== ScrumDev AI - Arrancando ====" -ForegroundColor Magenta

# 1) Asegura Postgres + Redis (Docker)
try { docker info *> $null } catch { Write-Host "[X] Docker Desktop no esta corriendo. Abrelo y reintenta." -ForegroundColor Red; exit 1 }
docker compose -f infra/docker-compose.yml up -d | Out-Null
Write-Host "[OK] Infra arriba (Postgres :5434, Redis :6379)" -ForegroundColor Green

# 2) Backend all-in-one (TODA la plataforma en 1 proceso, puerto 8080)
#    Carga el .env, PYTHONPATH=backend, corre bundles.allinone:app
$backendCmd = @"
Set-Location `"$ROOT\backend`";
`$env:PYTHONPATH = `"$ROOT\backend`";
Get-Content `"$ROOT\.env`" | ForEach-Object { if (`$_ -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable(`$matches[1], `$matches[2]) } };
Write-Host '== BACKEND (http://localhost:8080) ==' -ForegroundColor Cyan;
poetry run uvicorn bundles.allinone:app --host 0.0.0.0 --port 8080
"@
Start-Process powershell -ArgumentList "-NoExit","-Command",$backendCmd
Write-Host "[OK] Backend arrancando en http://localhost:8080 (ventana aparte)" -ForegroundColor Green

# 3) Frontend (Next.js, puerto 3000)
$frontendCmd = @"
Set-Location `"$ROOT\frontend`";
Write-Host '== FRONTEND (http://localhost:3000) ==' -ForegroundColor Cyan;
npm run dev
"@
Start-Process powershell -ArgumentList "-NoExit","-Command",$frontendCmd
Write-Host "[OK] Frontend arrancando en http://localhost:3000 (ventana aparte)" -ForegroundColor Green

Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"
Write-Host ""
Write-Host "Abriendo http://localhost:3000 ... (el backend tarda ~20-40s la 1a vez en crear las tablas)" -ForegroundColor Yellow
Write-Host "Registra tu cuenta, crea un proyecto y dale a generar." -ForegroundColor Yellow

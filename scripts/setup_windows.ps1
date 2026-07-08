# ============================================================================
#  ScrumDev AI - Instalador para Windows (deja TODO funcional en local)
#  Uso:  Abre PowerShell EN LA CARPETA DEL PROYECTO y ejecuta:
#          powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1
#  Luego arranca con:  .\scripts\run_windows.ps1
# ============================================================================
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot   # carpeta raiz del proyecto
Set-Location $ROOT

function Ok($m)    { Write-Host "  [OK]   $m"   -ForegroundColor Green }
function Info($m)  { Write-Host "  [..]   $m"   -ForegroundColor Cyan }
function Warn($m)  { Write-Host "  [!]    $m"   -ForegroundColor Yellow }
function Fail($m)  { Write-Host "  [X]    $m"   -ForegroundColor Red; exit 1 }
function Have($c)  { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "==== ScrumDev AI - Setup Windows ====" -ForegroundColor Magenta
Write-Host ""

# 1) REQUISITOS -------------------------------------------------------------
Info "Revisando requisitos previos..."
if (-not (Have python)) { Fail "Falta Python 3.11-3.13. Instalalo: https://www.python.org/downloads/ (marca 'Add to PATH')" }
$pyver = (python -c "import sys;print('%d.%d'%sys.version_info[:2])")
Ok "Python $pyver"
if (-not (Have node))   { Fail "Falta Node.js 18+. Instalalo: https://nodejs.org/ (LTS)" }
Ok "Node $(node --version)"
if (-not (Have npm))    { Fail "Falta npm (viene con Node.js)" }
if (-not (Have docker)) { Fail "Falta Docker Desktop. Instalalo y abrelo: https://www.docker.com/products/docker-desktop/" }
try { docker info *> $null; Ok "Docker Desktop corriendo" }
catch { Fail "Docker esta instalado pero NO esta corriendo. Abre Docker Desktop y reintenta." }

# 2) POETRY -----------------------------------------------------------------
if (-not (Have poetry)) {
  Info "Instalando Poetry (gestor de dependencias Python)..."
  python -m pip install --user --quiet poetry
  $py_scripts = python -c "import site,os;print(os.path.join(site.USER_BASE,'Scripts'))"
  if (Test-Path $py_scripts) { $env:PATH = "$py_scripts;$env:PATH" }
}
if (-not (Have poetry)) { Fail "Poetry no quedo en el PATH. Cierra y reabre PowerShell, o ejecuta:  python -m pip install --user poetry" }
Ok "Poetry $(poetry --version)"

# 3) (La IA usa OpenAI por API — no hace falta instalar ninguna CLI extra) --

# 4) ARCHIVOS .env ----------------------------------------------------------
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Ok "Creado .env desde .env.example" } else { Ok ".env ya existe" }
if (-not (Test-Path "frontend\.env.local")) {
  if (Test-Path "frontend\.env.example") { Copy-Item "frontend\.env.example" "frontend\.env.local" }
  else { "NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:8080" | Out-File -Encoding utf8 "frontend\.env.local" }
  Ok "Creado frontend\.env.local"
}

# Ajustes para que corra liviano y estable en local
function Set-Env($file,$key,$val) {
  $lines = Get-Content $file
  if ($lines -match "^$key=") { $lines = $lines -replace "^$key=.*","$key=$val" }
  else { $lines += "$key=$val" }
  Set-Content $file $lines
}
Set-Env ".env" "ML_ENABLED" "false"          # evita cargar modelos pesados (usa fallback)
Set-Env ".env" "KAFKA_ENABLED" "false"
Set-Env ".env" "RABBITMQ_ENABLED" "false"
Set-Env ".env" "TEMPORAL_ENABLED" "false"
Set-Env ".env" "DATABASE_URL" "postgresql+asyncpg://scrumdev:scrumdev@localhost:5434/scrumdev_ai"

# JWT secret aleatorio si sigue en el default
$envtxt = Get-Content ".env" -Raw
if ($envtxt -match "JWT_SECRET_KEY=change-me" -or $envtxt -notmatch "JWT_SECRET_KEY=.+") {
  $rand = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
  Set-Env ".env" "JWT_SECRET_KEY" $rand
  Ok "JWT_SECRET_KEY generado"
}

# 5) API KEY de OpenAI (la IA genera el codigo con OpenAI) ------------------
Write-Host ""
Info "La generacion de codigo usa OpenAI (gpt-4o). Solo necesitas tu API key."
Write-Host "     Consiguela en: https://platform.openai.com/api-keys  (empieza por sk-...)" -ForegroundColor Gray
$okey = Read-Host "     Pega aqui tu OPENAI_API_KEY (Enter para saltar)"
if ($okey.Trim().Length -gt 10) {
  Set-Env ".env" "OPENAI_API_KEY" $okey.Trim()
  Set-Env ".env" "OPENAI_ENABLED" "true"
  Set-Env ".env" "SCRUMDEV_AI_PROVIDER" "openai"
  Set-Env ".env" "OPENAI_MODEL_VISION" "gpt-4o"
  Set-Env ".env" "OPENAI_MODEL_FAST" "gpt-4o-mini"
  Ok "OpenAI configurado (provider=openai, modelo gpt-4o)"
} else {
  Set-Env ".env" "SCRUMDEV_AI_PROVIDER" "openai"
  Warn "Sin key: la plataforma abre, pero la IA no generara hasta que pongas OPENAI_API_KEY (y OPENAI_ENABLED=true) en .env"
}

# 6) INFRA (Postgres + Redis en Docker) -------------------------------------
Write-Host ""
Info "Levantando Postgres + Redis (Docker)..."
docker compose -f infra/docker-compose.yml up -d
Ok "Infra arriba (Postgres :5434, Redis :6379)"

# 7) DEPENDENCIAS backend + frontend ----------------------------------------
Write-Host ""
Info "Instalando dependencias del backend (Poetry) — puede tardar varios minutos..."
Push-Location backend
poetry install --no-root
Pop-Location
Ok "Backend listo"

Info "Instalando dependencias del frontend (npm)..."
Push-Location frontend
npm install
Pop-Location
Ok "Frontend listo"

Write-Host ""
Write-Host "==== LISTO ====" -ForegroundColor Green
Write-Host "Arranca todo con:   .\scripts\run_windows.ps1" -ForegroundColor Green
Write-Host "Luego abre:         http://localhost:3000  (registra tu cuenta y crea un proyecto)" -ForegroundColor Green
Write-Host ""

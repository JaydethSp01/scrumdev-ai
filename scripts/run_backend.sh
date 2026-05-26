#!/usr/bin/env bash
# Levanta los servicios backend principales en background con logs en logs/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_DIR="$ROOT_DIR/logs"
PID_DIR="$ROOT_DIR/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# Asegura que poetry instalado con --user este en PATH
export PATH="$HOME/.local/bin:$PATH"

cd "$BACKEND_DIR"

if ! command -v poetry >/dev/null 2>&1; then
  echo "[ERROR] poetry no esta instalado. Ejecuta: pip install poetry"
  exit 1
fi

if [ ! -d ".venv" ] && ! poetry env info --path >/dev/null 2>&1; then
  echo "[INFO] Instalando dependencias backend..."
  poetry install --no-root
fi

PY="poetry run"

start_service() {
  local name="$1"
  local module="$2"
  local port="$3"
  if [ -f "$PID_DIR/$name.pid" ] && kill -0 "$(cat "$PID_DIR/$name.pid")" 2>/dev/null; then
    echo "[SKIP] $name ya corriendo (pid $(cat "$PID_DIR/$name.pid"))"
    return
  fi
  echo "[START] $name en puerto $port"
  PYTHONPATH="$BACKEND_DIR" $PY uvicorn "$module" --host 0.0.0.0 --port "$port" \
    >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$PID_DIR/$name.pid"
}

start_service "ml"                "services.ml_service.app.main:app"                8013
start_service "memory"            "services.memory_service.app.main:app"            8008
start_service "agent_runtime"     "services.agent_runtime_service.app.main:app"     8003
start_service "orchestrator"      "services.orchestrator_service.app.main:app"      8002
start_service "conversation"      "services.conversation_service.app.main:app"      8001
start_service "auth"              "services.auth_service.app.main:app"              8011
start_service "user"              "services.user_service.app.main:app"              8012
start_service "notification"      "services.notification_service.app.main:app"      8010
start_service "api_gateway"       "services.api_gateway.app.main:app"               8080
start_service "jira_connector"    "services.jira_connector_service.app.main:app"    8004
start_service "git_connector"     "services.git_connector_service.app.main:app"     8005
start_service "deploy_connector"  "services.deploy_connector_service.app.main:app"  8006
start_service "policy"            "services.policy_service.app.main:app"            8007
start_service "audit"             "services.audit_service.app.main:app"             8009

sleep 3
echo ""
echo "Servicios listos. Healthchecks:"
for entry in \
  "api_gateway:8080" \
  "conversation:8001" \
  "orchestrator:8002" \
  "agent_runtime:8003" \
  "jira:8004" "git:8005" "deploy:8006" \
  "policy:8007" "memory:8008" "audit:8009" \
  "notification:8010" "auth:8011" "user:8012" "ml:8013"; do
  name="${entry%:*}"; port="${entry##*:}"
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$port/health" || echo "---")
  printf "  %-15s :%s  -> %s\n" "$name" "$port" "$status"
done
echo ""
echo "Logs: $LOG_DIR/*.log"
echo "Detener: make stop"

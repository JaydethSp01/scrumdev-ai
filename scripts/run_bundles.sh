#!/usr/bin/env bash
# FASE 0: arranca la plataforma en modo BUNDLE (4 procesos en vez de 14).
#   gateway     :8080
#   core        :8100  (auth,user,conversation,notification,audit,memory,policy,ml)
#   brain       :8200  (orchestrator, agent_runtime)
#   connectors  :8300  (jira, git, deploy)
set -e

ROOT="/home/jaydethsp/proyecto-delfin/scrumdev-ai"
cd "$ROOT"
export PYTHONPATH="$ROOT/backend"
export BUNDLE_MODE=true
VENV="/home/jaydethsp/.cache/pypoetry/virtualenvs/scrumdev-ai-nh8LEO-X-py3.13/bin"

echo "Deteniendo procesos previos..."
pkill -9 -f "uvicorn services\." 2>/dev/null || true
pkill -9 -f "uvicorn bundles\." 2>/dev/null || true
sleep 2

echo "Arrancando 4 bundles..."
$VENV/uvicorn bundles.core_bundle:app --host 0.0.0.0 --port 8100 > /tmp/bundle_core.log 2>&1 &
$VENV/uvicorn bundles.brain_bundle:app --host 0.0.0.0 --port 8200 > /tmp/bundle_brain.log 2>&1 &
$VENV/uvicorn bundles.connectors_bundle:app --host 0.0.0.0 --port 8300 > /tmp/bundle_connectors.log 2>&1 &
$VENV/uvicorn services.api_gateway.app.main:app --host 0.0.0.0 --port 8080 > /tmp/bundle_gateway.log 2>&1 &

echo "Esperando bundles..."
until curl -sf http://localhost:8100/health >/dev/null 2>&1; do sleep 1; done
echo "  core :8100 OK"
until curl -sf http://localhost:8200/health >/dev/null 2>&1; do sleep 1; done
echo "  brain :8200 OK"
until curl -sf http://localhost:8300/health >/dev/null 2>&1; do sleep 1; done
echo "  connectors :8300 OK"
until curl -sf http://localhost:8080/health >/dev/null 2>&1; do sleep 1; done
echo "  gateway :8080 OK"

echo ""
echo "Plataforma en modo BUNDLE (4 procesos). Gateway: http://localhost:8080"

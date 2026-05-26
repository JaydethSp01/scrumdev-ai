#!/usr/bin/env bash
# Smoke test rapido: verifica healthchecks de todos los servicios.
set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:8080}"

echo "1) API Gateway"
curl -fsS "$GATEWAY/health" | jq . 2>/dev/null || curl -fsS "$GATEWAY/health"
echo ""

echo "2) Estado consolidado de servicios"
curl -fsS "$GATEWAY/services/status" | jq . 2>/dev/null || curl -fsS "$GATEWAY/services/status"
echo ""

echo "3) Listado de agentes"
curl -fsS "http://localhost:8003/agents" | jq . 2>/dev/null || curl -fsS "http://localhost:8003/agents"
echo ""

echo "OK"

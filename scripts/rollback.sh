#!/usr/bin/env bash
# =============================================================================
# scripts/rollback.sh
# -----------------------------------------------------------------------------
# Rollback de ScrumDev AI a una versión previa.
#
# Uso:
#   bash scripts/rollback.sh <previous_tag> [staging|prod]
#
# Ejemplo:
#   bash scripts/rollback.sh v1.2.2 prod
#
# Variables de entorno (mismo contrato que deploy.sh):
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, SSH_KEY
#   BACKEND_IMAGE, FRONTEND_IMAGE
# =============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Uso: $0 <previous_tag> [staging|prod]" >&2
    exit 2
fi

PREV_TAG="$1"
ENVIRONMENT="${2:-prod}"

export IMAGE_TAG="$PREV_TAG"

log() { printf '\033[1;33m[rollback:%s]\033[0m %s\n' "$ENVIRONMENT" "$*"; }

log "Rollback solicitado a tag = ${PREV_TAG}"
log "Delegando a deploy.sh con IMAGE_TAG=${PREV_TAG}"

# Reutilizamos deploy.sh para no duplicar lógica de pull/up/healthchecks.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
bash "${SCRIPT_DIR}/deploy.sh" "$ENVIRONMENT"

# -----------------------------------------------------------------------------
# Healthcheck post-rollback contra el endpoint público
# -----------------------------------------------------------------------------
HEALTH_HOST="${HEALTH_HOST:-${DEPLOY_HOST:-localhost}}"
HEALTH_PORT="${HEALTH_PORT:-${HTTP_PORT:-80}}"
HEALTH_URL="http://${HEALTH_HOST}:${HEALTH_PORT}/healthz"

log "Verificando ${HEALTH_URL}"
ok=0
for i in $(seq 1 12); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
        ok=1
        break
    fi
    echo "  intento $i/12 ..."
    sleep 5
done

if [ "$ok" -ne 1 ]; then
    log "ERROR - healthcheck no respondió OK tras 60s. Revisa logs con:"
    log "  docker compose -f infra/docker-compose.prod.yml logs --tail=200"
    exit 1
fi

log "Rollback a ${PREV_TAG} completado y healthy"

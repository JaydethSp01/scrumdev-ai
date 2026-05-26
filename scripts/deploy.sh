#!/usr/bin/env bash
# =============================================================================
# scripts/deploy.sh
# -----------------------------------------------------------------------------
# Despliegue de ScrumDev AI a un VPS via SSH.
#
# Uso:
#   bash scripts/deploy.sh [staging|prod]
#
# Variables de entorno (obligatorias para deploy remoto):
#   DEPLOY_HOST     hostname/IP del VPS                  ej. 192.168.1.64
#   DEPLOY_USER     usuario SSH                          ej. deploy
#   DEPLOY_PATH     ruta absoluta del proyecto en el VPS ej. /opt/scrumdev-ai
#   IMAGE_TAG       tag de las imágenes Docker           ej. v1.2.3 / staging
#   BACKEND_IMAGE   (opcional) registry/imagen del back  default ghcr.io/<owner>/scrumdev-backend
#   FRONTEND_IMAGE  (opcional) registry/imagen del front default ghcr.io/<owner>/scrumdev-frontend
#   SSH_KEY         (opcional) ruta a la llave privada
#
# Si DEPLOY_HOST no está seteado, se ejecuta en modo LOCAL (útil para
# probar el flujo en la propia máquina del operador).
# =============================================================================
set -euo pipefail

ENVIRONMENT="${1:-staging}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/scrumdev/scrumdev-backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/scrumdev/scrumdev-frontend}"
HTTP_PORT="${HTTP_PORT:-80}"

COMPOSE_FILES=(-f infra/docker-compose.prod.yml)
if [ "$ENVIRONMENT" = "staging" ]; then
    COMPOSE_FILES+=(-f infra/docker-compose.staging.yml)
    HTTP_PORT="${HTTP_PORT:-8088}"
fi

log() { printf '\033[1;34m[deploy:%s]\033[0m %s\n' "$ENVIRONMENT" "$*"; }
err() { printf '\033[1;31m[deploy:%s ERR]\033[0m %s\n' "$ENVIRONMENT" "$*" >&2; }

# -----------------------------------------------------------------------------
# Función que corre EN el VPS (o local si no hay DEPLOY_HOST).
# -----------------------------------------------------------------------------
run_remote_block() {
    local env_exports="export IMAGE_TAG='${IMAGE_TAG}'
export BACKEND_IMAGE='${BACKEND_IMAGE}'
export FRONTEND_IMAGE='${FRONTEND_IMAGE}'
export HTTP_PORT='${HTTP_PORT}'"

    local cmd
    cmd=$(cat <<EOF
set -euo pipefail
${env_exports}

cd "${DEPLOY_PATH:-$(pwd)}"

echo "[remote] Pulling images (tag=\${IMAGE_TAG})"
docker compose ${COMPOSE_FILES[*]} pull

echo "[remote] Bringing stack up"
docker compose ${COMPOSE_FILES[*]} up -d --remove-orphans

echo "[remote] Pruning dangling images"
docker image prune -f >/dev/null || true

echo "[remote] Esperando healthchecks (60s max)..."
for i in \$(seq 1 12); do
    unhealthy=\$(docker compose ${COMPOSE_FILES[*]} ps --format json 2>/dev/null | grep -ic '"Health":"unhealthy"' || true)
    starting=\$(docker compose ${COMPOSE_FILES[*]} ps --format json 2>/dev/null | grep -ic '"Health":"starting"' || true)
    if [ "\$unhealthy" -eq 0 ] && [ "\$starting" -eq 0 ]; then
        echo "[remote] OK - todos los servicios healthy"
        break
    fi
    echo "  intento \$i/12  unhealthy=\$unhealthy starting=\$starting"
    sleep 5
done

echo "[remote] Estado final:"
docker compose ${COMPOSE_FILES[*]} ps
EOF
)
    echo "$cmd"
}

# -----------------------------------------------------------------------------
# Modo LOCAL (sin DEPLOY_HOST)
# -----------------------------------------------------------------------------
if [ -z "${DEPLOY_HOST:-}" ]; then
    log "DEPLOY_HOST no definido -> ejecutando deploy LOCAL"
    bash -c "$(run_remote_block)"
    log "Deploy local OK"
    exit 0
fi

# -----------------------------------------------------------------------------
# Modo REMOTO
# -----------------------------------------------------------------------------
: "${DEPLOY_USER:?DEPLOY_USER es requerido para deploy remoto}"
: "${DEPLOY_PATH:?DEPLOY_PATH es requerido para deploy remoto}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [ -n "${SSH_KEY:-}" ]; then
    SSH_OPTS+=(-i "$SSH_KEY")
fi

log "Conectando a ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
log "  IMAGE_TAG       = ${IMAGE_TAG}"
log "  BACKEND_IMAGE   = ${BACKEND_IMAGE}"
log "  FRONTEND_IMAGE  = ${FRONTEND_IMAGE}"

# El bloque remoto se canaliza via stdin para evitar problemas de quoting.
run_remote_block | ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s

log "Deploy remoto OK"

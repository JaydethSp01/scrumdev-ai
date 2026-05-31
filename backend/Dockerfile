# syntax=docker/dockerfile:1.7
# ============================================================================
# ScrumDev AI - Backend Dockerfile (genérico para los 10 microservicios)
# ----------------------------------------------------------------------------
# Estrategia: una sola imagen contiene TODO el código backend; el servicio a
# levantar se selecciona en tiempo de ejecución vía las env vars:
#   - SERVICE_MODULE  (ej. services.api_gateway.app.main:app)
#   - SERVICE_PORT    (ej. 8080)
#
# Multi-stage:
#   1) builder  -> poetry export + pip wheel install
#   2) runtime  -> python:3.11-slim sin poetry, usuario no-root
#
# Nota: usamos python:3.11-slim (no 3.13) porque pyproject permite >=3.11,<3.14
# y 3.11-slim tiene wheels precompilados estables para asyncpg/cryptography.
# ============================================================================

# --------- Stage 1: builder ---------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    POETRY_VERSION=1.8.4 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false

# Toolchain mínima para compilar wheels que pudieran faltar (asyncpg, bcrypt...)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install "poetry==${POETRY_VERSION}" "poetry-plugin-export>=1.8.0"

WORKDIR /build

# Copiamos sólo los manifests primero para maximizar cache de capa
COPY backend/pyproject.toml backend/poetry.lock ./

# Export -> requirements.txt y luego pip install en un prefix (--prefix=/install)
# Esto permite copiar el dir resultante al runtime sin arrastrar poetry.
RUN poetry export \
        --without-hashes \
        --without dev \
        --format requirements.txt \
        --output requirements.txt

RUN pip install --prefix=/install -r requirements.txt

# Deps que el poetry.lock NO incluye (se instalaron a mano en dev): pypdf,
# python-docx (extracción de documentos), requests, lxml, aiokafka, certifi...
# Se copian a un manifiesto versionado para reproducibilidad.
COPY backend/requirements-extra.txt ./requirements-extra.txt
RUN pip install --prefix=/install -r requirements-extra.txt


# --------- Stage 2: runtime ---------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1

# curl para healthchecks; libpq5 runtime de asyncpg/psycopg
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        libpq5 \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 scrumdev \
    && useradd  --system --uid 1000 --gid scrumdev --create-home --home-dir /home/scrumdev scrumdev

# Trae deps Python desde el builder
COPY --from=builder /install /usr/local

# Salvaguarda definitiva: certifi (dep de httpx) a veces no llega vía el copy del
# prefix builder. Lo instalamos DIRECTO en el runtime para garantizar el import.
RUN pip install --no-cache-dir certifi || true

WORKDIR /app

# Sólo el código backend (no node_modules ni .next del frontend, ignorado por .dockerignore)
COPY --chown=scrumdev:scrumdev backend/ /app/

USER scrumdev

# Defaults para api_gateway; cada servicio en compose pisa estas vars
ENV SERVICE_MODULE=services.api_gateway.app.main:app \
    SERVICE_PORT=8080 \
    UVICORN_WORKERS=1 \
    UVICORN_LOG_LEVEL=info

EXPOSE 8080

# Healthcheck genérico contra /health del servicio que esté corriendo.
# Cada FastAPI app expone /health (verificado en backend/services/*/app/main.py).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${SERVICE_PORT}/health" || exit 1

# tini como PID 1 -> manejo correcto de señales / zombies
ENTRYPOINT ["/usr/bin/tini", "--"]

# Usamos shell-form para expandir las env vars en runtime.
# PORT (lo inyecta Render/Railway/Cloud Run) tiene prioridad sobre SERVICE_PORT
# para que el contenedor escuche donde el proveedor espera. En local/compose,
# PORT no se setea y se usa SERVICE_PORT (default 8080). allinone.py lee PORT.
CMD ["sh", "-c", "export PORT=${PORT:-${SERVICE_PORT}}; exec uvicorn ${SERVICE_MODULE} --host 0.0.0.0 --port ${PORT} --workers ${UVICORN_WORKERS} --log-level ${UVICORN_LOG_LEVEL} --proxy-headers --forwarded-allow-ips='*'"]

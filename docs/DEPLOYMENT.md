# ScrumDev AI - Guía de Despliegue

Este documento describe cómo desplegar ScrumDev AI en sus tres ambientes
(desarrollo, staging y producción), junto con operación día a día:
healthchecks, logs, backups y rollback.

---

## 1. Arquitectura de despliegue

```
                          Internet
                             │
                             ▼
                     ┌───────────────┐
                     │     nginx     │  :80 (host) - reverse proxy + TLS termination (futuro)
                     │ (scrumdev-net)│
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────────────────┐
              │              │                          │
              ▼              ▼                          ▼
       ┌───────────┐  ┌────────────┐           ┌────────────────┐
       │  /  (UI)  │  │ /api/* REST│           │ /ws/* WebSocket│
       │ frontend  │  │ api_gateway│           │ api_gateway     │
       │ :3000     │  │ :8080      │           │ :8080           │
       └───────────┘  └─────┬──────┘           └─────────────────┘
                            │
        ┌───────────────────┼──────────────────────────────────────┐
        │                   │                                      │
        ▼                   ▼                                      ▼
 ┌──────────────┐   ┌──────────────────┐                ┌──────────────────┐
 │ conversation │   │   orchestrator   │  ...  (10 microservicios FastAPI)  │
 │   :8001      │   │     :8002        │                │                  │
 └──────┬───────┘   └────────┬─────────┘                └──────────────────┘
        │                    │
        └────────┬───────────┴────────────┬─────────────────┐
                 │                        │                 │
                 ▼                        ▼                 ▼
          ┌────────────┐          ┌──────────────┐   ┌─────────────┐
          │  postgres  │          │    redis     │   │  rabbitmq   │
          │  :5432     │          │    :6379     │   │   :5672     │
          └────────────┘          └──────────────┘   └─────────────┘
                                                            │
                                                            ▼
                                                     ┌──────────────┐
                                                     │   temporal   │
                                                     │   :7233      │
                                                     └──────────────┘
```

- **Una sola imagen** `scrumdev-backend` se reutiliza para los 10 microservicios;
  el servicio concreto se selecciona vía `SERVICE_MODULE` y `SERVICE_PORT`.
- Sólo **nginx** expone puertos al host (80; 443 reservado).
- Todo lo demás vive en la red docker `scrumdev_net`.

---

## 2. Ambientes

| Ambiente    | Compose files                                                    | Tag por defecto | Puerto host | Includes Temporal/RabbitMQ |
| ----------- | ---------------------------------------------------------------- | --------------- | ----------- | -------------------------- |
| **dev**     | `infra/docker-compose.yml`                                       | n/a (poetry)    | -           | No                         |
| **staging** | `infra/docker-compose.prod.yml` + `infra/docker-compose.staging.yml` | `staging`     | 8088        | No                         |
| **prod**    | `infra/docker-compose.prod.yml`                                  | `latest` / `vX.Y.Z` | 80      | Sí                         |

---

## 3. Prerequisitos del VPS

- Linux x86_64 o arm64 (probado en Ubuntu 22.04+, Debian 12, CentOS Stream 9)
- Docker Engine **24+**
- Docker Compose **plugin v2** (`docker compose`, NO `docker-compose`)
- `curl`, `openssl`, `git`
- Acceso saliente HTTPS a `ghcr.io` (registry)
- Puertos abiertos en el firewall: **80** (y **443** cuando se añada TLS)
- Mínimo recomendado: 4 vCPU / 8 GB RAM / 40 GB SSD (Postgres + Temporal son pesados)

Instalación rápida en Debian/Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Re-login
docker compose version
```

---

## 4. Variables de entorno requeridas en prod

Copia el template y rellena:

```bash
cp .env.prod.example .env
$EDITOR .env
```

Las **críticas** (sin valores por defecto seguros):

| Variable               | Descripción                                          |
| ---------------------- | ---------------------------------------------------- |
| `POSTGRES_PASSWORD`    | Contraseña fuerte para Postgres                      |
| `RABBITMQ_PASSWORD`    | Contraseña RabbitMQ                                  |
| `JWT_SECRET_KEY`       | `openssl rand -hex 32`                               |
| `SCRUMDEV_AI_API_KEY`  | API key del proveedor LLM (Anthropic/OpenAI)         |
| `SCRUMDEV_JIRA_API_TOKEN` | Token Jira                                        |
| `SCRUMDEV_GIT_TOKEN`   | PAT de GitHub/GitLab                                 |
| `CORS_ALLOWED_ORIGINS` | Dominios desde donde el front puede llamar al API    |
| `BACKEND_IMAGE`/`FRONTEND_IMAGE` | Path completo a las imágenes en GHCR        |
| `IMAGE_TAG`            | Tag de versión a desplegar (ej. `v1.2.3`)            |

---

## 5. Comandos de despliegue

### 5.1 Primera vez (bootstrap)

```bash
# En el VPS
git clone https://github.com/<owner>/scrumdev-ai.git /opt/scrumdev-ai
cd /opt/scrumdev-ai
cp .env.prod.example .env
$EDITOR .env

# Login al registry (necesario sólo si las imágenes son privadas)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin

# Levantar todo
make docker-up-prod
```

### 5.2 Deploy de una nueva versión

Tras un tag `vX.Y.Z` en GitHub, el workflow `cd-prod.yml` publica las imágenes.
Para desplegar al VPS:

**Opción A** - desde la máquina local (push-based):

```bash
DEPLOY_HOST=vps.scrumdev.example.com \
DEPLOY_USER=deploy \
DEPLOY_PATH=/opt/scrumdev-ai \
IMAGE_TAG=v1.2.3 \
BACKEND_IMAGE=ghcr.io/<owner>/scrumdev-backend \
FRONTEND_IMAGE=ghcr.io/<owner>/scrumdev-frontend \
bash scripts/deploy.sh prod
```

**Opción B** - dentro del VPS (pull-based):

```bash
cd /opt/scrumdev-ai
git pull
export IMAGE_TAG=v1.2.3
bash scripts/deploy.sh prod
```

**Opción C** - desde GitHub Actions: descomentar el step de SSH en
`.github/workflows/cd-prod.yml` y configurar los secrets `PROD_HOST`,
`PROD_USER`, `PROD_SSH_KEY`, `PROD_DEPLOY_PATH`.

### 5.3 Staging

Mismo flujo, apuntando al stack staging:

```bash
IMAGE_TAG=staging bash scripts/deploy.sh staging
```

---

## 6. Rollback

```bash
# Volver al tag anterior
IMAGE_TAG=v1.2.2 bash scripts/rollback.sh v1.2.2 prod
```

El script:
1. Hace `docker compose pull` del tag indicado.
2. Hace `docker compose up -d` recreando los contenedores con la imagen previa.
3. Verifica `/healthz` del nginx por 60s.
4. Falla con `exit 1` si el healthcheck no responde.

> **Tip**: Postgres NO se rollbackea — las migraciones de Alembic son
> forward-only por convención. Si una versión nueva introdujo un cambio de
> schema incompatible, restaura el backup (sección 8) antes del rollback.

---

## 7. Monitoring

### 7.1 Healthchecks

| Endpoint                      | Qué verifica                       |
| ----------------------------- | ---------------------------------- |
| `http://<host>/healthz`       | nginx vivo                         |
| `http://<host>/api/health`    | api_gateway (vía proxy)            |
| `docker compose ps`           | Estado y health de cada contenedor |

Cada FastAPI app expone su propio `/health`; los healthchecks del Dockerfile
lo consultan en `127.0.0.1:${SERVICE_PORT}/health`.

### 7.2 Logs

```bash
# Tail global
docker compose -f infra/docker-compose.prod.yml logs -f --tail=100

# Sólo un servicio
docker compose -f infra/docker-compose.prod.yml logs -f api_gateway

# Sólo errores
docker compose -f infra/docker-compose.prod.yml logs --tail=500 | grep -i 'error\|exception'
```

Los logs van a stdout/stderr y los recoge el docker logging driver. Si quieres
mandarlos a Loki/ELK, edita la sección `logging:` de cada servicio en
`docker-compose.prod.yml`.

### 7.3 Métricas

El stack actual NO incluye Prometheus/Grafana. Si lo necesitas, añade un
`docker-compose.observability.yml` adicional. Cada FastAPI ya emite structlog
en formato JSON (ver `shared/observability/`).

---

## 8. Backup de Postgres

### 8.1 Dump manual

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  pg_dump -U scrumdev -d scrumdev_ai --format=custom --compress=9 \
  > backups/scrumdev_ai_$(date +%Y%m%d_%H%M%S).dump
```

### 8.2 Restore

```bash
cat backups/scrumdev_ai_YYYYMMDD_HHMMSS.dump | \
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  pg_restore -U scrumdev -d scrumdev_ai --clean --if-exists
```

### 8.3 Automatización (cron en el VPS)

```cron
# /etc/cron.d/scrumdev-backup
0 3 * * * deploy cd /opt/scrumdev-ai && \
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
    pg_dump -U scrumdev -d scrumdev_ai --format=custom --compress=9 \
    > /var/backups/scrumdev/scrumdev_ai_$(date +\%Y\%m\%d).dump && \
  find /var/backups/scrumdev -name 'scrumdev_ai_*.dump' -mtime +14 -delete
```

> Para resiliencia real: sincroniza `/var/backups/scrumdev` a S3/B2 con
> `rclone` o `aws s3 sync`.

---

## 9. Limitaciones conocidas

- **Sin TLS por defecto**: el `nginx` actual escucha sólo en `:80`. Para HTTPS,
  añade un certbot sidecar o pon Caddy/Cloudflare delante.
- **Single-host**: el stack está diseñado para 1 VPS. Para HA real migra a
  k8s/Nomad.
- **Postgres mono-instancia**: sin replicación. Para HA usa un Postgres
  gestionado (Neon/Supabase/RDS) y elimina el servicio `postgres` del compose.
- **Temporal monolítico**: usamos `temporalio/auto-setup`, válido para staging
  y prod pequeño. Para alta concurrencia, despliega Temporal por separado.
- **Rollback de schema NO automático**: ver sección 6.
- **`claude_code` provider requiere binario en el host**: en prod recomendamos
  `SCRUMDEV_AI_PROVIDER=anthropic`. Si insistes en `claude_code`, hay que
  hornear el binario `claude` en el Dockerfile del backend.
- **Multi-arch images**: el workflow de prod construye amd64+arm64. Staging
  sólo amd64 (más rápido).
- **Secrets en `.env`**: el `.env` se monta como archivo plano. Para
  producción seria usa Docker secrets, sops+age, o un vault externo.

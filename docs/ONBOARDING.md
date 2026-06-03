# ScrumDev AI — Guía para el equipo

> Plataforma multi-agente: un usuario **NO técnico** describe el software que quiere
> (o sube un documento, o elige una plantilla) y la plataforma **genera, construye y
> despliega** una app web completa, navegable y con diseño profesional, con su URL
> pública. Pensado para el Proyecto Estancia Delfín (agentes + orquestación + MVP).

---

## 1. ¿Qué hace? (flujo de usuario)

1. El usuario crea un proyecto y cuenta su idea por **3 vías**: por industria (intake guiado), subir documento, o describir libre.
2. Se le muestra una **galería de plantillas 1A** que matchean lo que pidió (o "crear a medida").
3. La IA (Claude) **genera** el frontend (Next.js) + backend (FastAPI) + datos.
4. Un **build gate** compila, auto-arregla errores y garantiza diseño 1A (app-shell con sidebar, datos siempre visibles).
5. Se **despliega**: GitHub repo + Vercel (front) + Render (back) + Neon (DB). El usuario recibe la URL.

---

## 2. Arquitectura

```
Frontend (Next.js 14, Tailwind)  ──HTTP──►  API Gateway
                                              │
        ┌─────────────────────────────────────┼───────────────────────────┐
        ▼                  ▼                   ▼                ▼            ▼
   Core (8 svc)       Brain (ML+agent)   Connectors (git/   Event Bus    Postgres
  auth, user,         ml_service,        deploy/jira)       (Kafka /      + Redis
  orchestrator,       agent_runtime                          RabbitMQ)
  conversation, ...   (genera con Claude)
```

- **Backend**: 13 microservicios FastAPI. En prod corren como **un solo proceso** (`bundles/allinone.py`) que monta todos bajo `/_svc/*` (HF Space, 1 contenedor). En local puedes correr el bundle igual.
- **Generación de código**: Claude Code headless (SDK + CLI `@anthropic-ai/claude-code`) usando el plan Pro/Max vía `CLAUDE_CODE_OAUTH_TOKEN` (no gasta API). OpenAI es fallback.
- **ML**: 4 redes neuronales (tipo/área/esfuerzo/completitud) + embeddings que asisten a la IA (`ml_service`).
- **Event-driven**: cada paso publica `DomainEvent` por el `HybridEventBus` → Kafka (topics `scrumdev.workflow/.agent/.deploy/.events`) y/o RabbitMQ. Se activa con `KAFKA_ENABLED=true`.
- **Calidad 1A**: UI-kit inyectado + app-shell determinista (el layout envuelve toda página en sidebar+header) + build gate que arregla código generado. Ver `docs/ALGORITHMS.md` y `docs/` .

---

## 3. Prerrequisitos

| Herramienta | Versión |
|---|---|
| Python | 3.11–3.13 |
| Poetry | 1.8+ (`pip install poetry`) |
| Node.js | 20.x |
| Docker + Docker Compose | para la infra (Postgres, Redis, Kafka, RabbitMQ, Temporal) |

---

## 4. Instalación local (paso a paso)

```bash
# 1) Clonar
git clone https://github.com/JaydethSp01/scrumdev-ai.git
cd scrumdev-ai

# 2) Variables de entorno (ver sección 5)
cp .env.example .env                 # backend
cp frontend/.env.example frontend/.env
#   edita .env con tus tokens (Claude, OpenAI opcional, GitHub, etc.)

# 3) Levantar infra (Postgres, Redis, RabbitMQ, Temporal, Kafka/Redpanda)
make infra-up                        # usa infra/docker-compose.full.yml
#   (o infra/docker-compose.yml para solo Postgres+Redis)

# 4) Backend (instala deps con poetry y corre el bundle allinone)
make install
make run                             # API en http://localhost:8080
#   (script: scripts/run_backend.sh -> uvicorn bundles.allinone:app)

# 5) Frontend
make frontend-install
make frontend-dev                    # http://localhost:3000
```

Comandos útiles del **Makefile**: `make help`, `infra-up/down/logs`, `run/stop`,
`frontend-dev`, `test`, `lint`, `fmt`, `clean`.

**Verificar que arrancó:**
```bash
curl http://localhost:8080/health                 # backend
curl http://localhost:8080/_allinone/brokers      # estado redis/kafka
open http://localhost:3000                         # frontend
```

---

## 5. Variables de entorno (`.env`)

### Obligatorias para correr local
| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Postgres. Local: `postgresql+asyncpg://scrumdev:scrumdev@localhost:5432/scrumdev_ai` |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | secreto para firmar tokens (cualquier string largo) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` en local |
| `NEXT_PUBLIC_API_GATEWAY_URL` (frontend/.env) | `http://localhost:8080` |

### Generación con IA (núcleo del producto)
| Variable | Qué es |
|---|---|
| `SCRUMDEV_AI_PROVIDER` | `claude_code` (recomendado) |
| `CLAUDE_CODE_OAUTH_TOKEN` | token del plan Claude Pro/Max (headless, no gasta API) |
| `SCRUMDEV_AI_MODEL` | ej. `claude-sonnet-4-6` |
| `OPENAI_ENABLED` / `OPENAI_API_KEY` | fallback + embeddings/visión (opcional pero recomendado) |
| `OPENAI_MODEL_FAST` / `OPENAI_MODEL_VISION` | `gpt-4o-mini` / `gpt-4o` |

### Despliegue de las apps generadas (opcional, para el flujo de deploy)
| Variable | Qué es |
|---|---|
| `SCRUMDEV_GIT_PROVIDER` / `SCRUMDEV_GIT_TOKEN` / `SCRUMDEV_GIT_OWNER` | GitHub (crea repos de las apps) |
| `SCRUMDEV_DEPLOY_PROVIDER` | `render` |
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` | deploy del frontend generado |
| `SCRUMDEV_RENDER_API_TOKEN` | deploy del backend generado |
| `SCRUMDEV_NEON_API_KEY` / `SCRUMDEV_NEON_ORG_ID` | DB de las apps generadas |

### Event-driven / infra (con `make infra-up` ya quedan en localhost)
| Variable | Valor local |
|---|---|
| `KAFKA_ENABLED` | `true` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` |
| `RABBITMQ_ENABLED` / `RABBITMQ_URL` | `true` / `amqp://guest:guest@localhost:5672/` |
| `TEMPORAL_ENABLED` / `TEMPORAL_HOST` | `false` (opcional) / `localhost:7233` |
| `ML_ENABLED` | `true` |

> Las **claves reales** (tokens de Claude, OpenAI, GitHub, Vercel, Render, Neon) **NO van en el repo**. Pídeselas a Kelly o usa las tuyas. En prod están como *Secrets/Variables* del HF Space.

---

## 6. Producción (cómo está desplegado)

| Componente | Dónde | URL |
|---|---|---|
| Frontend | Vercel (auto-deploy en cada push a `main`) | https://scrumdevai.vercel.app |
| Backend (allinone) | Hugging Face Space (Docker, 16GB) | https://jaydethsp01-scrumdevai-api.hf.space |
| DB | Neon (Postgres serverless) | — |
| Redis | Dentro del contenedor del Space | — |
| Plantillas 1A | Repo GitHub público | https://github.com/JaydethSp01/scrumdev-templates |

> **Event bus / Kafka (decisión de arquitectura):** el `HybridEventBus` publica
> `DomainEvent` en cada paso. En el **demo gratis del HF Space** (1 contenedor) va
> en modo **in-process** (`KAFKA_ENABLED=false`) → estable, sin cargar el contenedor.
> En el **stack real** (`docker-compose.full.yml`, VPS) `KAFKA_ENABLED=true` y
> **Redpanda corre como contenedor propio** → Kafka real (validado E2E). El productor
> es no-bloqueante (timeout 6s): si el broker no responde, degrada a in-process sin
> colgar la app. Así un broker no desestabiliza el demo y la arquitectura sigue 100%.

**Login demo:** `kelly@scrumdev.ai` / `Scrumdev2026!` · `adam@scrumdev.ai` / `adam-demo-2026`

> Para una empresa: `infra/docker-compose.full.yml` levanta el stack completo
> (Postgres, Redis, RabbitMQ, Temporal, Kafka/Redpanda) en un VPS. El HF Space es
> el demo de 1 contenedor.

---

## 7. Conceptos clave (para entender el código)

- **`bundles/allinone.py`**: arma todos los microservicios en una app + arranca Redis/Kafka. Es el entrypoint de prod.
- **`services/agent_runtime_service/app/runtime/app_generator.py`**: el corazón — arma el prompt (brief de diseño + UI-kit + plantillas) y llama a Claude.
- **`services/orchestrator_service/app/build_gate.py`**: compila + auto-arregla el código generado (Python/TS one-liners, imports, CSS, **app-shell determinista**, datos siempre visibles).
- **`shared/ui_kit/`**: componentes 1A (AppShell, Card, DataTable, Badge…) que la IA compone.
- **`shared/templates/`**: catálogo de 25 plantillas por sector + matching.
- **`shared/events/`**: bus de eventos (Kafka/RabbitMQ). Ver `docs/` para el detalle.

---

## 8. Estructura del repo

```
backend/
  bundles/            allinone, core, brain, connectors
  services/           13 microservicios FastAPI
  shared/             ui_kit, templates, events, db, config, ml
  scripts/            run_backend.sh, seed_templates.py, ...
  Dockerfile          imagen de prod (la RAÍZ es la que usa HF)
frontend/             Next.js 14 (la plataforma)
infra/                docker-compose.{yml,full,staging,prod}
docs/                 ONBOARDING.md (este), ALGORITHMS.md
```

Dudas → Kelly.

---
title: ScrumDev AI API
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# ScrumDev AI

> **Genera tu sistema completo desde una idea con agentes IA.**
>
> Plataforma multiagente que toma una vision de producto, la descompone en
> backlog Scrum priorizado, propone arquitectura, **genera codigo real
> ejecutable** archivo por archivo, persiste ADRs y registra trazabilidad
> completa - usando Claude (sin API key, via tu plan Pro/Max).

Implementacion completa derivada del repo [adanbeltran/ProyectoEstanciaDelfin](https://github.com/adanbeltran/ProyectoEstanciaDelfin)
(talleres 1-6 + guia maestra "Taller microservicios").

## Flujo del producto

```
   Vision producto
        ↓
   PO Agent → Backlog Scrum (10+ historias INVEST priorizadas)
        ↓
   Architect Agent → Arquitectura + ADRs (formato MADR)
        ↓
   Dev Agent → Codigo REAL (FastAPI/Next.js/etc) - archivos completos
        ↓
   QA + Security Agents → revision + policy evaluation YAML
        ↓
   Git Connector → branch + commit + PR (opcional con token)
        ↓
   Deploy Connector → Render/Vercel (opcional con token)
```

Todo orquestado por `POST /projects/{key}/build` (un solo endpoint dispara
el pipeline completo). Ver [docs/USE_CASES.md](docs/USE_CASES.md) para 10 ejemplos curl.

## TL;DR (sin API key)

```bash
cp .env.example .env            # default: SCRUMDEV_AI_PROVIDER=claude_code
make infra-up                   # Postgres + pgvector + Redis docker
make install                    # poetry + npm
make run                        # 14 microservicios FastAPI background
make frontend-dev               # Next.js en http://localhost:3000
```

> Requisito: `claude` (Claude Code CLI) instalado y autenticado. Verifica con `claude --version`.

Abre http://localhost:3000 → registrate → wizard "Nuevo proyecto" (3 pasos:
identidad + vision + stack) → en la vista del proyecto, **boton grande
"Generar sistema completo"** y mira como los agentes producen tu backlog +
arquitectura + codigo en vivo.

## Que incluye

### Backend (FastAPI, Python 3.11+) - 14 microservicios
**Dominio (core flow)**
- **API Gateway** (8080) - proxy unificado, CORS, rutas REST publicas
- **Conversation Service** (8001) - chat, persistencia de hilos
- **Orchestrator Service** (8002) - inicia workflows, persiste `WorkflowRun`
- **Agent Runtime Service** (8003) - ejecuta agentes Claude (CrewAI o Claude Code SDK)

**Connectors externos**
- **Jira Connector** (8004) - Jira Cloud REST API v3 (CRUD issues + comments)
- **Git Connector** (8005) - GitHub API (branches, commits, PRs)
- **Deploy Connector** (8006) - Render API (deploys + status)

**Servicios transversales**
- **Auth Service** (8011) - register/login con JWT + bcrypt
- **User Service** (8012) - users + projects CRUD
- **Notification Service** (8010) - notificaciones in-app + **WebSockets** (`/ws/{user_id}`)
- **Policy Service** (8007) - politicas de calidad/seguridad
- **Memory Service** (8008) - **memoria semantica con pgvector** (RAG)
- **Audit Service** (8009) - eventos persistidos en Postgres
- **ML Service** (8013) - **embeddings + clasificacion + estimacion + riesgos** (sentence-transformers, 100% local)

Shared modules: `config`, `contracts`, `events` (bus hibrido in-memory + RabbitMQ opcional),
`db` (SQLAlchemy + pgvector), `security` (JWT + bcrypt), `observability` (structlog + Prometheus).

### Agentes
Misma definicion de 5 roles, dos motores intercambiables segun `SCRUMDEV_AI_PROVIDER`:

| Provider | Motor | Auth | Costo |
|---|---|---|---|
| `claude_code` (default) | Claude Agent SDK con prompts secuenciales especializados | Tu sesion de Claude Code (Pro/Max) | Incluido en tu plan |
| `anthropic` | CrewAI + Anthropic API | API key | Pago por token (requiere `poetry run pip install crewai anthropic litellm`) |
| `openai` | CrewAI + OpenAI API | API key | Pago por token |

Roles:
- `po_agent` - Product Owner
- `architect_agent` - Software Architect
- `developer_agent` - Developer
- `qa_agent` - QA
- `security_agent` - Security

### Crews (pipelines de agentes)
- `refinement` - **ML analisis + PO refina** historia (AC, DoD, riesgos, estimacion)
- `architecture` - **ML analisis + Arquitecto** disena arquitectura
- `delivery` - **ML + PO + Architect + Developer + QA + Security** (pipeline completo end-to-end)

Antes de cada pipeline, el ML Service enriquece el prompt con clasificacion
(tipo + area), estimacion preliminar y riesgos detectados.

### Machine Learning (sin API key, sin red externa)
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384 dims, ~80MB, ingles/multilingual).
- **Clasificacion**: zero-shot por similitud coseno contra centroides (6 tipos, 7 areas).
- **Estimacion de esfuerzo**: heuristica lexica + patrones por embeddings (XS/S/M/L/XL -> Fibonacci).
- **Riesgos**: catalogo OWASP-aware con scoring (pago, auth, compliance, integraciones...).
- **RAG**: memoria semantica via pgvector (cosine similarity en Postgres).

Endpoints: `POST /ml/analyze` (todo), `/ml/classify-story`, `/ml/estimate-effort`, `/ml/extract-risks`.

### Frontend (Next.js 14, Tailwind, lucide-react)
- `/` - landing con CTA inteligente (login o proyectos)
- `/login`, `/register` - auth con mock localStorage (Fase 1)
- `/projects` - lista de proyectos con modal de creacion
- `/projects/[key]` - vista con tabs: **Chat | Workflows | Agentes | ML insights | Audit log**
- `/workflows` - panel de salud de los 14 servicios con histórico

WebSockets activos contra `notification_service:8010` para push live.

## Arquitectura

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para diagrama completo y
decisiones de diseno de la Fase 1.

```
Frontend  ->  API Gateway  ->  Conversation  ->  Orchestrator  ->  Agent Runtime  ->  CrewAI (Claude)
                                              \-> Connectors (Jira / Git / Deploy)
                                              \-> Policy / Memory / Audit
```

**Capacidades end-to-end implementadas (talleres 1-6 + guia maestra):**

| Capacidad | Backend | Frontend | Endpoint |
|---|---|---|---|
| Refinement automatico | ✓ | ✓ Chat | `POST /workflows/start` |
| NFR captura | ✓ | ✓ Tab NFR | `POST /nfr` |
| Architecture Agent con NFR | ✓ | ✓ Auto-trigger | `POST /workflows/advance` |
| Human approval (HITL) | ✓ | ✓ Tab Decisiones | `GET /decisions/pending` + approve/reject |
| ADR generator | ✓ | ✓ Tab Arquitectura | `POST /adr/generate` |
| Policy YAML eval | ✓ | ✓ Tab Arquitectura | `POST /policy/evaluate` |
| State machine SDLC (14 estados) | ✓ | - | `state_machine.py` |
| Memoria semantica RAG | ✓ pgvector | - | `POST /memory/search` |
| ML analisis local | ✓ sentence-transformers | ✓ Tab ML insights | `POST /ml/analyze` |
| Auth + JWT | ✓ bcrypt | ✓ Login/Register | `POST /auth/login` |
| WebSockets notifications | ✓ | ✓ live updates | `WS /ws/{user_id}` |
| Connectors reales | ✓ Jira/GitHub/Render | - | `POST /issues`, `/pulls`, `/deploys` |

**Decisiones**:
- **Temporal y RabbitMQ son opcionales** (flags `TEMPORAL_ENABLED`, `RABBITMQ_ENABLED`). Con flag on, orchestrator inicia workflow durable; sin flag, llamada HTTP directa al agent_runtime.
- **Memoria semantica con pgvector** automatica (extension `vector` activada en docker postgres). Fallback a keyword search si no disponible.
- **Connectors** responden mock si no hay credenciales; con credenciales hacen llamadas reales (Jira REST v3, GitHub API, Render API).
- **Auth** completo: backend JWT + bcrypt, frontend con login/register reales. localStorage solo para `loginAsGuest()` (modo offline).
- **Policies como YAML** (4 archivos en `policy_service/app/policies/`): editables sin recompilar.

## Configuracion

Variables clave en `.env` (ver `.env.example`):

```env
# Default - SIN API key, usa tu Claude Code instalado (plan Pro/Max)
SCRUMDEV_AI_PROVIDER=claude_code

DATABASE_URL=postgresql+asyncpg://scrumdev:scrumdev@localhost:5434/scrumdev_ai
REDIS_URL=redis://localhost:6379/0
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

**Alternativa con Anthropic API:**
```env
SCRUMDEV_AI_PROVIDER=anthropic
SCRUMDEV_AI_MODEL=claude-sonnet-4-6
SCRUMDEV_AI_API_KEY=sk-ant-...
```
Requiere instalar deps adicionales:
```bash
cd backend && poetry run pip install "crewai>=0.86" "anthropic>=0.39" "litellm>=1.52"
```

**Alternativa con OpenAI:**
```env
SCRUMDEV_AI_PROVIDER=openai
SCRUMDEV_AI_MODEL=gpt-4o-mini
SCRUMDEV_AI_API_KEY=sk-...
```

Si quieres conectar Jira/GitHub reales, pega los tokens en `.env`. Sin tokens
los connectors devuelven respuestas mock.

## Comandos

```bash
make help            # lista comandos
make install         # poetry install + npm install
make infra-up        # docker compose: postgres + redis
make infra-down      # apaga infra
make run             # levanta los 10 servicios en background
make stop            # detiene los servicios
make frontend-dev    # next dev en :3000
make test            # pytest
make fmt             # ruff + black
make lint            # ruff + mypy
make clean           # limpia caches y procesos
```

## Probar via curl

```bash
# Health gateway
curl -s http://localhost:8080/health | jq

# Estado de todos los servicios
curl -s http://localhost:8080/services/status | jq

# Refinar una historia
curl -s -X POST http://localhost:8080/workflows/start \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "SDAI",
    "message": "Como cliente quiero pagar con tarjeta para completar mi compra",
    "crew_name": "refinement"
  }' | jq

# Pipeline completo PO->Arch->Dev->QA->Security
curl -s -X POST http://localhost:8080/workflows/start \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo",
    "project_key": "SDAI",
    "message": "Sistema de reservas online de citas medicas con notificacion email",
    "crew_name": "delivery"
  }' | jq
```

## Estructura del repo

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests

```bash
cd backend
poetry run pytest -q
```

## Roadmap

Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## Origen

Este proyecto implementa la propuesta tecnica descrita en los talleres del
repositorio [adanbeltran/ProyectoEstanciaDelfin](https://github.com/adanbeltran/ProyectoEstanciaDelfin),
adaptada a una primera fase corrible y verificable en local, con Claude como
LLM por defecto.

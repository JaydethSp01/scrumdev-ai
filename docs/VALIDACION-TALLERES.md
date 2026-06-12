# Validación detallada contra los Talleres (02-orquestando-agentes-con-crewai)

> Análisis taller por taller (los 7 documentos completos) contra el código real
> del repo. Cada ✅ fue verificado en archivos concretos; cada decisión distinta
> al taller queda documentada con su porqué.

## Veredicto global

**La VISIÓN del taller se cumple**: plataforma multiagente que automatiza el
ciclo de vida del software con Scrum, manteniendo al humano (PO) dentro de cada
decisión, con frontend conversacional, agentes especializados, memoria,
políticas, testing y despliegue cloud. Las diferencias son de *infraestructura
equivalente* (documentadas), no de comportamiento.

---

## Taller 1 — Configuración e integraciones

| Pide | Estado | Evidencia / decisión |
|---|---|---|
| Git, Docker, Python 3.11+, Poetry | ✅ | repo + `pyproject.toml` + Dockerfile |
| Jira Cloud (cuenta, proyecto, token) | ✅ configurado / ⏸ **desactivado a pedido del cliente** | `jira_connector_service` funcional (creó SCRUM-18 en pruebas); apagado para centrar el flujo en la plataforma |
| GitHub (repo + fine-grained token) | ✅ | deploys publican repos reales |
| Proveedor IA + API key | ✅ | Claude Code (plan) como principal + OpenAI de apoyo — supera el mínimo |
| PostgreSQL gestionado (Supabase) | 🔁 equivalente | **Neon** (Postgres serverless, free) — misma categoría |
| Deploy provider (Render) | 🔁 equivalente | **Vercel (front) + HF Space (back plataforma) + Render (apps generadas)** |
| `.env` centralizado `SCRUMDEV_*` + `.gitignore` | ✅ | `shared/config/settings.py` lee todo de env |

## Taller 2 — Backend base (microservicios)

| Pide | Estado | Evidencia |
|---|---|---|
| 10 microservicios bajo `services/` | ✅ **los 10 + 5 extra** | api_gateway, conversation, orchestrator, agent_runtime, jira_connector, git_connector, deploy_connector, policy, memory, audit (+ auth, user, notification, ml) |
| `shared/` (config, contracts, events, schemas, clients, security, observability) | ✅ | todos presentes |
| `StartWorkflowCommand`, `AgentExecutionCommand`, `ServiceResponse`, `DomainEvent` | ✅ | `shared/contracts/commands.py`, `shared/events/domain_events.py` |
| Constantes de eventos (HUMAN_MESSAGE_RECEIVED, WORKFLOW_STARTED, HUMAN_APPROVAL_REQUIRED, AGENT_EXECUTION_*) | ✅ | `shared/events/event_types.py` |
| PostgreSQL 16 | ✅ | Neon (Postgres) |
| Redis / RabbitMQ | 🔁 parcial | `shared/events/rabbitmq_bus.py` existe (aio_pika) con fallback in-process cuando no hay broker — en el Space free corre el fallback |
| Temporal | 📋 decisión documentada | el **orchestrator** implementa la máquina de estados durable (avance, gates, reintentos, watchdog). Temporal no cabe en free tier; el comportamiento (persistencia de estado, reanudación, aprobaciones humanas) está cubierto |
| API Gateway :8080 con /health y enrutamiento | ✅ | gateway + proxies a todos los servicios |
| Conversation Service POST /messages | ✅ | `conversation_service/app/main.py:71` |
| Orchestrator POST /workflows/start | ✅ | + todo el motor del pipeline |
| Dockerfiles | ✅ | Dockerfile raíz (Space) |

## Taller 3 — Runtime de agentes

| Pide | Estado | Evidencia |
|---|---|---|
| 5 agentes CrewAI (PO, Architect, Developer, QA, Security) | ✅ **11 agentes** | + scrum_master, nfr, code_review, devops, release (`app/agents/`) |
| AgentRegistry + bootstrap | ✅ | `runtime/bootstrap.py` (get_registry) |
| LLM configurable por env | ✅ | `runtime/llm.py` + Claude Code runtime |
| Memoria semántica (vector store) | ✅ | `app/memory/vector_store.py` + `memory_service` + sentence-transformers en el Space |
| Crews (refinement, architecture) | ✅ **4 crews** | refinement, architecture, delivery, claude_code |
| AgentExecutor | ✅ | `runtime/agent_executor.py` |
| Endpoints /health, /refinement | ✅ | + /backlog/generate, /app/generate, /adr/generate, /sprints/plan… |
| Policy service con `architecture-policy.yaml` | ✅ **3 políticas** | architecture, security, twelve-factor (`policy_service/app/policies/`) |
| Eventos de auditoría | ✅ | audit_service + DomainEvents |

## Taller 4 — Frontend conversacional (analizado fase por fase antes)

| Pide | Estado |
|---|---|
| Next.js + TS + Tailwind, estructura modular | ✅ |
| Cliente Axios centralizado (`lib/api/client`) | ✅ `lib/http.ts` |
| Chat = mecanismo PRINCIPAL (ChatWindow/Input/Message) | ✅ `ConversationCenter` protagonista |
| WebSockets tiempo real | ✅ `/events/ws` verificado en vivo (push de estados) |
| Panel Workflows / Panel Agentes (apoyo) | ✅ Flujos + Agentes con semáforo |
| Formulario NFR | ✅ **mejorado: inline en el chat** (el agente pregunta, el PO responde) |
| Aprobaciones humanas | ✅ gates inline con Aprobar/Pedir cambios/Explícame |
| Zustand estado global | ✅ |
| Dashboard integrando todo | ✅ chat centro + paneles laterales (punto 12 de la infografía) |

## Documento maestro (taller_microservicios) — el flujo gateado

| Pide | Estado |
|---|---|
| Máquina de estados BACKLOG→…→RELEASED | ✅ `state_machine.py` + `project_pipeline.py` |
| Gates humanos bloqueantes (NFR, Arquitectura, PO Review, Release/Prod) | ✅ **6 gates** (se agregó Aprobar Backlog por pedido del cliente) |
| "Sin aprobación explícita NO se despliega a producción" | ✅ gate #6 bloqueante |
| Agentes sugieren, SOLO el humano aprueba | ✅ |
| ADRs generados y aprobados | ✅ 3+ ADRs por proyecto, descargables |
| Policy gates sobre el código | ✅ build gate + policy + fallo→backlog |
| Deploy Connector a staging al aprobar release; PO valida URL; luego producción | ✅ implementado (taller F8-10): deploy automático + URL en gate + RELEASED con URLs en chat |
| Jira/Git sincronización bidireccional | ⏸ Jira desactivado a pedido; Git: publicación real de repos en cada deploy |

## Taller 5 — Integración y testing

| Pide | Estado |
|---|---|
| Front↔Gateway↔Servicios↔Agentes integrados | ✅ verificado E2E por el gateway (camino real de la UI) |
| Tests unitarios (pytest + TestClient) | ✅ `backend/tests/unit/` (event_bus, registry, executor, settings, ml, security) |
| Tests integración + E2E | ✅ `scripts/e2e_adam.py` (A–I, TODAS PASAN) + ensayos en vivo (2 corridas completas hoy) |
| Flujo: usuario escribe → workflow → agentes → frontend | ✅ verificado con tiempos (backlog 36s, dev 3.2 min, 88 archivos+13 tests) |
| Observabilidad (logs estructurados, trazabilidad) | ✅ structlog + audit; (Temporal UI/RabbitMQ UI no aplican — ver decisión T2) |

## Taller 6 — DevOps y despliegue

| Pide | Estado |
|---|---|
| GitHub Actions CI (pytest) + build | ✅ `.github/workflows/ci.yml` |
| CD staging/prod | ✅ `cd-staging.yml`, `cd-prod.yml` + auto-deploy real: push→Vercel (front) y push→HF Space (back) |
| Dockerfiles + compose | ✅ Dockerfile (Space es Docker) |
| Backend en Render / Frontend en Vercel | 🔁 front Vercel ✅; back plataforma en **HF Space** (Render free hacía OOM con el ML — decisión documentada); **las apps generadas SÍ van a Render** |
| Ambientes separados + envs | ✅ local + producción con env vars por proveedor |
| Dominios HTTPS | ✅ `scrumdevai.vercel.app` / `…hf.space` (https) — sin dominio propio (no requerido para free) |
| Health checks + monitoreo | ✅ /health + cron keep-alive + logs |
| Hardening (debug off, tokens fuera del repo, env vars) | ✅ |

---

## Lo que NO está (honesto) y por qué no rompe la visión
1. **Temporal real** — sustituido por el orquestador propio (mismo comportamiento observable: estado durable, gates, reintentos). Free tier.
2. **RabbitMQ/Redis activos en prod** — el bus tiene implementación RabbitMQ con fallback in-process; en el Space corre el fallback (un solo proceso, no lo necesita).
3. **Jira activo** — connector completo y probado, **apagado a pedido del cliente** para centrar el demo en la plataforma.
4. **Dominio propio** — subdominios https de Vercel/HF.

Ninguno de los 4 cambia lo que el PO ve o decide: el ciclo gateado, los agentes,
el chat, el feedback constante y el despliegue supervisado funcionan de punta a
punta — que es la visión declarada del taller ("acelerar el ciclo de vida del
software manteniendo al humano dentro del proceso de decisión").

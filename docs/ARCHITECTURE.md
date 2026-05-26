# Arquitectura - ScrumDev AI (Fase 1)

## Vision

Plataforma multiagente que coordina agentes IA especializados (Product Owner,
Arquitecto, Developer, QA, Security) para acelerar refinamiento, diseno y
construccion de MVPs empresariales.

## Stack de la Fase 1

| Capa | Tecnologia | Estado |
|---|---|---|
| Frontend | Next.js 14 + Tailwind | Activo |
| API Gateway | FastAPI | Activo |
| Conversation Service | FastAPI | Activo |
| Orchestrator Service | FastAPI (sin Temporal aun) | Activo |
| Agent Runtime | FastAPI + CrewAI + Anthropic Claude | Activo |
| Connectors | FastAPI stubs (Jira/Git/Deploy) | Stub |
| Policy / Memory / Audit | FastAPI | Activo |
| Base de datos | PostgreSQL (docker) | Activo |
| Cache | Redis (docker) | Activo |
| Event Bus | In-memory (futuro: RabbitMQ) | Activo |
| Workflows | Sincronos via HTTP (futuro: Temporal) | Activo |

## Flujo de una solicitud

```
Frontend
  -> POST /workflows/start
API Gateway (8080)
  -> POST /workflows/start
Orchestrator Service (8002)
  -> POST /crews/{crew}/run
Agent Runtime Service (8003)
  -> CrewAI Crew
       -> Agents (Claude via litellm/anthropic)
  -> output markdown
Orchestrator -> persiste WorkflowRun
API Gateway -> respuesta JSON
Frontend -> renderiza markdown
```

## Decisiones pragmaticas Fase 1

1. **Sin Temporal todavia**: el orchestrator llama directo al agent_runtime via HTTP.
   El paso a Temporal queda como Fase 2 (variable `TEMPORAL_ENABLED`).
2. **Sin RabbitMQ todavia**: bus de eventos in-memory en `shared/events/event_bus.py`.
   El paso a RabbitMQ requiere reemplazar la implementacion conservando la API.
3. **Connectors stub**: Jira/Git/Deploy responden mock si las credenciales no estan;
   con credenciales reales hacen llamadas reales (Jira REST API v3, GitHub API).
4. **LLM Anthropic Claude por defecto**: el modelo se controla con
   `SCRUMDEV_AI_MODEL`. Default: `claude-sonnet-4-6`.
5. **Microservicios como modulos Python independientes**: cada servicio se puede
   ejecutar por separado con uvicorn. En Fase 2 se pueden empaquetar en imagenes
   Docker individuales sin cambiar el codigo.
6. **Persistencia opcional**: si Postgres esta caido, los servicios siguen
   funcionando degradados (warning + in-memory). En Fase 2 hacer Postgres
   requisito duro.

## Estructura del repo

```
scrumdev-ai/
  backend/
    pyproject.toml
    shared/                # config, contratos, eventos, db, observability
    services/
      api_gateway/
      conversation_service/
      orchestrator_service/
      agent_runtime_service/
        app/agents/        # 5 agentes Claude
        app/crews/         # 3 crews (refinement, architecture, delivery)
        app/runtime/       # llm.py, executor, registry, bootstrap
        app/memory/
      jira_connector_service/
      git_connector_service/
      deploy_connector_service/
      policy_service/
      memory_service/
      audit_service/
    temporal/              # placeholder, fase 2
    tests/
  frontend/
    app/
      page.tsx             # landing
      chat/page.tsx        # chat conversacional
      workflows/page.tsx   # estado de servicios
  infra/
    docker-compose.yml      # postgres + redis
    docker-compose.full.yml # + rabbitmq + temporal (opcional)
  scripts/
    run_backend.sh
    stop_backend.sh
    smoke_test.sh
  docs/
    ARCHITECTURE.md
    ROADMAP.md
  Makefile
  .env.example
```

## Roadmap a Fase 2

1. Activar Temporal con worker dedicado para workflows durables.
2. Reemplazar event bus por RabbitMQ con `aio-pika`.
3. Memoria semantica real con ChromaDB / pgvector.
4. Dockerfiles por servicio + compose end-to-end con backend incluido.
5. Migraciones Alembic.
6. Auth real (JWT issuer + RBAC por proyecto).
7. CI/CD basico (pytest + ruff + build images).

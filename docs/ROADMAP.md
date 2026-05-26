# Roadmap

## Fase 1 (entregada)
- [x] Arquitectura microservicios con FastAPI modular
- [x] 5 agentes especializados con CrewAI + Claude
- [x] 3 crews (refinement, architecture, delivery full)
- [x] Event bus in-memory + auditoria
- [x] Persistencia Postgres opcional
- [x] Frontend Next.js con chat y panel de servicios
- [x] Healthchecks y smoke test
- [x] Tests unitarios e integracion basicos
- [x] Connectors stub (Jira/Git/Deploy)

## Fase 2 (siguiente)
- [ ] Temporal worker durable (workflows reintentables, aprobaciones humanas)
- [ ] RabbitMQ como bus de eventos real
- [ ] ChromaDB / pgvector para memoria semantica con RAG
- [ ] Dockerfile por servicio + compose end-to-end
- [ ] Alembic migrations
- [ ] Jira/GitHub integraciones reales con sync bidireccional
- [ ] Deploy connector real (Render API)
- [ ] Auth JWT + RBAC

## Fase 3 (mvp empresarial)
- [ ] Multi-proyecto y multi-tenant
- [ ] Generacion de codigo + PR automatico
- [ ] Pipelines CI/CD generados
- [ ] Observabilidad (OpenTelemetry + Prometheus)
- [ ] Human-in-the-loop dashboard

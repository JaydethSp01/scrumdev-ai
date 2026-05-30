# ADR-001 — Estilo de arquitectura

- **Estado:** Aceptada
- **Fecha:** 2026-05-30
- **Contexto:** Guía Delfín (taller 02, §4 y §7) — plataforma multiagente que orquesta el ciclo de vida del software.

## Decisión

Arquitectura de **microservicios orientada a eventos** con **human-in-the-loop**, desplegada en producción como **4 bundles** (consolidación de los 10 microservicios lógicos vía sub-app mount) para sostenibilidad operativa sin perder el desacoplamiento.

- **10 servicios lógicos** (gateway, conversation, orchestrator, agent-runtime, jira/git/deploy connectors, policy, memory, audit + auth/user/notification/ml) → **4 deployables**: `core`, `brain`, `connectors`, `gateway`.
- **Hexagonal / puertos y adaptadores**: el Orchestrator NO conoce Jira/GitHub/proveedores; solo contratos HTTP. Los connectors son adaptadores intercambiables (Adapter + Port/Protocol).
- **Orientada a eventos**: bus con prioridad Kafka → RabbitMQ → in-memory (`DomainEvent` con `correlation_id`).
- **Workflows durables**: Temporal para el ciclo de vida.
- **Human-in-the-loop**: 4 gates de aprobación humana obligatorios en la máquina de 14 fases.

## Consecuencias

- ✅ Desacoplamiento real (cambiar GitHub→GitLab = nuevo adaptador, sin tocar el core). Ver [ADR-extensibilidad](#) y `docs/EXTENSIBILITY.md`.
- ✅ Operación sostenible: 4 procesos en vez de 14 (modo `BUNDLE_MODE`).
- ✅ Patrones aplicados: Adapter, Port, Strategy, Observer (event bus), State machine, Circuit Breaker, Repository, Factory.
- ⚠️ El bundling requiere reescritura de URLs internas (`settings.*_service_url` → sub-paths) — resuelto en `shared/config/settings.py`.

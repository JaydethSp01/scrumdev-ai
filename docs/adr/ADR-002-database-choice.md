# ADR-002 — Elección de base de datos

- **Estado:** Aceptada
- **Fecha:** 2026-05-30
- **Contexto:** Persistencia de la plataforma y del software que genera para el cliente.

## Decisión

- **Plataforma**: **PostgreSQL 16** (async vía `asyncpg`/SQLAlchemy) como almacén relacional principal; **pgvector / embeddings** para memoria semántica (`MemoryItem`, `BuildMemory` del Stack Expert); **Redis** para cache/locks.
- **Software generado (por cliente)**: **Neon Postgres** auto-aprovisionado en el deploy (un proyecto Neon por proyecto desplegado), inyectado como `DATABASE_URL` en el backend en Render.
- **Modelo de dominio del ciclo de vida**: `Project → ProjectVersion → Sprint → BacklogItem(task)`, con código versionado en `CodeArtifact.version_id` (acumulativo por versión, copy-forward entre versiones).

## Consecuencias

- ✅ Postgres cubre relacional + vectorial (pgvector) sin sumar otra DB.
- ✅ Neon serverless encaja con el deploy del backend en Render (free tier, autoscale).
- ✅ Migraciones fase 1 con `create_all` + `ALTER TABLE` idempotente; migrar a Alembic es trabajo futuro (ver ROADMAP).
- ⚠️ Neon: reusar proyecto existente puede fallar (`no_role_found`); se crea con nombre único para forzar el camino de creación que devuelve `connection_uri`.

## Title
ADR-002: Adoptar PostgreSQL como base de datos relacional gestionada

## Status
proposed

## Context
El proyecto CLAUDETEST08 requiere persistencia para tareas (S-004, S-009) y usuarios autenticados (S-003). El modelo de datos es predecible y fuertemente relacional: un usuario tiene muchas tareas, cada tarea pertenece a un único propietario, y existen consultas por estado (completada/pendiente) y por fecha de creación.

Restricciones y supuestos:
- Volumen inicial bajo (cientos a miles de tareas por usuario), con potencial de crecimiento si se integran equipos.
- Coherencia con ADR-001: arquitectura monolítica modular con backend API REST, lo que favorece un único almacén transaccional sin necesidad de polyglot persistence.
- Equipo pequeño, se prioriza familiaridad, ecosistema maduro y bajo costo operativo.
- Requisitos ACID para operaciones de marcado/edición (S-009) y futura asignación de tareas.
- Necesidad de migraciones versionadas para evolucionar el esquema sin downtime.
- Despliegue en nube con proveedor gestionado para evitar carga operativa (backups, parches, HA).

Alternativas evaluadas:
- **SQLite**: simple y embebible, pero limitado para concurrencia de escritura y despliegues distribuidos.
- **MongoDB**: flexible en esquema, pero el dominio es relacional y no requiere documentos anidados complejos.
- **MySQL/MariaDB**: válido, pero PostgreSQL ofrece mejor soporte de tipos (JSONB, arrays), constraints y extensiones.
- **Firebase/Firestore**: acelera prototipos, pero acopla a un vendor y complica testing local y queries relacionales.

## Decision
Se adopta **PostgreSQL 16** como base de datos primaria, desplegada en un proveedor gestionado (Neon o Supabase) para entornos de staging y producción, y vía Docker Compose en desarrollo local.

Justificación técnica:
- Modelo relacional natural para las entidades `users` y `tasks` con integridad referencial vía foreign keys y constraints `NOT NULL`/`CHECK`.
- Soporte ACID completo para garantizar consistencia en operaciones de creación, edición y marcado.
- Tipo `JSONB` disponible para campos extensibles futuros (metadata, etiquetas) sin migrar de motor.
- Índices B-tree sobre `user_id`, `status` y `created_at` cubren los patrones de consulta de las historias actuales.
- Migraciones gestionadas con una herramienta de versionado (p. ej. Prisma Migrate, Knex o Flyway) alineada al stack del backend definido en ADR-001.
- Ecosistema maduro: drivers oficiales, observabilidad estándar, backups point-in-time del proveedor gestionado.

## Consequences

**Positivas:**
- Integridad y consistencia garantizadas a nivel de motor.
- Esquema explícito que documenta el dominio y facilita el onboarding.
- Camino claro de escalado vertical y de réplicas de lectura cuando crezca la demanda.
- Compatibilidad amplia con ORMs y herramientas de testing.

**Negativas:**
- Requiere definir y versionar migraciones desde el día uno, añadiendo disciplina al flujo de desarrollo.
- Coste fijo mensual del servicio gestionado, aunque marginal en el tier inicial.
- Mayor fricción para cambios de esquema frecuentes comparado con almacenes schemaless.

**Neutrales:**
- Obliga a definir una capa de acceso a datos (repositorio u ORM) en el backend, decisión que se abordará en un ADR posterior.
- El uso de un proveedor gestionado introduce dependencia de su SLA, mitigable con backups exportables periódicos.

---
_Author: ScrumDev AI (`adr_generator.py`)_
_Project: CLAUDETEST08_
_Date: 2026-06-16T02:03:44.485919+00:00_
_File: docs/adr/ADR-002-eleccion-de-base-de-datos.md_

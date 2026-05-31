## Title
ADR-001: Adopción de arquitectura monolítica modular con frontend desacoplado para E2EFLOW

## Status
proposed

## Context
E2EFLOW debe entregar gestión de inventarios y pedidos en tiempo real para minoristas, cubriendo entidades acopladas transaccionalmente (`producto`, `inventario`, `pedido`, `proveedor`) y procesos críticos como alertas de bajo stock por bodega, recepción de pedidos y reposición automática sugerida (HU S-007).

Restricciones y fuerzas a considerar:

- Equipo reducido en fase inicial: no es viable operar múltiples servicios independientes ni una malla de microservicios.
- Consistencia transaccional fuerte entre `inventario` ↔ `pedido` ↔ `movimientos de stock` (evitar sobreventa y descuadres por bodega).
- Necesidad de iterar rápido sobre reglas de negocio (stock mínimo, rotación, sugerencias de reposición).
- Stack ya definido a nivel de plantilla: **Next.js (frontend)**, **FastAPI (backend)**, **PostgreSQL (persistencia)**.
- Requisito de despliegue simple, observabilidad básica y costos contenidos para piloto con minoristas.
- Las rutas funcionales (`/productos`, `/inventario`, `/proveedores`, `/pedidos`, `/alertas`, `/informes`) comparten el mismo dominio y modelo de datos, sin justificar fragmentación temprana.

## Decision
Se adopta una arquitectura **monolítica modular** en el backend (FastAPI) con **frontend desacoplado** (Next.js) comunicándose vía **API REST/JSON**, sobre una única base de datos **PostgreSQL**.

Lineamientos:

- **Backend FastAPI** organizado por módulos de dominio (`productos/`, `inventario/`, `pedidos/`, `proveedores/`, `alertas/`, `informes/`), cada uno con capas `router → service → repository → models`. Sin dependencias cruzadas entre módulos salvo a través de servicios públicos explícitos, preparando una futura extracción si fuese necesaria.
- **Frontend Next.js** con App Router, consumiendo el backend mediante un cliente HTTP tipado. Renderizado híbrido (SSR para listados pesados como `/inventario` e `/informes`, CSR para flujos interactivos como `/pedidos`).
- **PostgreSQL único** con esquemas lógicos por contexto (o prefijos de tabla) y transacciones ACID para operaciones críticas (descuento de stock, recepción de pedido, generación de orden de reposición).
- **Procesos asíncronos ligeros** (alertas de bajo inventario, sugerencia de reposición S-007) implementados inicialmente como *background tasks* de FastAPI o jobs programados, sin introducir aún broker dedicado.
- **Contrato OpenAPI** generado automáticamente por FastAPI como fuente de verdad para el cliente Next.js.

Justificación técnica:

- El dominio es fuertemente cohesivo y transaccional → un monolito modular evita la complejidad distribuida (sagas, consistencia eventual) que no aporta valor al MVP.
- La modularización interna mantiene el costo de cambio bajo y habilita una migración incremental a servicios si la carga o el equipo lo justifican más adelante (estrangulamiento por módulo).
- Desacoplar Next.js de FastAPI permite evolucionar UX y dominio a ritmos distintos, y abre la puerta a otros consumidores (app móvil, integraciones de proveedores).

## Consequences

**Positivas**

- Time-to-market corto: un único pipeline de build/deploy para el backend y otro para el frontend.
- Consistencia transaccional garantizada por PostgreSQL sin coordinación distribuida.
- Modularidad interna facilita refactors y la futura extracción de módulos (p. ej. `informes` o `alertas`) como servicios.
- Contrato OpenAPI tipado reduce errores de integración entre Next.js y FastAPI.
- Costos de infraestructura y operación bajos para la etapa de piloto.

**Negativas**

- Riesgo de acoplamiento si la disciplina modular se relaja (imports cruzados entre módulos, lógica de dominio en routers).
- Escalado vertical del backend como primera palanca; picos de carga en `/informes` pueden afectar a `/pedidos` si no se aíslan recursos.
- Un único punto de despliegue del backend: un bug en un módulo puede impactar a todos.
- Procesos asíncronos sobre el mismo proceso de FastAPI limitan la robustez de tareas largas (rotación, sugerencias S-007 a gran escala).

**Neutrales**

- Obliga a definir desde el inicio convenciones de capas, nomenclatura de módulos y reglas de dependencia (lint arquitectónico).
- La elección de PostgreSQL único condiciona futuras decisiones de particionamiento por bodega/tenant.
- Requiere establecer una estrategia de versionado de API (`/api/v1`) para preservar compatibilidad con el frontend a medida que el dominio evolucione.

---
_Author: ScrumDev AI (`adr_generator.py`)_
_Project: E2EFLOW_
_Date: 2026-05-31T01:37:19.008688+00:00_
_File: docs/adr/ADR-001-estilo-de-arquitectura.md_

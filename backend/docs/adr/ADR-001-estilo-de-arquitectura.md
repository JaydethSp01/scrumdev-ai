## Title
ADR-001: Adopción de arquitectura monolítica modular con frontend desacoplado para E2EFLOW

## Status
proposed

## Context
E2EFLOW es un sistema fullstack de gestión de inventarios y pedidos para minoristas que opera sobre entidades altamente acopladas transaccionalmente (`producto`, `inventario`, `pedido`, `proveedor`) y debe garantizar consistencia en operaciones críticas como control de stock en tiempo real por bodega, alertas de bajo inventario, recepción de pedidos y reposición automática sugerida (HU S-007).

Fuerzas y restricciones que condicionan la decisión:

- **Stack definido**: Next.js (App Router) en frontend y FastAPI (Python) en backend, persistencia en PostgreSQL.
- **Equipo reducido** en fase inicial: se requiere velocidad de entrega sin sobreingeniería.
- **Consistencia transaccional fuerte** entre inventario y pedidos (descuento de stock, reservas, reposición) que penaliza arquitecturas distribuidas tempranas.
- **Rutas funcionales acotadas** (`/productos`, `/inventario`, `/proveedores`, `/pedidos`, `/alertas`, `/informes`) que mapean naturalmente a módulos de dominio.
- **Necesidad de evolución**: el sistema debe poder extraer módulos (p. ej. `informes`, `alertas`) hacia servicios independientes cuando la carga o el equipo lo justifiquen.
- **Despliegue independiente** de UI y API para iterar el frontend sin redeploy del backend y viceversa.

Alternativas consideradas:

1. **Monolito clásico acoplado (Next.js fullstack con API routes)**: rápido de iniciar pero limita el uso de FastAPI/Python para lógica de dominio e integraciones (reposición, reportes, ML futuro).
2. **Microservicios desde el inicio** (servicios separados por entidad): introduce complejidad operativa (orquestación, consistencia distribuida, observabilidad) injustificada para el volumen y madurez actuales.
3. **Monolito modular FastAPI + frontend Next.js desacoplado** (elegida): equilibra simplicidad operativa con límites de módulo claros y permite extracción futura.

## Decision
Se adopta una **arquitectura monolítica modular en el backend (FastAPI)** organizada por módulos de dominio (`productos`, `inventario`, `pedidos`, `proveedores`, `alertas`, `informes`), expuesta vía **API REST/JSON**, con un **frontend Next.js desacoplado** desplegado de forma independiente y consumiendo la API mediante un cliente HTTP tipado.

Lineamientos:

- Cada módulo de dominio encapsula sus modelos, repositorios, servicios y endpoints; las dependencias entre módulos se hacen vía **interfaces de servicio**, nunca por acceso directo a tablas de otro módulo.
- Persistencia única en **PostgreSQL** con esquema compartido, aprovechando transacciones ACID para operaciones críticas (descuento de stock al confirmar pedido, sugerencias de reposición).
- El frontend Next.js usa **App Router** y Server Components para vistas de lectura intensiva (`/inventario`, `/informes`) y Client Components para flujos interactivos (`/pedidos`, `/alertas`).
- La autenticación se centraliza en el backend (JWT/cookies httpOnly) y el frontend actúa como BFF ligero solo para sesión y SSR.
- Los procesos asíncronos (reposición sugerida HU S-007, generación de alertas) se diseñan como **tareas en background dentro del monolito** (FastAPI BackgroundTasks o un worker liviano) con contrato claro para migrarse a una cola dedicada cuando se requiera.

Justificación técnica: la fuerte cohesión transaccional entre inventario y pedidos hace que un monolito modular minimice latencia, simplifique la consistencia y reduzca coste operativo, mientras los límites de módulo preservan la opción de extraer servicios (`informes`, `alertas`) sin reescritura.

## Consequences

**Positivas**
- Time-to-market reducido: un solo proceso de despliegue para backend.
- Consistencia transaccional natural en operaciones críticas de inventario y pedidos.
- Despliegues independientes de frontend (Vercel/contenedor) y backend (contenedor) permiten iteración rápida de UI.
- Frontera de módulos clara facilita evolución incremental hacia servicios cuando lo justifique la carga.
- FastAPI habilita tipado fuerte (Pydantic) y documentación OpenAPI consumible desde Next.js con clientes generados.

**Negativas**
- Riesgo de erosión de los límites de módulo si no se aplican revisiones de código y reglas de dependencia (acoplamiento accidental entre módulos).
- Escalado vertical inicial: todo el backend escala como una unidad, lo que puede ser ineficiente cuando `informes` o `alertas` crezcan.
- Un fallo grave en el monolito afecta a todas las funcionalidades simultáneamente.

**Neutrales**
- Requiere disciplina arquitectónica (linters de imports, capa de servicios explícita) para mantener la modularidad.
- Obliga a definir y versionar un contrato API estable entre Next.js y FastAPI desde el inicio.
- La estrategia de observabilidad (logs, métricas, trazas) debe contemplar etiquetado por módulo para facilitar la futura extracción.

---
_Author: ScrumDev AI (`adr_generator.py`)_
_Project: E2EFLOW_
_Date: 2026-05-31T01:44:29.764738+00:00_
_File: docs/adr/ADR-001-estilo-de-arquitectura.md_

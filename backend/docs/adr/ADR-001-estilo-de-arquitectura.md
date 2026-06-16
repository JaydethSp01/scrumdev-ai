## Title
ADR-001: Adoptar arquitectura monolítica modular con frontend SPA y backend API REST

## Status
proposed

## Context
El proyecto CLAUDETEST08 es una app de tareas con alcance acotado: crear tareas, marcarlas como completadas, listarlas y editarlas (S-004, S-009). Las historias previas (S-003) ya definen un shell de UI con navegación autenticada y rutas protegidas, lo que implica separación clara entre cliente y servidor.

Restricciones y supuestos:
- Equipo pequeño, time-to-market corto y dominio simple (una sola entidad central: `Task`).
- Tráfico esperado bajo a moderado, sin requisitos de escalado independiente por subdominio.
- Necesidad de autenticación, persistencia de tareas por usuario y operaciones CRUD.
- Se requiere mantener coherencia con decisiones futuras sobre stack web y despliegue.
- Costos operativos deben ser mínimos: una sola unidad desplegable simplifica CI/CD, observabilidad y on-call.

Alternativas consideradas:
1. Microservicios desde el inicio: sobreingeniería para el alcance actual; introduce latencia de red, complejidad operativa y costo sin beneficio.
2. Serverless puro (functions): viable, pero fragmenta lógica de dominio y complica el modelado de transacciones sobre `Task`.
3. Monolito en capas tradicional: simple, pero acopla módulos y dificulta extracción futura.
4. Monolito modular + SPA + API REST: separa cliente/servidor, mantiene cohesión de dominio y permite extraer módulos si el producto crece.

## Decision
Se adopta una **arquitectura monolítica modular** con dos artefactos desplegables:

- **Frontend SPA** que implementa el shell de UI definido en S-003 (header, navegación, rutas protegidas) y consume la API mediante HTTPS.
- **Backend monolítico modular** expuesto como **API REST** versionada (`/api/v1`), organizado por módulos de dominio (`auth`, `tasks`) con fronteras explícitas: cada módulo encapsula su capa de aplicación, dominio y acceso a datos, y solo se comunica con otros módulos a través de interfaces públicas.

Justificación técnica:
- El dominio actual no justifica la complejidad distribuida; el monolito reduce latencia, simplifica transacciones y baja el costo cognitivo.
- La modularización interna preserva la opción de extraer un módulo a un servicio independiente si surge una necesidad real de escalado o de equipos paralelos (estrategia strangler-fig).
- REST sobre JSON es suficiente para operaciones CRUD sobre `Task`, es ampliamente conocido y se integra naturalmente con la SPA y con las rutas protegidas ya planificadas.
- Una sola base de código backend habilita pipelines de CI/CD simples y observabilidad centralizada desde el inicio.

## Consequences

**Positivas**
- Entrega rápida de S-004 y S-009 sin fricción de orquestación distribuida.
- Despliegues atómicos, debugging local sencillo y un único pipeline de CI/CD.
- Las fronteras modulares permiten migrar a microservicios de forma incremental si el producto lo demanda.
- Coherencia con S-003: la SPA consume una API estable y versionada detrás de autenticación.

**Negativas**
- Escalado vertical/horizontal del backend es todo-o-nada; no se puede escalar `tasks` independientemente de `auth`.
- Riesgo de erosión de fronteras modulares si no se aplican revisiones de código y reglas de dependencia explícitas.
- Un fallo en el monolito impacta todas las funcionalidades simultáneamente.

**Neutrales**
- Obliga a definir convenciones de módulos, contratos internos y versionado de API desde el día uno.
- La elección de framework backend, ORM y mecanismo de autenticación queda pendiente y será materia de ADRs posteriores.
- La SPA y el backend pueden desplegarse en la misma plataforma o por separado; esa decisión se aborda en un ADR de infraestructura.

---
_Author: ScrumDev AI (`adr_generator.py`)_
_Project: CLAUDETEST08_
_Date: 2026-06-16T02:03:08.511246+00:00_
_File: docs/adr/ADR-001-estilo-de-arquitectura.md_

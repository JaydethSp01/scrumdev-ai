# ADAM-100 — Capacidades A–I al 100% (sin cambiar arquitectura)

> Fuente de verdad: checklist unificado del cliente (Adam) + talleres
> (`doc/talleres/02-orquestando-agentes-con-crewai/`) + Taller 4 (`taller_4_frontend.md`)
> + código (`project_pipeline.py`, `refinement_crew.py`).
>
> **Capacidad I:** NO existe como "A–I" literal en el repo. Su definición canónica es
> el doc del **Taller 4** (requisitos transversales técnicos). Se documenta aquí como tal.
>
> **Decisión documentada (no se rehace):** all-in-one en vez de microservicios ·
> orquestador en vez de Temporal real · Neon · HF Space · Vercel. Adam toca el FLUJO,
> no la infra. Free tier en todo.

---

## A — Requerimientos por chat
- **Definición:** visión/documento por chat → Product Backlog con **criterios de aceptación** + **mockup** + **trazabilidad** historia↔requerimiento.
- **Dónde (hoy):** `frontend/components/conversation/ConversationCenter.tsx` (chat) · `backend .../main.py` `set_vision`, `run_smart_build` (genera backlog), `/projects/{k}/mockups`, `/projects/{k}/refinement` (`requirement_excerpt`).
- **Estado:** ✅ funcional. **Falta 100%:** mockup **por historia** (hoy a nivel producto) + 1 test que pruebe trazabilidad y criterios.

## B — Aprobar / priorizar
- **Definición:** PO aprueba y prioriza → **sprints** planificados → **tablero de decisiones** con estado.
- **Dónde:** `approve-gate` (botón en el chat `GateCard`) · `plan_sprints` · `DecisionsPanel.tsx` · `BoardsPanel.tsx`.
- **Estado:** ✅. **Falta 100%:** modificar/priorizar integrado al chat (hoy en Boards) + test del estado de decisiones.

## C — Tareas técnicas + DoR
- **Definición:** cada historia → tareas con **estimación** + **dependencias** + **DoR 6/6**; **bloqueo** si no cumple DoR.
- **Dónde:** `_story_tech_tasks` (con `depends_on`) · `_story_dor` · `generate_code` (return si falta DoR).
- **Estado:** ✅. **Falta 100%:** test que demuestre que SIN DoR NO se genera código.

## D — NFR + planner
- **Definición:** formulario NFR → **planner de validación** que corre **ANTES** de generar código.
- **Dónde:** `NFRForm.tsx` · gate `NFR_CAPTURE` · `_planner_validation` (mostrado en gate Arquitectura).
- **Estado:** ✅ (informativo). **Falta 100%:** que el planner **corra y bloquee** explícitamente antes de `generate_code` (no solo se muestre) + test.

## E — Generación por módulo  🟡 (hueco real #1)
- **Definición:** **ciclos SEPARADOS** por componente (backend / frontend / tests), cada uno su contexto y su code-summary. NO unificado-y-luego-organizado.
- **Dónde:** `_run_generate_full_app` (hoy **unificado**) · `/projects/{k}/code-summary` (por módulo).
- **Estado:** 🟡. **Falta 100%:** refactor a ciclos independientes por módulo, manteniendo el build gate que auto-arregla y CORRE.

## F — Revisión automática
- **Definición:** gate corre **lint + arquitectura + criterios + seguridad + tests** y **BLOQUEA** si falla.
- **Dónde:** `build_gate.py` · `policy_service` · gate `PO_REVIEW` (`auto_review` checks).
- **Estado:** ✅ (muestra). **Falta 100%:** que el gate **bloquee de verdad** si un check crítico falla + test.

## G — Sprint Review + DoD
- **Definición:** review genera **evidencia** + valida **DoD por historia**.
- **Dónde:** gate `PO_REVIEW` (`evidence`, `dod`, `story_dod`, `sprint_validation`).
- **Estado:** ✅. **Falta 100%:** test de evidencia + DoD.

## H — Feedback loop
- **Definición:** errores de build/review → **backlog automático**; mejoras → historias.
- **Dónde:** `_add_feedback_story` (auto en build fallido) · `POST /projects/{k}/feedback`.
- **Estado:** ✅ (build fail). **Falta 100%:** que un fallo de **review/QA** también cree item de backlog + test.

## I — Transversales (Taller 4)  🟡 (hueco real #3: Q&A profundo)
- **Definición:** chat principal · aprobaciones centralizadas · **WS tiempo real** · auth · trazabilidad e2e · sin lógica de negocio en front · stack Next/TS/Tailwind/**Zustand**/**Axios**.
- **Dónde:** `ConversationCenter` (chat principal) · `DecisionsPanel` · WS `/projects/{k}/events/ws` · auth · `lib/http.ts` (axios) · `lib/store` (zustand).
- **Estado:** ✅ casi todo (WS verificado en vivo). **Falta 100%:** **Q&A conversacional profundo** post-arranque (rutear pregunta al agente correcto con memoria del proyecto, streaming por WS).

---

## Los 3 huecos REALES (profundizaciones, free tier)
1. **E — Generación modular real** (ciclos separados backend/frontend/tests).
2. **Mockups por historia** (wireframe HTML/SVG renderizable, sin API paga).
3. **Q&A conversacional profundo** (modo chat libre → agente correcto + memoria + streaming WS).

## Plan por prioridad (1 commit por capacidad, con test)
1. **E** generación modular real (mayor impacto, el hueco más citado).
2. **Mockups por historia** (wireframe HTML/SVG por historia, mostrado en chat).
3. **Q&A profundo** (modo adicional, sin romper captura/narración/aprobación).
4. **D/F/H endurecer bloqueos**: planner bloquea pre-código · gate de revisión bloquea si falla · review/QA fallido → backlog.
5. **Tests por capacidad** A–I + **guion E2E** que recorra A–I dejando evidencia.

## Verificación de 100%
- Script E2E sobre un proyecto demo que toque A–I y deje artefactos/logs por capacidad.
- Actualizar este archivo marcando ✅ con la evidencia (archivo/test) que lo prueba.

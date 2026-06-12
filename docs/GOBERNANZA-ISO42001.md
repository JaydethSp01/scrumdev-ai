# Gobernanza de IA — Alineación con ISO/IEC 42001:2023

> Mapeo honesto: qué principios del estándar ya están **implementados en el
> producto** (con evidencia en código) y qué requeriría una certificación formal.
> ScrumDev AI no está certificado (la certificación es organizacional), pero su
> diseño **encarna los pilares** de la norma.

## Pilar 1 — Supervisión humana (responsabilidad corporativa)

*La norma exige supervisión humana sobre los sistemas de IA y roles definidos.*

| Control | Evidencia |
|---|---|
| **6 gates humanos bloqueantes**: la IA no avanza fase sin aprobación explícita del humano | `project_pipeline.py` (gates 1-6), `approve_current_gate` |
| Regla dura: **"sin aprobación explícita NO se despliega a producción"** | gate #6 `PRODUCTION_DEPLOYMENT` |
| Roles definidos: agentes **sugieren/ejecutan, solo el humano decide** | doc maestro del taller + implementación |
| Los agentes no pueden aprobar gates | sin ruta de auto-aprobación en el código |
| Registro de QUIÉN decidió, QUÉ y CUÁNDO | tabla `human_decisions` (`decided_by`, `decision_type`, `status`, `decided_at`, `decision_reason`) |

## Pilar 2 — Transparencia y explicabilidad

*La norma obliga a documentar cómo se toman las decisiones.*

| Control | Evidencia |
|---|---|
| **ADRs** (Architecture Decision Records): cada decisión técnica documentada con contexto/decisión/consecuencias, revisable y **descargable** por el humano | `architecture_decisions` + gate de arquitectura |
| Botón **"Explícame"**: el sistema explica en lenguaje claro qué se va a aprobar y qué implica | chat conversacional |
| **Trazabilidad de extremo a extremo**: requerimiento → historia → tarea técnica → código → test → review | `/refinement` (requirement_excerpt), evidencia en gates |
| Narración en tiempo real de qué hace cada agente y por qué tarda | burbuja de progreso + paneles Flujos/Agentes |
| Artefactos exportables para revisión externa | backlog .md/.csv, ADRs .md |

## Pilar 3 — Gestión de riesgos de IA (técnicos y de proceso)

*Evaluar y tratar riesgos a lo largo del ciclo de vida.*

| Control | Evidencia |
|---|---|
| **Security Agent**: riesgos OWASP Top 10 por historia | `agents/security_agent.py` |
| **Políticas codificadas** evaluadas automáticamente | `policy_service/app/policies/`: `security-policy.yaml`, `architecture-policy.yaml`, `quality-gates.yaml`, `twelve-factor-policy.yaml` |
| **Planner/validador pre-código**: consistencia, conflictos, alcance ANTES de generar | `_planner_validation` (bloquea con bloqueantes) |
| **DoR/DoD**: sin criterios claros no se genera; sin calidad no se cierra | `_story_dor`, `_dod_checklist` |
| Revisión automática post-generación (lint/arquitectura/criterios/seguridad) + build gate que verifica que el software CORRE | `build_gate.py`, `auto_review` |
| Riesgos detectados **vuelven al backlog** (tratamiento, no solo detección) | feedback loop (`_add_feedback_story`) |
| Secretos fuera del código, debug off en prod, tokens por env vars | hardening Taller 6 |

## Pilar 4 — Cumplimiento y mejora continua

| Control | Evidencia |
|---|---|
| **Bitácora de auditoría** de eventos del sistema | tabla `audit_events` + `audit_service` |
| Eventos de dominio con correlación (trazabilidad regulatoria) | `DomainEvent` (correlation_id, source_service, occurred_at) |
| CI/CD con pruebas automáticas antes de publicar | `.github/workflows/ci.yml`, `cd-*.yml` |
| Ciclo de mejora: errores → backlog → nueva iteración (PDCA de facto) | feedback loop + loop por sprint |

## Lo que requeriría una certificación formal (brecha honesta)

La ISO/IEC 42001 certifica un **Sistema de Gestión** (organización), no solo un
producto. Para certificar faltaría, a nivel organizacional:

1. **Política de IA formal** firmada por la dirección + manual del SGIA.
2. **Registro de riesgos de IA** formal según ISO/IEC 23894 (incluyendo sesgos
   del LLM, privacidad de datos del cliente, dependencia del proveedor del modelo).
3. **Evaluaciones de impacto** documentadas por caso de uso.
4. **Gestión de incidentes de IA** con proceso definido y simulacros.
5. **Auditorías internas** periódicas y revisión por la dirección.
6. Evaluación de **proveedores de modelos** (Anthropic/OpenAI) como terceros.

**Conclusión:** el producto implementa de forma nativa los principios operativos
de la 42001 — supervisión humana real, explicabilidad, gestión de riesgos en el
ciclo de vida y trazabilidad auditable. La brecha es documental/organizacional,
no de diseño: la arquitectura ya está preparada para un SGIA certificable.

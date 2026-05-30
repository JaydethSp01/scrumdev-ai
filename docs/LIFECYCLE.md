# Ciclo de vida del software del cliente

ScrumDev AI no solo **crea** software: acompaña su evolución y mantenimiento.

## Jerarquía

```
Proyecto
  └── Versión (v1, v2, …)          # v1 = lo que el cliente pidió primero
        └── Sprint (1, 2, …)        # el PO planifica y decide el orden
              └── Tarea (BacklogItem)  # historia, feature o bugfix
```

- Una **versión acumula código**: los sprints suman al mismo codebase (merge por `file_path`, no se borra entre sprints).
- Una **versión nueva parte del código de la anterior** (copy-forward de `CodeArtifact`) y le agrega los cambios grandes. El cliente evoluciona sin perder lo construido.
- El **deploy** publica el código de la **versión activa** (front Vercel + back Render + Neon, build gate local antes de la nube).

## El chat de ciclo de vida

El cliente conversa (varios chats por proyecto, cada uno con su historial — `ChatSession`). El asistente clasifica la intención y **el PO decide**:

| Lo que pide el cliente | Acción | Resultado |
|---|---|---|
| Feature chica/mediana | `add_feature` scope=task | Tarea (origin=feature_request) en la versión activa |
| Cambio grande (rediseño, módulo nuevo grande) | `new_version` / scope=version | Versión nueva (copy-forward) con tarea inicial |
| Bug / "se ve mal en móvil" + captura | `report_bug` + imagen | Vision analiza la captura → patch quirúrgico sobre la versión afectada (`fix_bug`) → re-deploy |

**Flujo típico post-entrega:** termino mi v1 según sprints → mañana pido por chat "agregar export a Excel" (tarea) o "rehacer multi-tenant" (v2) → o reporto un bug con captura y se arregla solo. Todo sobre el mismo proyecto, manteniendo lo ya construido.

## Endpoints

- `GET/POST /projects/{k}/versions`, `POST /projects/{k}/versions/{id}/status`
- `GET/POST /projects/{k}/chats`, `GET /projects/{k}/chats/{id}/messages`
- `POST /projects/{k}/assistant` (chat con `session_id`, dispara acciones de ciclo de vida)
- `POST /projects/{k}/fix-bug` (vision + patch sobre una versión)

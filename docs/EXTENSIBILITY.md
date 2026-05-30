# Extensibilidad (validación §24 de la guía)

La guía exige que el sistema sea extensible sin tocar el núcleo. Estado real:

| Criterio guía | Cómo se cumple | Punto de extensión |
|---|---|---|
| Cambiar GitHub por GitLab | El Orchestrator solo llama `git_connector_service_url` con contratos REST. Un `GitLabConnector` que exponga `/publish`, `/vcs/*` reemplaza al de GitHub sin tocar el core. | `services/git_connector_service` (adaptador) |
| Cambiar Jira por Azure DevOps | Igual: el orquestador usa contratos del Jira Connector. | `services/jira_connector_service` |
| Agregar un agente nuevo (ej. Performance) | Registrar el agente en el runtime; el LLM factory resuelve proveedores. | `agent_runtime/runtime/llm_factory.py` (`register_provider`) |
| Agregar una política nueva | Añadir un `.yaml` + evaluador en el registry del policy service. | `services/policy_service/app/policies/` + `POLICY_EVALUATORS` |
| Agregar proveedor de deploy | Nuevo adaptador en el deploy connector; el frontend no cambia. | `services/deploy_connector_service` (Vercel/Render/Neon ya conviven) |
| Agregar un stack de generación | Nuevo `StackBlueprint` en el registry; el Stack Expert lo elige por clasificación. | `shared/stacks/stack_blueprints.py` |

**Principio:** el núcleo (Orchestrator) no contiene código específico de proveedor — solo contratos. Adaptadores y blueprints son los puntos de extensión.

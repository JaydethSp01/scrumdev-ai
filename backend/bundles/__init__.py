"""Bundles - empaquetan los 14 microservicios en 4 deployables.

Estrategia: sub-app mount de FastAPI. Cada bundle monta los servicios
existentes intactos bajo un prefijo. Los servicios individuales siguen
existiendo (fallback). Esto reduce 14 procesos a 4 sin reescritura.

Agrupacion (respeta guia Delfin §4.1):
- gateway      : api_gateway (unico punto de entrada)
- core         : auth, user, conversation, notification, audit, memory, policy, ml
- brain        : orchestrator, agent_runtime (escalan distinto - LLM pesado)
- connectors   : jira, git, deploy (intercambiables)
"""

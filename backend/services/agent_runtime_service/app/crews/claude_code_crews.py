"""Equivalentes de los crews CrewAI implementados con Claude Code SDK.

Cada "crew" aqui es una secuencia de llamadas a Claude Code con system prompts
especializados por rol. Los outputs se concatenan/pasan como contexto al
siguiente rol cuando aplica (delivery).

Antes de invocar el primer agente, se pide al ml-service un analisis
(clasificacion + esfuerzo + riesgos) que se inyecta como contexto adicional.
"""
from __future__ import annotations

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from services.agent_runtime_service.app.runtime.ml_enricher import (  # noqa: F401 - mantenemos opcional
    format_ml_context,
    get_ml_metadata,
)

PO_SYSTEM = (
    "Eres un Product Owner senior con 10 anos refinando backlog Scrum en empresas "
    "tech. Aplicas INVEST y formato Given/When/Then. Eres directo y conciso. "
    "Respondes SIEMPRE en markdown bien formateado, sin preambulos ni saludos."
)

ARCHITECT_SYSTEM = (
    "Eres un arquitecto de software cloud-native experto en microservicios, "
    "event-driven y 12-factor. Privilegias soluciones simples y desacopladas. "
    "Respondes SIEMPRE en markdown bien formateado, sin preambulos ni saludos."
)

DEVELOPER_SYSTEM = (
    "Eres un developer senior fullstack con foco en backend Python/FastAPI y "
    "buenas practicas SOLID. Escribes codigo legible primero, optimizas despues. "
    "Respondes SIEMPRE en markdown bien formateado, sin preambulos ni saludos."
)

QA_SYSTEM = (
    "Eres un QA senior con experiencia en testing automatizado, BDD y shift-left. "
    "Priorizas cobertura significativa sobre cobertura por metricas. "
    "Respondes SIEMPRE en markdown bien formateado, sin preambulos ni saludos."
)

SECURITY_SYSTEM = (
    "Eres un DevSecOps con foco practico: senalas riesgos accionables, no listas "
    "exhaustivas. Privilegias defense-in-depth pragmatico. "
    "Respondes SIEMPRE en markdown bien formateado, sin preambulos ni saludos."
)


async def run_refinement(story: str) -> str:
    ml_meta = await get_ml_metadata(story)
    ml_ctx = format_ml_context(ml_meta)
    prompt = (
        "Refina la siguiente historia de usuario:\n\n"
        f"```\n{story}\n```\n"
        f"{ml_ctx}\n"
        "Entrega en markdown con estas secciones:\n"
        "1. Historia reescrita en formato 'Como <rol> quiero <accion> para <beneficio>'.\n"
        "2. Criterios de aceptacion en Given/When/Then (3 a 5 escenarios).\n"
        "3. Definicion de hecho (DoD) sugerida.\n"
        "4. Riesgos y dependencias.\n"
        "5. Estimacion en story points (Fibonacci) con justificacion breve."
    )
    return await run_claude_code(prompt, system_prompt=PO_SYSTEM)


async def run_architecture(requirements: str) -> str:
    ml_meta = await get_ml_metadata(requirements)
    ml_ctx = format_ml_context(ml_meta)
    prompt = (
        "Disena una arquitectura concisa para los siguientes requerimientos:\n\n"
        f"```\n{requirements}\n```\n"
        f"{ml_ctx}\n"
        "Entrega en markdown con:\n"
        "1. Componentes principales y sus responsabilidades.\n"
        "2. Tecnologias propuestas con justificacion breve.\n"
        "3. Diagrama tipo ASCII de bloques.\n"
        "4. Contratos clave (endpoints, eventos, esquemas).\n"
        "5. Riesgos arquitectonicos y mitigaciones."
    )
    return await run_claude_code(prompt, system_prompt=ARCHITECT_SYSTEM)


async def run_delivery(story: str) -> str:
    """Pipeline completo: ML -> PO -> Architect -> Developer -> QA -> Security."""
    ml_meta = await get_ml_metadata(story)
    ml_ctx = format_ml_context(ml_meta)

    refined = await run_claude_code(
        (
            f"Refina la historia de usuario:\n\n```\n{story}\n```\n{ml_ctx}\n"
            "Entrega: historia reescrita, criterios de aceptacion (3-5 G/W/T), DoD. "
            "Markdown conciso."
        ),
        system_prompt=PO_SYSTEM,
    )

    architecture = await run_claude_code(
        (
            "Disena la arquitectura para implementar esta historia ya refinada:\n\n"
            f"{refined}\n\n"
            "Entrega componentes, tecnologias, diagrama ASCII, contratos y riesgos."
        ),
        system_prompt=ARCHITECT_SYSTEM,
    )

    dev_plan = await run_claude_code(
        (
            "Eres developer. A continuacion la historia refinada y la arquitectura:\n\n"
            f"### Historia refinada\n{refined}\n\n"
            f"### Arquitectura\n{architecture}\n\n"
            "Genera (markdown):\n"
            "1. Plan de implementacion paso a paso (5-10 pasos).\n"
            "2. Esqueleto de codigo del componente principal (maximo 80 lineas), "
            "en el lenguaje que sugiera la arquitectura."
        ),
        system_prompt=DEVELOPER_SYSTEM,
    )

    qa_plan = await run_claude_code(
        (
            "Como QA, define el plan de pruebas para esta historia/arquitectura:\n\n"
            f"### Historia\n{refined}\n\n### Arquitectura\n{architecture}\n\n"
            "Entrega una tabla markdown con casos felices, edge cases y errores, "
            "mapeados a los criterios de aceptacion."
        ),
        system_prompt=QA_SYSTEM,
    )

    sec_review = await run_claude_code(
        (
            "Revisa la siguiente entrega y enumera riesgos de seguridad relevantes "
            "(OWASP Top 10 aplicable) y controles minimos a implementar:\n\n"
            f"### Historia\n{refined}\n\n### Arquitectura\n{architecture}\n\n"
            f"### Plan Dev\n{dev_plan}"
        ),
        system_prompt=SECURITY_SYSTEM,
    )

    header = (
        "## 0. Analisis ML\n\n"
        + (ml_ctx.strip() or "_(ml-service no disponible)_")
        + "\n\n---\n\n"
    )
    return (
        header
        + "## 1. Product Owner - Refinamiento\n\n"
        + f"{refined}\n\n---\n\n"
        + "## 2. Architect - Arquitectura\n\n"
        + f"{architecture}\n\n---\n\n"
        + "## 3. Developer - Plan e implementacion\n\n"
        + f"{dev_plan}\n\n---\n\n"
        + "## 4. QA - Plan de pruebas\n\n"
        + f"{qa_plan}\n\n---\n\n"
        + "## 5. Security - Riesgos y controles\n\n"
        + f"{sec_review}\n"
    )

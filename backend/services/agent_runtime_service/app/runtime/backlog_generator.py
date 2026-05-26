"""PO Agent descompone una vision de producto en un backlog Scrum real (JSON).

Usa Claude Code SDK con instrucciones estrictas para devolver JSON parseable.
"""
from __future__ import annotations

import json
import re
from typing import Any

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger
from shared.personalization import build_style_prefix, remember

logger = get_logger(__name__)


PO_BACKLOG_SYSTEM = (
    "Eres un Product Owner senior. Recibes una vision de producto y la descompones "
    "en un backlog Scrum priorizado. Devuelves SIEMPRE un JSON puro valido sin "
    "preambulo ni texto extra, sin markdown, sin code fences."
)


def _extract_json(raw: str) -> Any:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}|\[.*\]", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


async def generate_backlog(
    project_key: str,
    vision: str,
    target_users: str | None = None,
    stack_preference: str | None = None,
    max_stories: int = 12,
) -> list[dict]:
    extras: list[str] = []
    if target_users:
        extras.append(f"Usuarios objetivo: {target_users}")
    if stack_preference:
        extras.append(f"Stack preferido: {stack_preference}")
    extras_block = "\n".join(extras)

    style_prefix = await build_style_prefix(project_key, vision, top_k=5)

    prompt = (
        f"{style_prefix}"
        f"Proyecto: {project_key}\n"
        f"Vision de producto:\n{vision}\n\n"
        f"{extras_block}\n\n"
        f"Genera entre 6 y {max_stories} historias de usuario Scrum priorizadas "
        "para construir el MVP de este producto. "
        "Cada historia debe ser INVEST: independiente, negociable, valiosa, estimable, "
        "pequena, testeable.\n\n"
        "Devuelve un JSON con esta estructura exacta (sin texto extra):\n"
        "{\n"
        '  "stories": [\n'
        "    {\n"
        '      "story_key": "S-001",\n'
        '      "title": "string corto (max 80 chars)",\n'
        '      "description": "Como <rol> quiero <accion> para <beneficio>",\n'
        '      "acceptance_criteria": ["Given X When Y Then Z", "..."],\n'
        '      "story_points": 1|2|3|5|8|13,\n'
        '      "priority": "high"|"medium"|"low"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Las primeras historias deben ser la base (auth, modelo de datos, UI shell). "
        "Despues funcionalidades clave. No incluyas tareas tecnicas internas sin valor de usuario."
    )

    raw = await run_claude_code(prompt, system_prompt=PO_BACKLOG_SYSTEM)
    data = _extract_json(raw)
    stories = data.get("stories") if isinstance(data, dict) else data
    if not isinstance(stories, list):
        raise ValueError("backlog parse failed: stories not a list")

    for i, s in enumerate(stories):
        s.setdefault("story_key", f"S-{i+1:03d}")
        s.setdefault("story_points", 3)
        s.setdefault("priority", "medium")
        s.setdefault("acceptance_criteria", [])
        s["order_index"] = i

    logger.info("backlog_generated", project=project_key, count=len(stories))

    # Persistir vision + cada historia en la memoria del cliente para personalizar futuras generaciones.
    await remember(project_key, f"VISION: {vision}", kind="vision")
    for s in stories[:10]:
        await remember(
            project_key,
            f"HISTORIA {s.get('story_key')}: {s.get('title')}\n{s.get('description','')}",
            kind="story",
        )
    return stories

"""PO Agent - planificador de sprints. FASE B.

Agrupa las historias del backlog en sprints sugeridos (con goal y orden),
respetando dependencias logicas y capacity. El PO HUMANO luego ajusta:
reordena sprints, mueve historias, decide cual ejecutar primero.
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.openai_client import chat_fast, is_enabled
from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)

_PLANNER_SYSTEM = (
    "Eres un Product Owner senior experto en Scrum. Agrupas historias en "
    "sprints coherentes: cada sprint entrega valor incremental usable. "
    "Sprint 1 = fundaciones (auth, modelos base). Sprints siguientes = features "
    "que dependen de las anteriores. Respondes SOLO JSON valido sin markdown."
)


def _extract_json(raw: str):
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}|\[.*\]", cleaned, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


async def plan_sprints(
    project_key: str,
    vision: str,
    backlog: list[dict],
    sprint_capacity: int = 13,
) -> list[dict]:
    """Devuelve lista de sprints sugeridos:
    [{number, name, goal, story_keys: [...], total_points}].

    El PO humano puede reordenar/ajustar despues.
    """
    if not backlog:
        return []

    stories_block = "\n".join(
        f"- {b.get('story_key','S?')} [{b.get('story_points', 3)}pts, {b.get('priority','medium')}]: "
        f"{b.get('title','')}"
        for b in backlog
    )

    prompt = (
        f"Proyecto: {project_key}\n"
        f"Vision: {vision[:300]}\n\n"
        f"Historias del backlog:\n{stories_block}\n\n"
        f"Capacity por sprint: ~{sprint_capacity} story points.\n\n"
        "Agrupa estas historias en 2-4 sprints incrementales. Reglas:\n"
        "- Sprint 1: fundaciones (auth, modelos/entidades base, setup).\n"
        "- Cada sprint entrega algo USABLE end-to-end.\n"
        "- Respeta dependencias: no pongas 'reportes' antes que 'datos base'.\n"
        "- No excedas mucho el capacity por sprint.\n\n"
        "Devuelve JSON EXACTO:\n"
        "{\n"
        '  "sprints": [\n'
        '    {"number": 1, "name": "Fundaciones", "goal": "objetivo claro 1 frase", '
        '"story_keys": ["S-001","S-002"]},\n'
        "    ...\n"
        "  ]\n"
        "}\n"
    )

    raw = ""
    try:
        if is_enabled():
            raw = await chat_fast(prompt, system=_PLANNER_SYSTEM, max_tokens=900, temperature=0.3)
        else:
            raw = await run_claude_code(prompt, system_prompt=_PLANNER_SYSTEM, max_turns=1)
        data = _extract_json(raw)
        sprints_raw = data.get("sprints", []) if isinstance(data, dict) else data
    except Exception as exc:
        logger.warning("sprint_plan_failed_fallback", error=str(exc))
        # Fallback: 1 sprint con todas las historias por prioridad
        sprints_raw = [
            {
                "number": 1,
                "name": "Sprint 1 - MVP",
                "goal": "Construir el MVP completo del producto",
                "story_keys": [b.get("story_key") for b in backlog],
            }
        ]

    # Calcular puntos por sprint
    points_by_key = {b.get("story_key"): b.get("story_points", 3) for b in backlog}
    result: list[dict] = []
    for i, s in enumerate(sprints_raw, 1):
        keys = s.get("story_keys", []) or []
        total = sum(points_by_key.get(k, 3) for k in keys)
        result.append(
            {
                "number": s.get("number", i),
                "name": s.get("name", f"Sprint {i}"),
                "goal": s.get("goal", ""),
                "story_keys": keys,
                "total_points": total,
                "order_index": i - 1,
            }
        )
    return result

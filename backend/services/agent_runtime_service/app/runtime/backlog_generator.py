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

_FIB = [1, 2, 3, 5, 8, 13, 21]


async def _reconcile_points_with_ml(stories: list[dict], project_key: str) -> None:
    """Apoyo del ML al PO Agent: la red de esfuerzo estima puntos y se concilian
    con los de la IA (promedio redondeado a Fibonacci). Best-effort: si el ML no
    está, se conservan los puntos de la IA. Deja trazas: story_points_ml y
    story_points_ai para transparencia."""
    if not stories:
        return
    from shared.config.settings import settings
    texts = [f"{s.get('title','')}. {s.get('description','')}" for s in stories]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{settings.ml_service_url}/ml/estimate-effort/batch",
                json={"texts": texts},
            )
            if r.status_code != 200:
                return
            estimates = r.json().get("estimates", [])
    except Exception as exc:  # noqa: BLE001 -> nunca romper el backlog
        logger.warning("ml_effort_unavailable", error=str(exc))
        return

    adjusted = 0
    for s, est in zip(stories, estimates):
        ml_pts = est.get("story_points")
        if not isinstance(ml_pts, int):
            continue
        ai_pts = s.get("story_points", 3)
        s["story_points_ai"] = ai_pts
        s["story_points_ml"] = ml_pts
        if est.get("engine") == "neural_net":
            # ambos informan: promedio -> Fibonacci más cercano
            blended = (ai_pts + ml_pts) / 2.0
            s["story_points"] = min(_FIB, key=lambda x: abs(x - blended))
            if s["story_points"] != ai_pts:
                adjusted += 1
    logger.info("ml_effort_reconciled", project=project_key,
                stories=len(stories), adjusted=adjusted)


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

    # APOYO DEL ML (no reemplazo): la red de esfuerzo estima puntos por historia
    # y se concilian con los del PO Agent (IA). Ambos informan el valor final ->
    # estimaciones consistentes basadas en datos, no a ojo.
    await _reconcile_points_with_ml(stories, project_key)

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

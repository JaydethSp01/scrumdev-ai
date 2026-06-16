"""Dev Agent genera CODIGO REAL (no solo planes) por historia.

Devuelve un JSON con archivos: [{path, language, content}, ...].
"""
from __future__ import annotations

import json
import re
from typing import Any

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger
from shared.personalization import build_style_prefix, remember

logger = get_logger(__name__)


DEV_SYSTEM = (
    "Eres un developer senior fullstack. Tu trabajo es generar CODIGO REAL Y EJECUTABLE "
    "para implementar una historia de usuario. Devuelves SIEMPRE JSON puro valido sin "
    "markdown, sin fences, sin preambulo. "
    "REGLAS DE STACK CRITICAS: "
    "- Si el stack es Next.js: usa SOLO `next/navigation` y `next/link` para routing. "
    "NUNCA importes `react-router-dom`, `react-router`, ni `react-helmet`. "
    "Para SEO usa `metadata` export en cada page.tsx. "
    "- Si el stack es FastAPI: usa SOLO la API estandar de FastAPI, no Flask ni Django. "
    "- Para frontend, los archivos deben ir bajo `frontend/app/` (Next.js app router). "
    "- Para backend Python, bajo `backend/app/`. "
    "- Cada archivo TS/JS solo importa de paquetes que existan en npm con su nombre exacto. "
    "- No mezcles paradigmas (no Next.js + Vite, no SPA + SSR)."
)


def _normalize_escaped_content(files: list) -> None:
    """Repara archivos cuyo `content` quedó con escapes LITERALES (`\\n`, `\\t`,
    `\\"`) por doble-escape del LLM: todo el archivo en una sola línea física con
    `\\n` literal. Conservador: solo si casi no hay saltos reales pero sí muchos
    `\\n` literales (no toca código legítimo que use `\\n` dentro de strings)."""
    for f in files:
        if not isinstance(f, dict):
            continue
        c = f.get("content")
        if not isinstance(c, str) or "\\n" not in c:
            continue
        real_nl = c.count("\n")
        lit_nl = c.count("\\n")
        if lit_nl < 2 or real_nl > lit_nl:
            continue
        f["content"] = (
            c.replace("\\r\\n", "\n")
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace('\\"', '"')
            .replace("\\'", "'")
        )


def _extract_json(raw: str) -> Any:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


async def generate_code_for_story(
    project_key: str,
    story_title: str,
    story_description: str,
    acceptance_criteria: list[str],
    architecture_context: str | None = None,
    stack: str | None = "FastAPI + React",
    max_files: int = 5,
) -> dict:
    ac_block = "\n".join(f"- {ac}" for ac in (acceptance_criteria or []))
    arch_block = (
        f"\n\n### Arquitectura del proyecto:\n{architecture_context}\n"
        if architecture_context
        else ""
    )

    style_prefix = await build_style_prefix(
        project_key, f"{story_title} {story_description}", top_k=5
    )

    prompt = (
        f"{style_prefix}"
        f"Proyecto: {project_key}\n"
        f"Stack: {stack}\n"
        f"Historia: {story_title}\n"
        f"Descripcion: {story_description}\n\n"
        f"### Criterios de aceptacion:\n{ac_block}\n"
        f"{arch_block}\n"
        f"Genera entre 1 y {max_files} archivos de codigo REAL Y EJECUTABLE "
        "para implementar esta historia. "
        "Cada archivo debe ser autocontenido y compilable. "
        "Si la historia es de backend, incluye endpoint + modelo + test. "
        "Si es frontend, componente + test. "
        "Si requiere migracion, agregala. "
        "Maximo 200 lineas por archivo. NO uses placeholders tipo TODO.\n\n"
        "Devuelve este JSON exacto (sin texto extra):\n"
        "{\n"
        '  "summary": "1-2 lineas describiendo el cambio",\n'
        '  "files": [\n'
        "    {\n"
        '      "path": "relative/path/file.py",\n'
        '      "language": "python|typescript|javascript|sql|yaml|json|markdown|bash",\n'
        '      "content": "<codigo real; usa saltos de linea normales del JSON, NO dobles-escapes>"\n'
        "    }\n"
        "  ],\n"
        '  "follow_up": "Notas para QA o siguientes pasos"\n'
        "}"
    )

    raw = await run_claude_code(prompt, system_prompt=DEV_SYSTEM)
    data = _extract_json(raw)
    if not isinstance(data, dict) or "files" not in data:
        raise ValueError("code generation parse failed")
    files = data.get("files", [])
    if not isinstance(files, list):
        raise ValueError("files must be a list")
    _normalize_escaped_content(files)
    logger.info(
        "code_generated", project=project_key, story=story_title, files=len(files)
    )

    # Persistir resumen del codigo generado en la memoria del cliente para que
    # las futuras generaciones mantengan el mismo estilo y convenciones.
    summary = data.get("summary", "")
    paths = ", ".join(f.get("path", "?") for f in files[:5])
    await remember(
        project_key,
        f"CODIGO {story_title}: {summary} | archivos: {paths}",
        kind="code",
    )
    return data

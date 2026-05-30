"""Bug fixer del ciclo de vida.

El cliente reporta un problema de una version ya entregada (ej. "se ve mal en
el telefono") y adjunta capturas. Este agente:
  1. Analiza las capturas (vision) + la descripcion del bug.
  2. Mira el codigo REAL de la version afectada (los archivos relevantes).
  3. Devuelve SOLO los archivos modificados con el fix aplicado.

No regenera el proyecto: hace un PATCH quirurgico sobre los archivos existentes,
para que sea mantenible y no rompa lo demas.
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)

BUG_FIXER_SYSTEM = (
    "Eres un ingeniero senior de mantenimiento. Recibes un bug reportado por el "
    "cliente sobre software YA desplegado, posiblemente con capturas de pantalla. "
    "Tu trabajo es un FIX QUIRURGICO: modificar SOLO los archivos necesarios para "
    "resolver el problema, sin reescribir el proyecto ni romper lo existente. "
    "Si hay capturas, USA tu tool Read para verlas y entender el problema visual "
    "(ej. responsive roto en movil, overflow, contraste, layout). "
    "Devuelves SIEMPRE JSON puro valido (sin markdown), con SOLO los archivos que "
    "cambiaste, completos y ejecutables."
)


def _extract_json(raw: str):
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


def _select_relevant_files(files: list[dict], max_files: int = 14) -> list[dict]:
    """Prioriza archivos de UI (frontend) para bugs visuales; limita el contexto."""
    def score(f: dict) -> int:
        p = (f.get("path") or "")
        s = 0
        if p.startswith("frontend/"):
            s += 2
        if p.endswith((".tsx", ".jsx", ".css")):
            s += 2
        if "globals.css" in p or "layout" in p or "tailwind" in p:
            s += 1
        if "page.tsx" in p or "components/" in p:
            s += 1
        return s
    ranked = sorted(files, key=score, reverse=True)
    return ranked[:max_files]


async def fix_bug(
    project_key: str,
    files: list[dict],
    bug_description: str,
    image_paths: list[str] | None = None,
) -> dict:
    """Devuelve {files: [archivos modificados], summary, analyzed_images}."""
    relevant = _select_relevant_files(files)
    files_block = "\n\n".join(
        f"--- {f['path']} ---\n{(f.get('content') or '')[:4000]}"
        for f in relevant
    )
    image_block = ""
    if image_paths:
        image_block = (
            "\n### Capturas del problema (USA Read para verlas):\n"
            + "\n".join(f"- {p}" for p in image_paths) + "\n"
        )
    prompt = (
        f"Proyecto: {project_key}\n"
        f"### Bug reportado por el cliente:\n{bug_description}\n"
        f"{image_block}\n"
        f"### Codigo actual (archivos relevantes):\n{files_block}\n\n"
        "Analiza el problema (si hay capturas, mirales con Read), identifica la "
        "causa y aplica el fix MINIMO. Devuelve JSON EXACTO:\n"
        "{\n"
        '  "summary": "que estaba mal y como lo arreglaste (1-2 frases)",\n'
        '  "files": [{"path": "frontend/...", "content": "archivo COMPLETO corregido"}]\n'
        "}\n"
        "Incluye en files SOLO los archivos que modificaste."
    )
    raw = await run_claude_code(
        prompt, system_prompt=BUG_FIXER_SYSTEM,
        max_turns=4 if image_paths else 1,
        image_paths=image_paths or None,
    )
    data = _extract_json(raw)
    fixed = data.get("files", []) if isinstance(data, dict) else []
    logger.info("bug_fixed", project=project_key, files_changed=len(fixed),
                images=len(image_paths or []))
    return {
        "summary": data.get("summary", "") if isinstance(data, dict) else "",
        "files": fixed,
        "analyzed_images": len(image_paths or []),
    }

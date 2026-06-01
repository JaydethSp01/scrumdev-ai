"""Generación ADITIVA de features para versiones incrementales.

Cuando una versión nueva (v2+) agrega un módulo a un sistema YA construido, NO
regeneramos todo (eso pierde/ignora la feature y arriesga lo existente). En vez
de eso:

  1. Le damos al agente el ÁRBOL de archivos actual (paths) + los archivos clave
     que tendrá que tocar para enlazar (Sidebar, rutas, lib/api, backend main/db).
  2. El agente genera SOLO:
     - los archivos NUEVOS del módulo (pages, components, router backend, modelo)
     - las versiones MODIFICADAS de los pocos archivos de enlace (sidebar + nav)
  3. Hacemos merge: el código base queda intacto, se agregan los nuevos y se
     actualizan los de enlace.

Esto es coherente, mantenible y no rompe lo que ya funciona.
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)

FEATURE_SYSTEM = (
    "Eres un ingeniero senior que AGREGA un módulo a un sistema EXISTENTE sin "
    "romperlo. Recibes el árbol de archivos actual y los archivos de enlace "
    "(Sidebar, navegación, lib/api del frontend; main.py/routers del backend). "
    "Generas SOLO: (a) los archivos NUEVOS del módulo pedido, (b) las versiones "
    "ACTUALIZADAS de los pocos archivos de enlace necesarios para que el módulo "
    "sea accesible (link en el sidebar, ruta, registro del router). NO regeneras "
    "el resto del sistema. Respetas la convención de carpetas existente "
    "(frontend/ + backend/). Devuelves SIEMPRE JSON puro válido, archivos COMPLETOS."
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


# archivos de enlace típicos que el módulo nuevo necesita tocar
_LINK_HINTS = (
    "Sidebar", "Navbar", "layout", "lib/api", "lib/mock",
    "main.py", "routers/__init__", "app/__init__",
)


def _select_link_files(files: list[dict], max_chars: int = 3500) -> list[dict]:
    out = []
    for f in files:
        p = (f.get("path") or "")
        if any(h in p for h in _LINK_HINTS):
            out.append({"path": p, "content": (f.get("content") or "")[:max_chars]})
    return out


async def generate_feature(
    project_key: str,
    feature_title: str,
    feature_description: str,
    existing_files: list[dict],
    stack_id: str,
) -> dict:
    """Devuelve {files: [...]} con SOLO archivos nuevos/modificados del módulo."""
    paths = sorted((f.get("path") or "") for f in existing_files)
    tree = "\n".join(paths)
    link_files = _select_link_files(existing_files)
    link_block = "\n\n".join(
        f"--- {f['path']} (archivo de enlace, actualízalo si hace falta) ---\n{f['content']}"
        for f in link_files
    )
    prompt = (
        f"Proyecto: {project_key} (stack {stack_id})\n\n"
        f"### Sistema EXISTENTE — árbol de archivos (NO los regeneres):\n{tree}\n\n"
        f"### Archivos de enlace actuales:\n{link_block}\n\n"
        f"### MÓDULO NUEVO A AGREGAR:\n{feature_title}\n{feature_description}\n\n"
        "Genera SOLO lo necesario para agregar este módulo al sistema existente:\n"
        "- frontend: page(s) del módulo en frontend/app/<modulo>/page.tsx + componentes propios.\n"
        "- backend: router en backend/app/routers/<modulo>.py (con `router = APIRouter()` "
        "y prefix) + modelo en backend/app/models.py SOLO si hay que extenderlo (devuélvelo completo).\n"
        "- ENLACE: devuelve la versión ACTUALIZADA del Sidebar (agrega el link al módulo) "
        "y de lib/api.ts si necesita endpoints nuevos.\n"
        "NO incluyas archivos que no cambian. Formato JSON EXACTO:\n"
        "{\n"
        '  "summary": "qué módulo agregaste y cómo se enlaza",\n'
        '  "files": [{"path": "frontend/app/facturas/page.tsx", "content": "..."}]\n'
        "}\n"
    )
    raw = await run_claude_code(prompt, system_prompt=FEATURE_SYSTEM, max_turns=1, kind="ui")
    data = _extract_json(raw)
    files = data.get("files", []) if isinstance(data, dict) else []
    logger.info("feature_generated", project=project_key, feature=feature_title,
                files=len(files))
    return {"summary": data.get("summary", "") if isinstance(data, dict) else "", "files": files}

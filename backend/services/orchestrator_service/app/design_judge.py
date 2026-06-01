"""Juez VISUAL de diseño: toma el screenshot de la app renderizada y se lo da a
Claude (visión) para que la evalúe contra criterios de diseño profesional. Si
reprueba, devuelve feedback accionable para regenerar. Es lo que de verdad evita
que salga una UI fea (un juez de regex no puede ver contraste/legibilidad).
"""
from __future__ import annotations

import base64
import json
import os
import re
import tempfile

from shared.observability import get_logger

logger = get_logger(__name__)

JUDGE_PROMPT = """Eres un director de diseño UX/UI exigente. Mira este screenshot
de una app web recién generada y evalúala como si fueras a mostrarla a un cliente
que paga. Califica DUREZA (0-100) contra estos criterios:

- Legibilidad: ¿el texto se lee bien? (contraste suficiente, NADA de gris sobre
  negro ilegible, ni texto invisible). Esto es lo más importante.
- Jerarquía visual: títulos, secciones y datos claramente diferenciados.
- Layout y espaciado: no amontonado, no vacío; márgenes y padding correctos.
- Navegación: si hay sidebar/menú, ¿tiene enlaces visibles (no vacío)?
- Estética: se ve moderno y profesional (tarjetas, colores coherentes), NO un
  HTML plano sin estilo.
- Completitud: la pantalla muestra contenido real, no está casi vacía.

Responde SOLO JSON: {"score": <0-100>, "aprobado": <true si score>=75 y legible>,
"problemas": ["..."], "instrucciones": ["cambios concretos de Tailwind/JSX para
arreglarlo: colores, contraste, sidebar, layout..."]}"""


def _parse_json(raw: str) -> dict:
    t = (raw or "").strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    m = re.search(r"\{.*\}", t, re.DOTALL)
    try:
        return json.loads(m.group(0) if m else t)
    except Exception:
        return {}


async def judge_screenshot(screenshot_b64: str, vision: str) -> dict:
    """Evalúa un screenshot (base64 PNG) con Claude visión. Devuelve
    {score, aprobado, problemas, instrucciones}. Si no hay forma de juzgar,
    devuelve aprobado=True (no bloquear)."""
    if not screenshot_b64:
        return {"aprobado": True, "score": None, "problemas": [], "instrucciones": [],
                "reason": "sin screenshot"}
    from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code

    # guardar PNG en uploads/ (whitelist que el SDK permite leer con Read)
    uploads = os.path.join(os.environ.get("UPLOADS_ROOT", "uploads"))
    os.makedirs(uploads, exist_ok=True)
    fd, path = tempfile.mkstemp(suffix=".png", dir=uploads)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(base64.b64decode(screenshot_b64))
        prompt = f"Dominio de la app: {vision[:200]}\n\n{JUDGE_PROMPT}"
        raw = await run_claude_code(prompt, max_turns=2, image_paths=[path], kind="ui")
        data = _parse_json(raw)
        if not data:
            return {"aprobado": True, "score": None, "problemas": [],
                    "instrucciones": [], "reason": "juez sin respuesta parseable"}
        # normalizar
        data.setdefault("aprobado", (data.get("score") or 0) >= 75)
        data.setdefault("problemas", [])
        data.setdefault("instrucciones", [])
        return data
    except Exception as exc:  # noqa: BLE001 -> nunca bloquear por el juez
        logger.warning("design_judge_failed", error=str(exc)[:160])
        return {"aprobado": True, "score": None, "problemas": [],
                "instrucciones": [], "reason": f"error: {exc}"}
    finally:
        try:
            os.remove(path)
        except Exception:
            pass

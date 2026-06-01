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

JUDGE_PROMPT = """Eres un director de diseño UX/UI EXIGENTE de una agencia top. Mira
este screenshot de una app web recién generada y evalúala como si decidieras si
compite con Linear, Vercel o Stripe. No regales nota: un "está bien" NO basta, debe
verse PROFESIONAL y TERMINADO. Califica con DUREZA (0-100):

- Legibilidad (eliminatorio): el texto se lee bien, contraste AA, nada de gris sobre
  negro ni texto invisible. Si falla, score < 40.
- Identidad de color: ¿hay una PALETA DE MARCA coherente (un color primario con
  carácter)? Un diseño todo blanco/negro/gris sin ningún color parece un prototipo
  SIN TERMINAR -> penaliza FUERTE (no más de 65).
- Iconografía: ¿usa iconos vectoriales coherentes (lucide/SVG)? Si usa EMOJIS (✅⚠️📦)
  como iconos de UI/estado, se ve amateur -> penaliza.
- Jerarquía y layout: títulos/secciones/datos diferenciados; espaciado correcto; no
  amontonado ni con grandes huecos vacíos. Una app de datos debería tener navegación
  lateral (sidebar) o una barra superior rica, no un menú soso.
- Estética: tarjetas con sombra/bordes redondeados, badges de estado con color,
  tablas estilizadas. NO un HTML plano tipo documento.
- Completitud y coherencia: contenido real, datos que cuadran, sin "© 2023" desfasado
  ni placeholders.

Sé estricto: una pantalla legible pero PLANA y GENÉRICA (sin color de marca, con
emojis, look de plantilla sin terminar) NO aprueba -> score 55-70. Solo aprueba
(>=75) algo que enseñarías con orgullo a un cliente que paga.

Responde SOLO JSON: {"score": <0-100>, "aprobado": <true si score>=75>,
"problemas": ["lo que se ve mal, concreto"], "instrucciones": ["cambios concretos de
Tailwind/JSX: definir paleta de marca, reemplazar emojis por iconos lucide, sidebar,
badges de color, contraste, layout..."]}"""


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

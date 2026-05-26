"""Enriquecedor de prompts con metadatos del ML service.

Si ml-service esta disponible, anade al prompt:
- Clasificacion (type + area) inferida
- Estimacion de esfuerzo + keywords detectadas
- Lista de riesgos relevantes

Si no esta disponible, devuelve el prompt original sin tocar.
"""
from __future__ import annotations

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


async def get_ml_metadata(text: str) -> dict | None:
    if not settings.ml_enabled:
        return None
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.ml_service_url}/ml/analyze", json={"text": text}
            )
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        logger.warning("ml_metadata_unavailable", error=str(exc))
        return None


def format_ml_context(meta: dict | None) -> str:
    if not meta:
        return ""
    cls = meta.get("classification", {})
    eff = meta.get("effort", {})
    risks = meta.get("risks", {})

    lines: list[str] = ["", "### Contexto inferido por ML (referencia, no obligatorio):"]
    if cls:
        lines.append(
            f"- **Tipo sugerido**: {cls.get('type')} "
            f"(confianza {cls.get('type_confidence', 0):.2f})"
        )
        lines.append(
            f"- **Area sugerida**: {cls.get('area')} "
            f"(confianza {cls.get('area_confidence', 0):.2f})"
        )
    if eff:
        lines.append(
            f"- **Estimacion preliminar**: {eff.get('story_points')} story points "
            f"(patron {eff.get('pattern')}, score keywords {eff.get('keyword_score')})"
        )
    if risks and risks.get("count", 0) > 0:
        risk_list = ", ".join(r["type"] for r in risks.get("risks", []))
        lines.append(
            f"- **Riesgos detectados** ({risks.get('overall_risk')}): {risk_list}"
        )
    lines.append("")
    return "\n".join(lines)

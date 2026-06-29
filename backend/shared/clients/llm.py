"""Helper minúsculo de chat-completion con OpenAI (gpt-4o-mini por defecto).

Para AYUDAS MENORES al usuario final (asistente de visión, explicaciones en lenguaje
simple, etc.) — NO para la generación pesada de código (eso usa el plan de Claude).
Barato, best-effort: si la key no está o falla, devuelve None y el llamador degrada.
NO toca el flujo gateado de los talleres.
"""
from __future__ import annotations

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


async def openai_chat(
    system: str,
    user: str,
    *,
    max_tokens: int = 500,
    temperature: float = 0.4,
    timeout: float = 40.0,
) -> str | None:
    """Una llamada a OpenAI chat/completions. Devuelve el texto o None (degradación)."""
    key = settings.openai_api_key
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": settings.openai_model_fast,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
        if r.status_code != 200:
            logger.warning("openai_chat_failed", status=r.status_code, body=r.text[:200])
            return None
        return (r.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception as exc:  # noqa: BLE001 - best-effort, nunca rompe
        logger.warning("openai_chat_error", error=str(exc)[:160])
        return None

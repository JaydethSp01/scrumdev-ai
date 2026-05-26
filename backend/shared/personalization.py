"""Personalizacion adaptativa por cliente.

Cada cliente (= proyecto) tiene un namespace en memory_service donde se guardan
sus visiones, historias, decisiones y codigo generado. Antes de cada llamada
a Claude, recuperamos las piezas mas relevantes (RAG via pgvector) y las
inyectamos como "estilo del cliente" para que el output sea unico.

Esto NO es el ml_service (que era analisis de texto). Esto es aprendizaje del
estilo del cliente para mejorar la generacion.
"""
from __future__ import annotations

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


def _ns(project_key: str) -> str:
    """Namespace por cliente/proyecto."""
    return f"client:{project_key}"


async def remember(project_key: str, content: str, kind: str = "note") -> bool:
    """Guarda una pieza del historico del cliente en su memoria semantica."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{settings.memory_service_url}/memory/save",
                json={
                    "namespace": _ns(project_key),
                    "content": content,
                    "metadata": {"kind": kind, "project_key": project_key},
                },
            )
        return True
    except Exception as exc:
        logger.warning("personalization_remember_failed", error=str(exc))
        return False


async def recall(project_key: str, query: str, top_k: int = 5) -> list[dict]:
    """Recupera los top-k items mas relevantes del historico del cliente."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{settings.memory_service_url}/memory/search",
                json={
                    "namespace": _ns(project_key),
                    "query": query,
                    "top_k": top_k,
                },
            )
            r.raise_for_status()
            return r.json().get("results", []) or []
    except Exception as exc:
        logger.warning("personalization_recall_failed", error=str(exc))
        return []


def format_style_context(items: list[dict]) -> str:
    """Convierte los items recuperados en un bloque de contexto para el prompt."""
    if not items:
        return ""
    lines = ["### Estilo y contexto previo de este cliente (usar como referencia):"]
    for i, it in enumerate(items, 1):
        content = it.get("content") if isinstance(it, dict) else str(it)
        if not content:
            continue
        snippet = content if len(content) <= 500 else content[:500] + "..."
        lines.append(f"{i}. {snippet}")
    lines.append(
        "Aprovecha este contexto para mantener coherencia con decisiones previas del "
        "cliente. NO repitas literalmente, adapta el output al estilo demostrado."
    )
    return "\n".join(lines) + "\n\n"


async def build_style_prefix(project_key: str | None, query: str, top_k: int = 5) -> str:
    """Helper unico que devuelve el bloque de personalizacion listo para el prompt."""
    if not project_key:
        return ""
    items = await recall(project_key, query, top_k=top_k)
    return format_style_context(items)

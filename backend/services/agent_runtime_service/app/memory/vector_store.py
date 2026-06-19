"""Memoria semantica del runtime de agentes — REAL (pgvector + embeddings).

Antes esto era un dict en memoria con scoring por palabras (placeholder de fase 1).
Ahora delega al `memory_service`, que persiste con EMBEDDINGS reales (OpenAI
text-embedding-3-small / MiniLM-L6 via sentence-transformers) y recupera por
SIMILITUD COSENO en pgvector. Es la misma memoria semantica que usa la capa de
personalizacion del cliente; aqui la exponemos con la interfaz save/search que
un Crew con `memory=True` consumiria.

Cae elegante a [] si el memory_service no esta disponible (nunca rompe un flujo).
"""
from __future__ import annotations

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


class SemanticVectorStore:
    """Memoria semantica real respaldada por el memory_service (pgvector + embeddings)."""

    async def save(self, namespace: str, content: str, metadata: dict | None = None) -> bool:
        """Guarda una pieza de contexto en la memoria vectorial del namespace."""
        if not content:
            return False
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await client.post(
                    f"{settings.memory_service_url}/memory/save",
                    json={"namespace": namespace, "content": content, "metadata": metadata or {}},
                )
            return True
        except Exception as exc:  # noqa: BLE001 - best effort, nunca rompe el flujo
            logger.warning("vector_store_save_failed", namespace=namespace, error=str(exc)[:160])
            return False

    async def search(self, namespace: str, query: str, top_k: int = 5) -> list[str]:
        """Recupera los top_k contenidos mas SIMILARES (coseno sobre embeddings)."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f"{settings.memory_service_url}/memory/search",
                    json={"namespace": namespace, "query": query, "top_k": top_k},
                )
                r.raise_for_status()
                items = r.json().get("results", []) or []
                return [
                    (it.get("content") if isinstance(it, dict) else str(it)) or ""
                    for it in items
                ]
        except Exception as exc:  # noqa: BLE001
            logger.warning("vector_store_search_failed", namespace=namespace, error=str(exc)[:160])
            return []


# Instancia global del runtime de agentes (memoria semantica real).
store = SemanticVectorStore()

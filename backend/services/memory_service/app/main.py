"""Memory Service con memoria semantica real (pgvector + fallback in-memory).

- Si pgvector esta disponible en Postgres: usa cosine similarity con embeddings
  computados via ml-service.
- Si no: cae a fuzzy keyword matching in-memory por namespace.

Endpoints:
  POST /memory/save                {namespace, content, metadata?}
  POST /memory/search              {namespace, query, top_k}
  POST /memory/duplicates          {namespace, content, threshold} -> similares al guardar
  GET  /memory/{namespace}/stats   estadisticas del namespace
"""
from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import func, select, text

from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import MemoryItem
from shared.db.session import get_session
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("memory-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Memory Service", version="0.1.0")
instrument_app(app, "memory-service")

_pgvector_ready = False
_embedding_dim: int | None = None


async def _embed_openai(content: str) -> list[float] | None:
    """OpenAI text-embedding-3-small: 1536 dim, mas calidad que MiniLM-L6 (384)."""
    if not (settings.openai_enabled and settings.openai_api_key):
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": settings.openai_embedding_model, "input": content},
            )
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]
    except Exception as exc:
        logger.warning("openai_embed_failed", error=str(exc))
        return None


async def _embed(content: str) -> list[float] | None:
    """Estrategia hibrida:
    1. OpenAI text-embedding-3-small (1536 dim, mejor recall) si OPENAI_ENABLED
    2. Fallback al ml_service local (sentence-transformers MiniLM, 384 dim)
    """
    vec = await _embed_openai(content)
    if vec is not None:
        return vec
    if not settings.ml_enabled:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.ml_service_url}/ml/embed", json={"text": content}
            )
            response.raise_for_status()
            return response.json().get("embedding")
    except Exception as exc:
        logger.warning("ml_embed_unavailable", error=str(exc))
        return None


async def _setup_pgvector() -> None:
    global _pgvector_ready, _embedding_dim
    async for session in get_session():
        try:
            await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await session.commit()
        except Exception as exc:
            logger.warning("pgvector_extension_unavailable", error=str(exc))
            return
        if _embedding_dim is None:
            # Si OpenAI esta activo: 1536 (text-embedding-3-small)
            # Si no: caemos al dim del ml_service (sentence-transformers)
            if settings.openai_enabled and settings.openai_api_key:
                _embedding_dim = 1536
                logger.info("memory_using_openai_embeddings", dim=1536)
            else:
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        response = await client.get(f"{settings.ml_service_url}/ml/info")
                        response.raise_for_status()
                        _embedding_dim = response.json().get("dimension") or 384
                except Exception as exc:
                    logger.warning("ml_info_unavailable", error=str(exc))
                    _embedding_dim = 384
            # Si la tabla existe con dim distinto, dropearla (vacia o casi)
            try:
                r = await session.execute(
                    text(
                        "SELECT a.atttypmod FROM pg_attribute a "
                        "JOIN pg_class c ON c.oid=a.attrelid "
                        "WHERE c.relname='memory_embeddings' AND a.attname='embedding'"
                    )
                )
                row = r.first()
                if row and row[0] and row[0] != _embedding_dim:
                    logger.warning(
                        "embedding_dim_mismatch_recreating", old=row[0], new=_embedding_dim
                    )
                    await session.execute(text("DROP TABLE memory_embeddings"))
                    await session.commit()
            except Exception:
                pass
        try:
            await session.execute(
                text(
                    f"""
                    CREATE TABLE IF NOT EXISTS memory_embeddings (
                      id          TEXT PRIMARY KEY,
                      namespace   TEXT NOT NULL,
                      content     TEXT NOT NULL,
                      metadata    JSONB DEFAULT '{{}}'::jsonb,
                      embedding   vector({_embedding_dim}),
                      created_at  TIMESTAMPTZ DEFAULT now()
                    )
                    """
                )
            )
            await session.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS memory_embeddings_ns_idx "
                    "ON memory_embeddings (namespace)"
                )
            )
            await session.commit()
            _pgvector_ready = True
            logger.info("pgvector_ready", dim=_embedding_dim)
        except Exception as exc:
            logger.warning("pgvector_setup_failed", error=str(exc))
        break


class SaveRequest(BaseModel):
    namespace: str
    content: str
    metadata: dict[str, Any] = {}


class SearchRequest(BaseModel):
    namespace: str
    query: str
    top_k: int = 5


class DuplicatesRequest(BaseModel):
    namespace: str
    content: str
    threshold: float = 0.8


_in_memory: dict[str, list[dict]] = {}


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
        await _setup_pgvector()
    except Exception as exc:
        logger.warning("startup_db_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "memory-service",
        "pgvector": _pgvector_ready,
        "embedding_dim": _embedding_dim,
    }


async def _save_pgvector(
    namespace: str, content: str, metadata: dict, embedding: list[float]
) -> str | None:
    async for session in get_session():
        try:
            vec_str = "[" + ",".join(str(x) for x in embedding) + "]"
            result = await session.execute(
                text(
                    "INSERT INTO memory_embeddings (id, namespace, content, metadata, embedding) "
                    "VALUES (CAST(gen_random_uuid() AS text), :ns, :ct, "
                    "CAST(:md AS jsonb), CAST(:em AS vector)) RETURNING id"
                ),
                {"ns": namespace, "ct": content, "md": json.dumps(metadata), "em": vec_str},
            )
            row = result.first()
            await session.commit()
            return row[0] if row else None
        except Exception as exc:
            logger.warning("pgvector_save_failed", error=str(exc))
            return None
    return None


@app.post("/memory/save")
async def save(req: SaveRequest) -> dict:
    embedding = await _embed(req.content)
    if _pgvector_ready and embedding:
        saved_id = await _save_pgvector(req.namespace, req.content, req.metadata, embedding)
        if saved_id:
            return {"saved": True, "id": saved_id, "backend": "pgvector"}

    try:
        async for session in get_session():
            item = MemoryItem(
                namespace=req.namespace, content=req.content, metadata_json=req.metadata
            )
            session.add(item)
            await session.commit()
            await session.refresh(item)
            return {"saved": True, "id": item.id, "backend": "postgres-keyword"}
    except Exception as exc:
        logger.warning("postgres_save_failed", error=str(exc))

    _in_memory.setdefault(req.namespace, []).append(
        {"content": req.content, "metadata": req.metadata}
    )
    return {"saved": True, "id": None, "backend": "in-memory"}


async def _search_pgvector(
    namespace: str, query: str, top_k: int
) -> list[dict] | None:
    embedding = await _embed(query)
    if not embedding:
        return None
    async for session in get_session():
        try:
            vec_str = "[" + ",".join(str(x) for x in embedding) + "]"
            result = await session.execute(
                text(
                    "SELECT id, content, metadata, "
                    "1 - (embedding <=> CAST(:em AS vector)) AS score "
                    "FROM memory_embeddings WHERE namespace = :ns "
                    "ORDER BY embedding <=> CAST(:em AS vector) LIMIT :k"
                ),
                {"ns": namespace, "em": vec_str, "k": top_k},
            )
            rows = result.all()
            return [
                {
                    "id": r[0],
                    "content": r[1],
                    "metadata": r[2],
                    "score": float(r[3]),
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning("pgvector_search_failed", error=str(exc))
            return None
    return None


def _search_keyword(query: str, top_k: int, docs: list) -> list[dict]:
    qw = query.lower().split()
    scored = []
    for d in docs:
        content = d["content"] if isinstance(d, dict) else d.content
        score = sum(1 for w in qw if w in content.lower())
        scored.append({"content": content, "score": score})
    scored.sort(key=lambda x: -x["score"])
    return scored[:top_k]


@app.post("/memory/search")
async def search(req: SearchRequest) -> dict:
    if _pgvector_ready:
        results = await _search_pgvector(req.namespace, req.query, req.top_k)
        if results is not None:
            return {"results": results, "backend": "pgvector"}

    try:
        async for session in get_session():
            result = await session.execute(
                select(MemoryItem).where(MemoryItem.namespace == req.namespace)
            )
            docs = result.scalars().all()
            return {
                "results": _search_keyword(req.query, req.top_k, docs),
                "backend": "postgres-keyword",
            }
    except Exception as exc:
        logger.warning("postgres_search_failed", error=str(exc))

    return {
        "results": _search_keyword(
            req.query, req.top_k, _in_memory.get(req.namespace, [])
        ),
        "backend": "in-memory",
    }


@app.post("/memory/duplicates")
async def duplicates(req: DuplicatesRequest) -> dict:
    if not _pgvector_ready:
        return {"duplicates": [], "backend": "unavailable"}
    results = await _search_pgvector(req.namespace, req.content, top_k=10)
    if not results:
        return {"duplicates": [], "backend": "pgvector"}
    dupes = [r for r in results if r["score"] >= req.threshold]
    return {"duplicates": dupes, "threshold": req.threshold, "backend": "pgvector"}


@app.get("/memory/{namespace}/stats")
async def stats(namespace: str) -> dict:
    try:
        async for session in get_session():
            if _pgvector_ready:
                result = await session.execute(
                    text(
                        "SELECT count(*) FROM memory_embeddings WHERE namespace = :ns"
                    ),
                    {"ns": namespace},
                )
                count = result.scalar() or 0
                return {"namespace": namespace, "count": count, "backend": "pgvector"}
            result = await session.execute(
                select(func.count()).select_from(MemoryItem).where(
                    MemoryItem.namespace == namespace
                )
            )
            return {
                "namespace": namespace,
                "count": result.scalar() or 0,
                "backend": "postgres-keyword",
            }
    except Exception:
        return {
            "namespace": namespace,
            "count": len(_in_memory.get(namespace, [])),
            "backend": "in-memory",
        }
    return {"namespace": namespace, "count": 0}

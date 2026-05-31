"""Embedder local con sentence-transformers.

- Modelo por defecto: all-MiniLM-L6-v2 (~80MB, 384 dims, ingles/multilingual)
- Lazy load al primer uso para no penalizar startup
- Cache en disco bajo `ml_cache_dir`
- Si el paquete no esta disponible, emite NotImplementedError con mensaje claro
"""
from __future__ import annotations

import os
from functools import lru_cache
from threading import Lock

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)

_lock = Lock()
_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model
    # Gate de recursos: en instancias chicas (Render free 512MB) cargar torch +
    # sentence-transformers hace OOM y tumba el proceso. Con ML_ENABLED=false
    # fallamos rápido (sin importar torch) y los callers usan sus fallbacks.
    if not settings.ml_enabled:
        raise RuntimeError("ml_disabled")
    with _lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers no esta instalado. "
                "Ejecuta: poetry add sentence-transformers"
            ) from exc

        os.makedirs(settings.ml_cache_dir, exist_ok=True)
        logger.info("loading_embedding_model", model=settings.ml_embedding_model)
        _model = SentenceTransformer(
            settings.ml_embedding_model,
            cache_folder=settings.ml_cache_dir,
        )
        logger.info(
            "embedding_model_loaded",
            model=settings.ml_embedding_model,
            dim=_model.get_sentence_embedding_dimension(),
        )
        return _model


def embedding_dimension() -> int:
    return _load_model().get_sentence_embedding_dimension()


def embed_one(text: str) -> list[float]:
    model = _load_model()
    vec = model.encode([text], normalize_embeddings=True)[0]
    return vec.tolist()


def embed_many(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _load_model()
    vecs = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return [v.tolist() for v in vecs]


@lru_cache(maxsize=2048)
def _embed_cached(text: str) -> tuple:
    return tuple(embed_one(text))


def embed_one_cached(text: str) -> list[float]:
    return list(_embed_cached(text))

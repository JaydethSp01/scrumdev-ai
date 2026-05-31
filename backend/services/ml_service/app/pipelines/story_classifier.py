"""Clasificador de historias por tipo y area usando zero-shot por embeddings.

Calcula la similitud coseno entre el texto y los embeddings de cada etiqueta
candidata (precomputados). Es rapido, sin entrenamiento, sin API externa.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from services.ml_service.app.models.embedder import embed_many, embed_one

TYPE_LABELS = {
    "feature": "Nueva funcionalidad para el usuario final que agrega valor",
    "bug": "Correccion de un defecto o error en el sistema existente",
    "improvement": "Mejora de rendimiento, usabilidad o calidad sin cambiar comportamiento",
    "spike": "Investigacion tecnica, prueba de concepto o exploracion",
    "chore": "Tarea tecnica interna, refactor, mantenimiento, infraestructura",
    "documentation": "Creacion o actualizacion de documentacion del producto o tecnica",
}

AREA_LABELS = {
    "frontend": "Cambios en la interfaz de usuario, componentes UI, paginas web",
    "backend": "API, endpoints, logica de negocio, microservicios",
    "data": "Modelo de datos, esquema de base de datos, migraciones, consultas",
    "devops": "Infraestructura, despliegue, CI/CD, contenedores, monitoreo",
    "security": "Autenticacion, autorizacion, cifrado, vulnerabilidades, compliance",
    "ml_ai": "Modelos de machine learning, agentes IA, embeddings, LLMs",
    "integration": "Integraciones con sistemas externos, APIs de terceros, webhooks",
}


@lru_cache(maxsize=1)
def _type_centroids() -> tuple[list[str], np.ndarray]:
    keys = list(TYPE_LABELS.keys())
    vecs = np.array(embed_many([TYPE_LABELS[k] for k in keys]))
    return keys, vecs


@lru_cache(maxsize=1)
def _area_centroids() -> tuple[list[str], np.ndarray]:
    keys = list(AREA_LABELS.keys())
    vecs = np.array(embed_many([AREA_LABELS[k] for k in keys]))
    return keys, vecs


def _topk(query_vec: np.ndarray, keys: list[str], centroids: np.ndarray, k: int = 3) -> list[dict]:
    sims = centroids @ query_vec  # ya normalizados -> cosine
    idxs = np.argsort(-sims)[:k]
    return [{"label": keys[i], "score": float(sims[i])} for i in idxs]


def _classify_story_zeroshot(text: str) -> dict:
    """Clasificación zero-shot por centroides (fallback sin redes entrenadas)."""
    qv = np.array(embed_one(text))
    type_keys, type_centroids = _type_centroids()
    area_keys, area_centroids = _area_centroids()

    type_ranks = _topk(qv, type_keys, type_centroids, k=3)
    area_ranks = _topk(qv, area_keys, area_centroids, k=3)

    return {
        "type": type_ranks[0]["label"],
        "type_confidence": type_ranks[0]["score"],
        "type_top3": type_ranks,
        "area": area_ranks[0]["label"],
        "area_confidence": area_ranks[0]["score"],
        "area_top3": area_ranks,
        "engine": "zero_shot_centroids",
    }


def classify_story(text: str) -> dict:
    """Strategy: usa la red neuronal entrenada si existe; si no, zero-shot.

    Las redes (entrenadas con scripts/train_nn.py) superan a los centroides
    porque aprenden los límites reales entre clases a partir de datos.
    """
    try:
        from services.ml_service.app.nn.inference import nn_classify_story
        nn = nn_classify_story(text)
        if nn is not None:
            return nn
    except Exception:  # noqa: BLE001  -> nunca romper la clasificación
        pass
    return _classify_story_zeroshot(text)

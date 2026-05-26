"""Estimador de esfuerzo basado en features lexicas + embeddings.

Combina:
- Heuristica: longitud del texto, presencia de palabras clave de complejidad
  (integracion, autenticacion, pago, real-time, machine learning, etc.)
- Embeddings: cercania a "patrones" simples (S/M/L/XL) por similitud coseno

Devuelve story points Fibonacci (1, 2, 3, 5, 8, 13, 21) y un breakdown.
"""
from __future__ import annotations

import re
from functools import lru_cache

import numpy as np

from services.ml_service.app.models.embedder import embed_many, embed_one

COMPLEXITY_KEYWORDS = {
    "high": [
        "integracion", "integration", "pago", "payment", "stripe", "checkout",
        "real-time", "websocket", "streaming", "machine learning", "ml ", " ai ",
        "autenticacion multifactor", "mfa", "oauth", "saml", "sso",
        "migracion", "migration", "rollout", "canary", "blue green",
        "compliance", "gdpr", "pci", "encryption", "audit log",
    ],
    "medium": [
        "api", "endpoint", "crud", "validacion", "validation", "search",
        "filter", "report", "dashboard", "export", "import",
        "notification", "email", "schedule", "background job",
    ],
    "low": [
        "label", "color", "texto", "copy", "icono", "tooltip", "small",
        "rename", "typo", "log",
    ],
}

PATTERN_TEXTS = {
    "XS": "Cambio menor de texto, etiqueta o color en una sola pantalla.",
    "S": "Endpoint o pantalla pequena con un solo caso de uso simple.",
    "M": "Funcionalidad con validacion, persistencia y una pantalla.",
    "L": "Funcionalidad con integracion externa, multiples pantallas o reglas.",
    "XL": "Iniciativa con multiples integraciones, autenticacion, compliance, real-time.",
}
PATTERN_POINTS = {"XS": 1, "S": 2, "M": 5, "L": 8, "XL": 13}


@lru_cache(maxsize=1)
def _pattern_vecs():
    keys = list(PATTERN_TEXTS.keys())
    vecs = np.array(embed_many([PATTERN_TEXTS[k] for k in keys]))
    return keys, vecs


def _keyword_score(text: str) -> dict:
    t = text.lower()
    counts = {bucket: 0 for bucket in COMPLEXITY_KEYWORDS}
    matched: dict[str, list[str]] = {bucket: [] for bucket in COMPLEXITY_KEYWORDS}
    for bucket, words in COMPLEXITY_KEYWORDS.items():
        for w in words:
            n = len(re.findall(re.escape(w), t))
            if n:
                counts[bucket] += n
                matched[bucket].append(w)
    score = counts["high"] * 3 + counts["medium"] * 1 - counts["low"] * 1
    return {"score": score, "counts": counts, "matched": matched}


def estimate_effort(text: str) -> dict:
    keys, centroids = _pattern_vecs()
    qv = np.array(embed_one(text))
    sims = centroids @ qv
    best_idx = int(np.argmax(sims))
    pattern = keys[best_idx]
    pattern_confidence = float(sims[best_idx])

    kw = _keyword_score(text)

    base_points = PATTERN_POINTS[pattern]
    if kw["score"] >= 6:
        adjusted = max(base_points, 13)
    elif kw["score"] >= 3:
        adjusted = max(base_points, 8)
    elif kw["score"] >= 1:
        adjusted = max(base_points, 5)
    elif kw["score"] < 0:
        adjusted = max(1, base_points - 2)
    else:
        adjusted = base_points

    fib_ladder = [1, 2, 3, 5, 8, 13, 21]
    fib = min(fib_ladder, key=lambda x: abs(x - adjusted))

    hours_low = fib * 2
    hours_high = fib * 6

    return {
        "story_points": fib,
        "pattern": pattern,
        "pattern_confidence": pattern_confidence,
        "keyword_score": kw["score"],
        "matched_keywords": kw["matched"],
        "estimated_hours_range": [hours_low, hours_high],
        "text_length_chars": len(text),
    }

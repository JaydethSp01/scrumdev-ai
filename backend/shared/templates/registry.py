"""Matching de plantillas: dado lo que el usuario describe (clasificación + visión),
rankea el catálogo y devuelve las mejores para mostrar en la galería.

Algoritmo simple y explicable (no caja negra): puntúa por solape de
sector/tipo/entidades/tags con la visión. El ML del Stack Expert puede refinar
esto luego (embeddings), pero esto ya da una galería relevante sin dependencias.
"""
from __future__ import annotations

import re

from shared.templates.catalog import Template, all_templates


def _norm(s: str) -> str:
    s = (s or "").lower()
    return re.sub(r"[^a-z0-9áéíóúñ ]+", " ", s)


def _tokens(s: str) -> set[str]:
    return {t for t in _norm(s).split() if len(t) > 2}


def score_template(t: Template, classification: dict, vision: str) -> float:
    """Puntúa qué tan bien matchea una plantilla. Mayor = mejor."""
    vis = _norm(vision)
    vis_tokens = _tokens(vision)
    ctype = str(classification.get("type", "")).lower()
    sector = str(classification.get("sector", "")).lower()
    ents = {_norm(e) for e in (classification.get("entities") or []) if isinstance(e, str)}
    feats = " ".join(classification.get("key_features", []) or []).lower()

    score = 0.0
    # tags en la visión (la señal más fuerte: el usuario nombró el dominio)
    for tag in t.tags:
        if tag in vis or tag in feats:
            score += 3.0
        elif _tokens(tag) & vis_tokens:
            score += 1.2
    # sector explícito de la clasificación
    if sector and (sector in t.sector or t.sector in sector):
        score += 4.0
    # tipo de software (landing vs app con datos): coherencia dura
    is_static = classification.get("is_static") or ctype == "landing"
    if is_static and t.software_type == "landing":
        score += 5.0
    elif not is_static and t.software_type != "landing":
        score += 2.0
    elif is_static != (t.software_type == "landing"):
        score -= 6.0  # no mezclar landing con app de datos
    # solape de entidades
    for e in ents:
        for te in t.entities:
            if e and (e in te or te in e):
                score += 1.5
    return score


def match_templates(
    classification: dict, vision: str, top_k: int = 6, only_seeded: bool = False
) -> list[tuple[Template, float]]:
    """Devuelve [(template, score)] ordenado desc. Garantiza variedad: si el top
    queda vacío/empate bajo, igual devuelve plantillas del tipo correcto."""
    cands = all_templates()
    if only_seeded:
        cands = [t for t in cands if t.has_files]
    scored = [(t, score_template(t, classification, vision)) for t in cands]
    scored.sort(key=lambda x: x[1], reverse=True)
    # filtrar negativos fuertes (landing vs app cruzados) pero asegurar >= top_k
    positive = [s for s in scored if s[1] > 0]
    result = positive[:top_k] if len(positive) >= 3 else scored[:top_k]
    return result


def best_template(classification: dict, vision: str) -> Template | None:
    ranked = match_templates(classification, vision, top_k=1)
    return ranked[0][0] if ranked else None

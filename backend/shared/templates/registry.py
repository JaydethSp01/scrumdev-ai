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
    # solape de entidades. Las entidades GENÉRICAS (cliente, pago, usuario…) las
    # comparten casi todas las plantillas -> peso bajo, para que NO hagan ganar al
    # sector equivocado (ej. una feria de vivienda cayendo en barbería por "cliente/
    # cita/pago"). El dominio (tags) debe dominar. Además se topa el aporte total.
    GENERIC = {"cliente", "clientes", "usuario", "usuarios", "pago", "pagos",
               "producto", "productos", "servicio", "servicios", "cita", "citas"}
    ent_score = 0.0
    for e in ents:
        for te in t.entities:
            if e and (e in te or te in e):
                ent_score += 0.4 if (e in GENERIC or te in GENERIC) else 1.5
                break
    score += min(ent_score, 4.5)  # tope: las entidades no pueden dominar al dominio
    return score


def explain_match(t: Template, classification: dict, vision: str, score: float) -> dict:
    """Explica POR QUÉ una plantilla matchea (no caja negra): confianza 0-100 y
    razones legibles. Diferenciador UX: el usuario ve el criterio del match."""
    vis = _norm(vision)
    vis_tokens = _tokens(vision)
    sector = str(classification.get("sector", "")).lower()
    ents = {_norm(e) for e in (classification.get("entities") or []) if isinstance(e, str)}
    reasons: list[str] = []
    if sector and (sector in t.sector or t.sector in sector):
        reasons.append(f"sector {getattr(t, 'sector_label', '') or t.sector}")
    matched_tags = [tag for tag in t.tags if tag in vis or (_tokens(tag) & vis_tokens)]
    if matched_tags:
        reasons.append("palabras: " + ", ".join(matched_tags[:3]))
    matched_ents = [e for e in ents for te in t.entities if e and (e in te or te in e)]
    if matched_ents:
        reasons.append("entidades: " + ", ".join(sorted(set(matched_ents))[:3]))
    ctype = str(classification.get("type", "")).lower()
    is_static = classification.get("is_static") or ctype == "landing"
    if is_static == (t.software_type == "landing"):
        reasons.append("tipo de software compatible")
    conf = max(35, min(99, int(40 + score * 4)))
    if not reasons:
        reasons.append("sugerencia por defecto")
        conf = min(conf, 45)
    return {"confidence": conf, "reasons": reasons}


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
    # FALLBACK: si no hay match decente (todo <=0), garantizar una por DEFECTO
    # (un dashboard CRUD seedeado y genérico) para que el usuario SIEMPRE tenga
    # una plantilla 1A que elegir, aunque no detectemos el sector.
    if not result or (result and result[0][1] <= 0):
        dft = default_template(only_seeded=only_seeded)
        if dft and dft.id not in {t.id for t, _ in result}:
            result = [(dft, 0.0)] + result
    return result[:top_k]


# Plantilla por DEFECTO cuando el matching no detecta sector. Genérica y seedeada.
DEFAULT_TEMPLATE_ID = "saas-dashboard"
DEFAULT_SEEDED_FALLBACK = "retail-inventory-pro"  # seedeada, siempre desplegable


def default_template(only_seeded: bool = False):
    """Devuelve la plantilla por defecto. Prioriza una seedeada (con archivos
    reales, desplegable al instante) si se pide only_seeded o si la default no
    está seedeada todavía."""
    from shared.templates.catalog import get_template
    dft = get_template(DEFAULT_TEMPLATE_ID)
    if dft and (dft.has_files or not only_seeded):
        return dft
    # caer a una seedeada garantizada
    return get_template(DEFAULT_SEEDED_FALLBACK) or dft


def best_template(classification: dict, vision: str) -> Template | None:
    ranked = match_templates(classification, vision, top_k=1)
    return ranked[0][0] if ranked else default_template()

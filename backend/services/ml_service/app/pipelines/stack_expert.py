"""Stack Expert: la inteligencia ML que guia generacion + deploy por stack.

Tres capacidades, todas sobre la infra existente (embedder local + Postgres):

  1. blueprint(classification): elige el stack y devuelve su contrato completo.
  2. exemplars(vision, stack): recupera los builds EXITOSOS mas parecidos
     (coseno sobre embeddings) para usarlos como few-shot en la generacion.
  3. completeness(files, stack): score 0..1 de que tan completo esta el proyecto
     generado vs el manifiesto del blueprint, con la lista de faltantes por tier.
     Es el gate pre-deploy: no se despliega algo incompleto.

  + record_build(...): persiste el resultado real para que el modelo aprenda.

No hay GPU ni fine-tuning: es retrieval-augmented + scoring deterministico que
mejora con cada build real (mas exemplars exitosos -> mejor guia).
"""
from __future__ import annotations

from typing import Any

from shared.stacks.stack_blueprints import (
    get_blueprint,
    manifest_for,
    pick_stack,
    split_by_tier,
    missing_required,
    completeness_score as _tier_score,
)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def choose_blueprint(classification: dict) -> dict:
    """Elige stack desde la clasificacion y devuelve el manifiesto serializable."""
    stack = pick_stack(classification)
    return manifest_for(stack)


def rank_exemplars(
    query_embedding: list[float],
    stack: str,
    candidates: list[dict],
    top_k: int = 3,
) -> list[dict]:
    """Ordena builds candidatos (cada uno {embedding, vision, manifest, outcome,
    success, stack}) por similitud coseno, filtrando solo EXITOSOS del mismo stack.
    Devuelve top_k con su score."""
    scored: list[dict] = []
    for c in candidates:
        if not c.get("success"):
            continue
        if stack and c.get("stack") and c["stack"] != stack:
            continue
        score = _cosine(query_embedding, c.get("embedding") or [])
        scored.append({**c, "score": round(score, 4)})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def score_completeness(files: list[dict], stack: str) -> dict:
    """Evalua que tan completo esta el proyecto generado vs el blueprint.

    Devuelve por tier: score 0..1 y archivos obligatorios faltantes, mas un
    score global (promedio ponderado) y un veredicto deploy_ready.
    """
    bp = get_blueprint(stack)
    buckets = split_by_tier(files, stack)
    tiers_report: list[dict] = []
    total = 0.0
    for tier in bp.tiers:
        tier_files = buckets.get(tier.name, [])
        miss = missing_required(tier_files, tier)
        score = _tier_score(tier_files, tier)
        total += score
        tiers_report.append({
            "tier": tier.name,
            "target": tier.target,
            "framework": tier.framework,
            "files_count": len(tier_files),
            "score": round(score, 3),
            "missing": miss,
        })
    global_score = total / len(bp.tiers) if bp.tiers else 0.0
    # deploy_ready: todos los entrypoints presentes y score global alto
    all_entrypoints_ok = all(not _entrypoints_missing(buckets, bp) for _ in [0])

    # Red neuronal de completitud (si está entrenada): probabilidad deploy-ready
    # aprendida de builds reales. Complementa al gate determinista.
    nn_prob = None
    try:
        from services.ml_service.app.nn.inference import nn_score_completeness
        from services.ml_service.app.nn.features import completeness_features
        nn_prob = nn_score_completeness(completeness_features(files, stack))
    except Exception:  # noqa: BLE001
        nn_prob = None

    deploy_ready = global_score >= 0.85 and all_entrypoints_ok
    if nn_prob is not None:
        # exige acuerdo: el gate determinista Y la red deben estar de acuerdo
        deploy_ready = deploy_ready and nn_prob >= 0.7

    return {
        "stack": stack,
        "global_score": round(global_score, 3),
        "nn_deploy_ready_prob": round(nn_prob, 3) if nn_prob is not None else None,
        "deploy_ready": deploy_ready,
        "tiers": tiers_report,
    }


def _entrypoints_missing(buckets: dict[str, list[dict]], bp) -> list[str]:
    missing: list[str] = []
    for tier in bp.tiers:
        have = {(f.get("path") or "").lstrip("/") for f in buckets.get(tier.name, [])}
        for ep in tier.entrypoints:
            if ep not in have:
                missing.append(f"{tier.name}:{ep}")
    return missing


def manifest_snapshot(files: list[dict], stack: str) -> dict:
    """{tier: [paths]} de lo realmente generado, para guardar en BuildMemory."""
    buckets = split_by_tier(files, stack)
    return {tier: [f.get("path") for f in fs] for tier, fs in buckets.items()}

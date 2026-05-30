"""ML Service.

Centraliza la inteligencia "no-LLM" del sistema:
- Embeddings semanticos locales (sentence-transformers)
- Clasificacion de historias por tipo y area
- Estimacion de esfuerzo (story points)
- Extraccion de riesgos
- Calculo de similitud y deteccion de duplicados

Todo corre 100% local. La primera llamada descarga el modelo (~80MB) y lo cachea.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from services.ml_service.app.models.embedder import (
    embed_many,
    embed_one,
    embedding_dimension,
)
from services.ml_service.app.pipelines.effort_estimator import estimate_effort
from services.ml_service.app.pipelines.risk_extractor import extract_risks
from services.ml_service.app.pipelines.stack_expert import (
    choose_blueprint,
    manifest_snapshot,
    rank_exemplars,
    score_completeness,
)
from services.ml_service.app.pipelines.story_classifier import classify_story
from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("ml-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - ML Service", version="0.1.0")
instrument_app(app, "ml-service")


class TextRequest(BaseModel):
    text: str


class BatchTextRequest(BaseModel):
    texts: list[str]


class SimilarityRequest(BaseModel):
    text: str
    candidates: list[str]
    top_k: int = 5


class AnalyzeRequest(BaseModel):
    text: str
    include_embedding: bool = False


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ml-service",
        "enabled": settings.ml_enabled,
        "model": settings.ml_embedding_model,
    }


@app.get("/ml/info")
async def info() -> dict[str, Any]:
    try:
        dim = embedding_dimension()
    except Exception as exc:
        return {"model": settings.ml_embedding_model, "loaded": False, "error": str(exc)}
    return {"model": settings.ml_embedding_model, "loaded": True, "dimension": dim}


@app.post("/ml/embed")
async def embed(req: TextRequest) -> dict:
    try:
        vec = embed_one(req.text)
        return {"text": req.text, "embedding": vec, "dimension": len(vec)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ml/embed/batch")
async def embed_batch(req: BatchTextRequest) -> dict:
    try:
        vecs = embed_many(req.texts)
        return {"embeddings": vecs, "count": len(vecs), "dimension": len(vecs[0]) if vecs else 0}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ml/classify-story")
async def classify(req: TextRequest) -> dict:
    try:
        return classify_story(req.text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ml/estimate-effort")
async def estimate(req: TextRequest) -> dict:
    try:
        return estimate_effort(req.text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ml/extract-risks")
async def risks(req: TextRequest) -> dict:
    return extract_risks(req.text)


@app.post("/ml/similarity")
async def similarity(req: SimilarityRequest) -> dict:
    if not req.candidates:
        return {"matches": []}
    try:
        qv = np.array(embed_one(req.text))
        cands = np.array(embed_many(req.candidates))
        sims = cands @ qv
        order = np.argsort(-sims)[: req.top_k]
        return {
            "matches": [
                {"candidate": req.candidates[i], "score": float(sims[i])}
                for i in order
            ]
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# --- Stack Expert: blueprints + exemplars + completitud + aprendizaje ---


class BlueprintRequest(BaseModel):
    classification: dict


class ExemplarsRequest(BaseModel):
    vision: str
    stack: str = ""
    top_k: int = 3


class CompletenessRequest(BaseModel):
    files: list[dict]
    stack: str


class RecordBuildRequest(BaseModel):
    project_key: str
    vision: str
    stack: str
    files: list[dict] = []
    success: bool = False
    outcome: dict = {}


@app.post("/ml/stack/blueprint")
async def stack_blueprint(req: BlueprintRequest) -> dict:
    """Elige el stack desde la clasificacion y devuelve su contrato completo
    (tiers, manifiesto de archivos por tier, targets de deploy, wiring)."""
    return choose_blueprint(req.classification)


@app.post("/ml/stack/exemplars")
async def stack_exemplars(req: ExemplarsRequest) -> dict:
    """Recupera los builds EXITOSOS mas parecidos (few-shot) para guiar la IA."""
    from shared.db.session import get_session
    from shared.db.models import BuildMemory
    from sqlalchemy import select

    try:
        qv = embed_one(req.vision)
    except Exception as exc:
        return {"exemplars": [], "error": f"embed_failed: {exc}"}

    candidates: list[dict] = []
    try:
        async for session in get_session():
            rows = (await session.execute(
                select(BuildMemory).where(BuildMemory.success == True)  # noqa: E712
            )).scalars().all()
            for r in rows:
                candidates.append({
                    "project_key": r.project_key,
                    "stack": r.stack,
                    "vision": r.vision,
                    "embedding": r.embedding or [],
                    "manifest": r.manifest or {},
                    "outcome": r.outcome or {},
                    "success": r.success,
                })
            break
    except Exception as exc:
        return {"exemplars": [], "error": f"db_unavailable: {exc}"}

    ranked = rank_exemplars(qv, req.stack, candidates, top_k=req.top_k)
    # no devolver el embedding completo (ruido)
    for r in ranked:
        r.pop("embedding", None)
    return {"exemplars": ranked, "count": len(ranked), "pool": len(candidates)}


@app.post("/ml/stack/completeness")
async def stack_completeness(req: CompletenessRequest) -> dict:
    """Score 0..1 de completitud del proyecto generado vs el blueprint + faltantes."""
    return score_completeness(req.files, req.stack)


@app.post("/ml/stack/record-build")
async def stack_record_build(req: RecordBuildRequest) -> dict:
    """Persiste el resultado real de un build/deploy para que el modelo aprenda."""
    from shared.db.session import get_session
    from shared.db.models import BuildMemory

    try:
        emb = embed_one(req.vision)
    except Exception:
        emb = []
    manifest = manifest_snapshot(req.files, req.stack) if req.files else {}
    try:
        async for session in get_session():
            rec = BuildMemory(
                project_key=req.project_key,
                stack=req.stack,
                vision=req.vision,
                embedding=emb,
                manifest=manifest,
                success=req.success,
                outcome=req.outcome,
            )
            session.add(rec)
            await session.commit()
            return {"recorded": True, "id": rec.id, "learned_from": req.project_key}
    except Exception as exc:
        return {"recorded": False, "error": str(exc)}
    return {"recorded": False}


@app.post("/ml/analyze")
async def analyze(req: AnalyzeRequest) -> dict:
    """Endpoint compuesto: clasificacion + esfuerzo + riesgos en una llamada."""
    try:
        result: dict[str, Any] = {
            "classification": classify_story(req.text),
            "effort": estimate_effort(req.text),
            "risks": extract_risks(req.text),
        }
        if req.include_embedding:
            result["embedding"] = embed_one(req.text)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

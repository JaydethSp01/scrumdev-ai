"""Brain bundle - orchestrator + agent_runtime.

El cerebro de la plataforma: corre Claude Code SDK + OpenAI (pesado),
workflows, generacion de codigo. Escala distinto al resto.

Rutas:
  /orchestrator/*  -> orchestrator_service
  /agent/*         -> agent_runtime_service
"""
from __future__ import annotations

from fastapi import FastAPI

from services.orchestrator_service.app.main import app as orchestrator_app
from services.agent_runtime_service.app.main import app as agent_app

app = FastAPI(title="ScrumDev AI - Brain Bundle", version="1.0.0")

app.mount("/orchestrator", orchestrator_app)
app.mount("/agent", agent_app)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "bundle": "brain", "services": ["orchestrator", "agent_runtime"]}

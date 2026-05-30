"""Connectors bundle - jira, git, deploy.

Conectores a sistemas externos. Intercambiables (la guia §1.2 exige que
cambiar GitHub->GitLab o Jira->Asana sea solo un nuevo adaptador). Agrupados
en un proceso porque son baja carga y comparten naturaleza I/O-bound.

Rutas:
  /jira/*    -> jira_connector_service
  /git/*     -> git_connector_service
  /deploy/*  -> deploy_connector_service
"""
from __future__ import annotations

from fastapi import FastAPI

from services.jira_connector_service.app.main import app as jira_app
from services.git_connector_service.app.main import app as git_app
from services.deploy_connector_service.app.main import app as deploy_app

app = FastAPI(title="ScrumDev AI - Connectors Bundle", version="1.0.0")

app.mount("/jira", jira_app)
app.mount("/git", git_app)
app.mount("/deploy", deploy_app)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "bundle": "connectors", "services": ["jira", "git", "deploy"]}

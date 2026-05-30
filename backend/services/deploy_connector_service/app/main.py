"""Deploy Connector (Render API o stub).

Sin token: mock. Con token: llama Render API para listar y triggear deploys.
"""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from services.deploy_connector_service.app.vercel_client import (
    create_postgres_store,
    create_project_from_git_repo,
    is_configured as vercel_configured,
    latest_deployment,
    list_env_vars,
    set_env_var,
    trigger_deploy as vercel_trigger_deploy,
)
from services.deploy_connector_service.app.render_client import (
    create_web_service as render_create_web_service,
    find_service_by_name as render_find_service,
    is_configured as render_configured,
    latest_deploy as render_latest_deploy,
    set_env_var as render_set_env_var,
    trigger_deploy as render_trigger_deploy,
)
from services.deploy_connector_service.app.neon_client import (
    ensure_project as neon_ensure_project,
    is_configured as neon_configured,
    list_projects as neon_list_projects,
)
from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("deploy-connector-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Deploy Connector", version="0.2.0")
instrument_app(app, "deploy-connector-service")

RENDER_API = "https://api.render.com/v1"


class VercelProjectRequest(BaseModel):
    name: str
    git_owner: str
    git_repo: str
    framework: str = "nextjs"


@app.post("/vercel/projects")
async def vercel_create(req: VercelProjectRequest) -> dict:
    if not vercel_configured():
        raise HTTPException(
            status_code=400,
            detail="Vercel no configurado. Setea VERCEL_TOKEN en .env.",
        )
    result = await create_project_from_git_repo(
        req.name, req.git_owner, req.git_repo, req.framework
    )
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/vercel/status")
async def vercel_status() -> dict:
    return {"configured": vercel_configured()}


@app.get("/vercel/deployments/{project_name}")
async def vercel_latest(project_name: str) -> dict:
    if not vercel_configured():
        raise HTTPException(status_code=400, detail="Vercel no configurado")
    return await latest_deployment(project_name)


class VercelDeployTrigger(BaseModel):
    name: str
    git_owner: str
    git_repo: str
    git_branch: str = "main"
    repo_id: int | None = None


@app.post("/vercel/deploy")
async def vercel_deploy(req: VercelDeployTrigger) -> dict:
    if not vercel_configured():
        raise HTTPException(status_code=400, detail="Vercel no configurado")
    result = await vercel_trigger_deploy(
        req.name, req.git_branch,
        git_owner=req.git_owner, git_repo=req.git_repo, repo_id=req.repo_id,
    )
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


class VercelEnvVarRequest(BaseModel):
    project_id_or_name: str
    key: str
    value: str
    target: list[str] | None = None
    var_type: str = "encrypted"


@app.post("/vercel/env")
async def vercel_set_env(req: VercelEnvVarRequest) -> dict:
    if not vercel_configured():
        raise HTTPException(status_code=400, detail="Vercel no configurado")
    result = await set_env_var(
        req.project_id_or_name, req.key, req.value, req.target, req.var_type
    )
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=result.get("error", "unknown"))
    return result


@app.get("/vercel/env/{project_id_or_name}")
async def vercel_list_env(project_id_or_name: str) -> dict:
    if not vercel_configured():
        raise HTTPException(status_code=400, detail="Vercel no configurado")
    return await list_env_vars(project_id_or_name)


class VercelPostgresRequest(BaseModel):
    name: str
    region: str = "iad1"


# --- Render (fallback) endpoints ---


class RenderServiceRequest(BaseModel):
    name: str
    git_owner: str
    git_repo: str
    branch: str = "main"
    runtime: str = "node"
    build_command: str | None = None
    start_command: str | None = None


@app.get("/render/status")
async def render_status() -> dict:
    return {"configured": render_configured()}


# --- Neon Postgres auto-provision (sin user input) ---


class NeonProvisionRequest(BaseModel):
    name: str
    region: str = "aws-us-east-2"


@app.get("/neon/status")
async def neon_status() -> dict:
    out: dict = {"configured": neon_configured()}
    if neon_configured():
        out["projects_count"] = len(await neon_list_projects())
    return out


@app.post("/neon/projects")
async def neon_provision(req: NeonProvisionRequest) -> dict:
    """Crea (o reusa) un proyecto Neon para el deploy y devuelve connection_uri."""
    if not neon_configured():
        return {
            "ok": False,
            "needs_api_key": True,
            "hint": "Genera una key en https://console.neon.tech/app/settings/api-keys y setea SCRUMDEV_NEON_API_KEY en .env",
        }
    return await neon_ensure_project(req.name, req.region)


@app.post("/render/services")
async def render_create(req: RenderServiceRequest) -> dict:
    if not render_configured():
        raise HTTPException(status_code=400, detail="Render no configurado")
    result = await render_create_web_service(
        req.name,
        req.git_owner,
        req.git_repo,
        branch=req.branch,
        runtime=req.runtime,
        build_command=req.build_command,
        start_command=req.start_command,
    )
    if "error" in result:
        raise HTTPException(status_code=502, detail=result.get("error"))
    return result


class RenderDeployRequest(BaseModel):
    service_id: str
    clear_cache: bool = False


@app.post("/render/deploy")
async def render_deploy(req: RenderDeployRequest) -> dict:
    if not render_configured():
        raise HTTPException(status_code=400, detail="Render no configurado")
    return await render_trigger_deploy(req.service_id, req.clear_cache)


@app.get("/render/services/{name}")
async def render_get(name: str) -> dict:
    if not render_configured():
        raise HTTPException(status_code=400, detail="Render no configurado")
    svc = await render_find_service(name)
    if not svc:
        raise HTTPException(status_code=404, detail="service not found")
    latest = await render_latest_deploy(svc.get("id"))
    return {"service": svc, "latest_deploy": latest}


class RenderEnvRequest(BaseModel):
    service_id: str
    key: str
    value: str


@app.post("/render/env")
async def render_set_env(req: RenderEnvRequest) -> dict:
    if not render_configured():
        raise HTTPException(status_code=400, detail="Render no configurado")
    return await render_set_env_var(req.service_id, req.key, req.value)


@app.post("/vercel/postgres")
async def vercel_provision_postgres(req: VercelPostgresRequest) -> dict:
    if not vercel_configured():
        raise HTTPException(status_code=400, detail="Vercel no configurado")
    result = await create_postgres_store(req.name, req.region)
    if not result.get("ok"):
        return {
            "provisioned": False,
            "needs_manual_url": True,
            "error": result.get("error"),
            "hint": result.get("hint"),
        }
    return {"provisioned": True, "store": result.get("store")}


class DeployRequest(BaseModel):
    service_id: str
    clear_cache: bool = False


def _ok() -> bool:
    return bool(settings.scrumdev_deploy_api_token)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.scrumdev_deploy_api_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "deploy-connector-service",
        "configured": _ok(),
        "provider": settings.scrumdev_deploy_provider or "none",
    }


@app.get("/services")
async def list_services() -> dict:
    if not _ok():
        return {"mock": True, "services": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{RENDER_API}/services", headers=_headers())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"services": response.json()}


@app.post("/deploys")
async def trigger_deploy(req: DeployRequest) -> dict:
    if not _ok():
        return {"mock": True, **req.model_dump()}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{RENDER_API}/services/{req.service_id}/deploys",
            json={"clearCache": "clear" if req.clear_cache else "do_not_clear"},
            headers=_headers(),
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.get("/services/{service_id}/deploys")
async def list_deploys(service_id: str, limit: int = 20) -> dict:
    if not _ok():
        return {"mock": True, "deploys": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{RENDER_API}/services/{service_id}/deploys",
            params={"limit": limit},
            headers=_headers(),
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"deploys": response.json()}

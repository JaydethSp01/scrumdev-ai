from __future__ import annotations

from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.api_gateway.app.auth_middleware import BearerAuthMiddleware
from shared.clients.http import get_json, post_json
from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("api-gateway", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - API Gateway", version="0.2.0")
instrument_app(app, "api-gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Permite cualquier subdominio *.vercel.app (deploys de preview y producción)
    # además de los orígenes exactos. Configurable vía CORS_ORIGIN_REGEX.
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sprint 3: Bearer auth middleware. En dev pasivo (no bloquea, solo decodifica),
# en prod (AUTH_ENFORCE=true) rechaza 401 si no hay token valido.
app.add_middleware(BearerAuthMiddleware, auth_service_url=settings.auth_service_url)


class ChatRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    content: str


class WorkflowRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    message: str
    crew_name: str = "refinement"


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ProjectCreate(BaseModel):
    key: str
    name: str
    description: str | None = None
    owner_id: str | None = None


class TextIn(BaseModel):
    text: str


# Marcador de BUILD: permite verificar AL INSTANTE qué versión de código está viva
# en el contenedor (en vez de inferirlo de un ciclo de 10 min). Subir este valor en
# cada deploy que se quiera confirmar en prod.
BUILD_MARKER = "deaccent-routes-v25"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "api-gateway", "build": BUILD_MARKER}


@app.get("/services/status")
async def services_status() -> dict[str, dict]:
    targets = {
        "conversation": f"{settings.conversation_service_url}/health",
        "orchestrator": f"{settings.orchestrator_service_url}/health",
        "agent_runtime": f"{settings.agent_runtime_service_url}/health",
        "policy": f"{settings.policy_service_url}/health",
        "memory": f"{settings.memory_service_url}/health",
        "audit": f"{settings.audit_service_url}/health",
        "notification": f"{settings.notification_service_url}/health",
        "auth": f"{settings.auth_service_url}/health",
        "user": f"{settings.user_service_url}/health",
        "ml": f"{settings.ml_service_url}/health",
        "jira": f"{settings.jira_connector_service_url}/health",
        "git": f"{settings.git_connector_service_url}/health",
        "deploy": f"{settings.deploy_connector_service_url}/health",
    }
    # F6 quick win: paralelizado con asyncio.gather (antes era secuencial,
    # ~39s en peor caso con 13 servicios x 3s timeout).
    import asyncio as _asyncio

    async def _one(name: str, url: str) -> tuple[str, dict]:
        try:
            return name, await get_json(url, timeout=3.0)
        except Exception as exc:
            return name, {"status": "unreachable", "error": str(exc)}

    results = await _asyncio.gather(*[_one(n, u) for n, u in targets.items()])
    return {name: status for name, status in results}


async def _proxy_post(url: str, payload: dict, timeout: float = 60.0) -> dict:
    import httpx

    try:
        return await post_json(url, payload, timeout=timeout)
    except httpx.HTTPStatusError as exc:
        # Preserva el status code original (404, 409, 400, etc) en lugar de envolver en 502.
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except Exception as exc:
        logger.error("proxy_post_failed", url=url, error=str(exc))
        raise HTTPException(status_code=502, detail=str(exc))


async def _proxy_get(url: str, timeout: float = 10.0) -> dict:
    import httpx

    try:
        return await get_json(url, timeout=timeout)
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except Exception as exc:
        logger.error("proxy_get_failed", url=url, error=str(exc))
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/chat")
async def chat(request: ChatRequest) -> dict:
    return await _proxy_post(
        f"{settings.conversation_service_url}/messages", request.model_dump(), timeout=300.0
    )


@app.post("/workflows/start")
async def start_workflow(request: WorkflowRequest) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/workflows/start",
        request.model_dump(),
        timeout=300.0,
    )


@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> dict:
    return await _proxy_get(f"{settings.orchestrator_service_url}/workflows/{workflow_id}")


@app.post("/auth/register")
async def auth_register(req: RegisterRequest) -> dict:
    return await _proxy_post(f"{settings.auth_service_url}/auth/register", req.model_dump())


@app.post("/auth/login")
async def auth_login(req: LoginRequest) -> dict:
    return await _proxy_post(f"{settings.auth_service_url}/auth/login", req.model_dump())


@app.get("/users/{user_id}")
async def get_user(user_id: str) -> dict:
    return await _proxy_get(f"{settings.user_service_url}/users/{user_id}")


@app.get("/projects")
async def list_projects(owner_id: str | None = None) -> dict:
    suffix = f"?owner_id={owner_id}" if owner_id else ""
    return await _proxy_get(f"{settings.user_service_url}/projects{suffix}")


@app.post("/projects")
async def create_project(req: ProjectCreate) -> dict:
    return await _proxy_post(f"{settings.user_service_url}/projects", req.model_dump())


@app.get("/projects/{key}")
async def get_project(key: str) -> dict:
    return await _proxy_get(f"{settings.user_service_url}/projects/{key}")


@app.get("/agents")
async def list_agents() -> dict:
    return await _proxy_get(f"{settings.agent_runtime_service_url}/agents")


@app.get("/crews")
async def list_crews() -> dict:
    return await _proxy_get(f"{settings.agent_runtime_service_url}/crews")


@app.get("/audit/events")
async def audit_events(limit: int = 50) -> dict:
    return await _proxy_get(f"{settings.audit_service_url}/events?limit={limit}")


@app.get("/events")
async def events_alias(limit: int = 50) -> dict:
    """Alias para que el frontend use /events directo."""
    return await _proxy_get(f"{settings.audit_service_url}/events?limit={limit}")


@app.get("/notifications/{user_id}")
async def notifications(user_id: str, limit: int = 50) -> dict:
    return await _proxy_get(
        f"{settings.notification_service_url}/notifications/{user_id}?limit={limit}"
    )


@app.post("/ml/analyze")
async def ml_analyze(req: TextIn) -> dict:
    return await _proxy_post(
        f"{settings.ml_service_url}/ml/analyze", req.model_dump(), timeout=120.0
    )


@app.post("/ml/classify-story")
async def ml_classify(req: TextIn) -> dict:
    return await _proxy_post(
        f"{settings.ml_service_url}/ml/classify-story", req.model_dump(), timeout=60.0
    )


@app.post("/ml/estimate-effort")
async def ml_effort(req: TextIn) -> dict:
    return await _proxy_post(
        f"{settings.ml_service_url}/ml/estimate-effort", req.model_dump(), timeout=60.0
    )


@app.post("/ml/extract-risks")
async def ml_risks(req: TextIn) -> dict:
    return await _proxy_post(
        f"{settings.ml_service_url}/ml/extract-risks", req.model_dump(), timeout=30.0
    )


@app.get("/policies")
async def policies() -> dict:
    return await _proxy_get(f"{settings.policy_service_url}/policies")


@app.post("/memory/save")
async def memory_save(req: dict[str, Any]) -> dict:
    return await _proxy_post(f"{settings.memory_service_url}/memory/save", req)


@app.post("/memory/search")
async def memory_search(req: dict[str, Any]) -> dict:
    return await _proxy_post(f"{settings.memory_service_url}/memory/search", req)


class NFRRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    nfr_data: dict[str, Any]


class AdvanceWorkflowRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    correlation_id: str | None = None
    target_state: str | None = None
    context: dict[str, Any] = {}


class DecisionRequest(BaseModel):
    decided_by: str
    decision_reason: str | None = None


@app.post("/nfr")
async def submit_nfr(req: NFRRequest) -> dict:
    return await _proxy_post(f"{settings.orchestrator_service_url}/nfr", req.model_dump())


@app.get("/nfr")
async def list_nfr(project_key: str | None = None) -> dict:
    suffix = f"?project_key={project_key}" if project_key else ""
    return await _proxy_get(f"{settings.orchestrator_service_url}/nfr{suffix}")


@app.post("/workflows/advance")
async def advance_workflow(req: AdvanceWorkflowRequest) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/workflows/advance",
        req.model_dump(),
        timeout=300.0,
    )


@app.get("/workflows")
async def list_workflows(project_key: str | None = None, limit: int = 50) -> dict:
    if project_key:
        return await _proxy_get(
            f"{settings.orchestrator_service_url}/workflows?project_key={project_key}&limit={limit}"
        )
    return await _proxy_get(f"{settings.orchestrator_service_url}/workflows?limit={limit}")


@app.get("/decisions/pending")
async def list_pending_decisions(project_key: str | None = None) -> dict:
    suffix = f"?project_key={project_key}" if project_key else ""
    return await _proxy_get(f"{settings.orchestrator_service_url}/decisions/pending{suffix}")


@app.post("/decisions/{decision_id}/approve")
async def approve_decision(decision_id: str, req: DecisionRequest) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/decisions/{decision_id}/approve",
        req.model_dump(),
    )


@app.post("/decisions/{decision_id}/reject")
async def reject_decision(decision_id: str, req: DecisionRequest) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/decisions/{decision_id}/reject",
        req.model_dump(),
    )


@app.post("/adr/generate")
async def adr_generate(req: dict[str, Any]) -> dict:
    return await _proxy_post(
        f"{settings.agent_runtime_service_url}/adr/generate", req, timeout=180.0
    )


@app.post("/policy/evaluate")
async def policy_evaluate(req: dict[str, Any]) -> dict:
    return await _proxy_post(f"{settings.policy_service_url}/policy/evaluate", req)


@app.get("/policies/{name}")
async def get_policy(name: str) -> dict:
    return await _proxy_get(f"{settings.policy_service_url}/policies/{name}")


class VisionPayload(BaseModel):
    project_key: str
    vision: str
    target_users: str | None = None
    stack_preference: str | None = None


class BuildPayload(BaseModel):
    project_key: str
    triggered_by: str
    stack: str | None = None
    max_stories_to_code: int = 5


@app.post("/projects/{project_key}/vision")
async def set_vision(project_key: str, req: VisionPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/vision",
        req.model_dump(),
    )


@app.get("/projects/{project_key}/vision")
async def get_vision(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/vision"
    )


async def _proxy_put(url: str, payload: dict, timeout: float = 30.0) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.put(url, json=payload)
            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


async def _proxy_delete(url: str, timeout: float = 30.0) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.delete(url)
            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/projects/{project_key}/backlog")
async def get_backlog(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/backlog"
    )


@app.get("/projects/{project_key}/templates")
async def get_templates(project_key: str, top_k: int = 6) -> dict:
    # clasifica la visión (LLM) -> timeout amplio
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/templates?top_k={top_k}",
        timeout=45.0,
    )


@app.post("/projects/{project_key}/use-template")
async def use_template_gw(project_key: str, req: dict) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/use-template",
        req, timeout=120.0,
    )


@app.post("/templates/match")
async def templates_match_gw(req: dict) -> dict:
    # rankea plantillas para una visión SIN proyecto (preview pre-creación) -> LLM, timeout amplio
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/templates/match", req, timeout=45.0,
    )


# --- Gestion de tareas por el PO (CRUD estilo Azure DevOps) ---


class GwTaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    story_points: int = 3
    status: str = "backlog"
    sprint_id: str | None = None
    acceptance_criteria: list[str] = []


class GwTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    story_points: int | None = None
    status: str | None = None
    sprint_id: str | None = None
    acceptance_criteria: list[str] | None = None


@app.post("/projects/{project_key}/tasks")
async def gw_create_task(project_key: str, req: GwTaskCreate) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/tasks",
        req.model_dump(),
    )


@app.put("/projects/{project_key}/tasks/{task_id}")
async def gw_update_task(project_key: str, task_id: str, req: GwTaskUpdate) -> dict:
    return await _proxy_put(
        f"{settings.orchestrator_service_url}/projects/{project_key}/tasks/{task_id}",
        req.model_dump(exclude_none=True),
    )


@app.delete("/projects/{project_key}/tasks/{task_id}")
async def gw_delete_task(project_key: str, task_id: str) -> dict:
    return await _proxy_delete(
        f"{settings.orchestrator_service_url}/projects/{project_key}/tasks/{task_id}"
    )


@app.get("/projects/{project_key}/code")
async def get_code(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/code"
    )


@app.post("/projects/{project_key}/build")
async def trigger_build(project_key: str, req: BuildPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/build",
        req.model_dump(),
        timeout=900.0,
    )


@app.get("/projects/{project_key}/builds")
async def list_builds(project_key: str, limit: int = 10) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/builds?limit={limit}"
    )


class AssistantPayload(BaseModel):
    user_id: str
    message: str
    image_paths: list[str] = []
    image_urls: list[str] = []
    session_id: str | None = None


@app.post("/projects/{project_key}/assistant")
async def project_assistant(project_key: str, req: AssistantPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/assistant",
        req.model_dump(),
        timeout=240.0,
    )


# ===== Ciclo de vida: versiones, multi-chat, fix de bugs =====


@app.get("/projects/{project_key}/adrs")
async def gw_list_adrs(project_key: str) -> dict:
    return await _proxy_get(f"{settings.orchestrator_service_url}/projects/{project_key}/adrs")


class GwGenAdr(BaseModel):
    topic: str = ""
    context: str = ""


@app.post("/projects/{project_key}/adrs/generate")
async def gw_gen_adr(project_key: str, req: GwGenAdr) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/adrs/generate",
        req.model_dump(), timeout=130.0,
    )


@app.get("/projects/{project_key}/integrations/jira")
async def gw_get_jira_config(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/integrations/jira"
    )


class GwJiraConfig(BaseModel):
    base_url: str
    email: str
    api_token: str
    project_key_jira: str = ""
    board_id: str = ""


@app.post("/projects/{project_key}/integrations/jira")
async def gw_set_jira_config(project_key: str, req: GwJiraConfig) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/integrations/jira",
        req.model_dump(), timeout=30.0,
    )


@app.get("/projects/{project_key}/versions")
async def gw_list_versions(project_key: str) -> dict:
    return await _proxy_get(f"{settings.orchestrator_service_url}/projects/{project_key}/versions")


class GwCreateVersion(BaseModel):
    name: str = ""
    description: str = ""
    copy_code: bool = True


@app.post("/projects/{project_key}/versions")
async def gw_create_version(project_key: str, req: GwCreateVersion) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/versions",
        req.model_dump(), timeout=60.0,
    )


class GwVersionStatus(BaseModel):
    status: str


@app.post("/projects/{project_key}/versions/{version_id}/status")
async def gw_version_status(project_key: str, version_id: str, req: GwVersionStatus) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/versions/{version_id}/status",
        req.model_dump(),
    )


@app.get("/projects/{project_key}/chats")
async def gw_list_chats(project_key: str, user_id: str = "po") -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/chats?user_id={user_id}"
    )


class GwCreateChat(BaseModel):
    user_id: str = "po"
    title: str = "Nuevo chat"
    kind: str = "general"
    version_id: str | None = None


@app.post("/projects/{project_key}/chats")
async def gw_create_chat(project_key: str, req: GwCreateChat) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/chats", req.model_dump(),
    )


@app.get("/projects/{project_key}/chats/{session_id}/messages")
async def gw_chat_messages(project_key: str, session_id: str, limit: int = 100) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/chats/{session_id}/messages?limit={limit}"
    )


class GwFixBug(BaseModel):
    bug_description: str
    image_paths: list[str] = []
    version_id: str | None = None
    triggered_by: str = "po"


@app.post("/projects/{project_key}/fix-bug")
async def gw_fix_bug(project_key: str, req: GwFixBug) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/fix-bug",
        req.model_dump(), timeout=300.0,
    )


class GwRepairDeploy(BaseModel):
    triggered_by: str = "po"


@app.post("/projects/{project_key}/deploy/repair")
async def gw_repair_deploy(project_key: str, req: GwRepairDeploy) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/deploy/repair",
        req.model_dump(), timeout=60.0,
    )


@app.post("/projects/{project_key}/gate/explain")
async def gw_gate_explain(project_key: str) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/gate/explain",
        {}, timeout=60.0,
    )


@app.post("/projects/{project_key}/summary")
async def gw_executive_summary(project_key: str) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/summary",
        {}, timeout=60.0,
    )


@app.get("/projects/{project_key}/chat")
async def project_chat_history(project_key: str, user_id: str, limit: int = 200) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/chat?user_id={user_id}&limit={limit}"
    )


@app.delete("/projects/{project_key}/chat")
async def project_chat_clear(project_key: str, user_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.delete(
            f"{settings.orchestrator_service_url}/projects/{project_key}/chat",
            params={"user_id": user_id},
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@app.get("/vercel/env/{project_name}")
async def vercel_env_list(project_name: str) -> dict:
    """Proxy: lista env vars de un proyecto Vercel (usado por UI para detectar
    si POSTGRES_URL/DATABASE_URL ya estan seteadas)."""
    return await _proxy_get(
        f"{settings.deploy_connector_service_url}/vercel/env/{project_name}"
    )


@app.get("/render/status")
async def render_status() -> dict:
    return await _proxy_get(f"{settings.deploy_connector_service_url}/render/status")


@app.get("/integrations/status")
async def integrations_status() -> dict:
    """Estado consolidado de todas las integraciones externas."""
    import asyncio as _asyncio

    async def _g(name: str, url: str) -> tuple[str, dict]:
        try:
            return name, await get_json(url, timeout=5.0)
        except Exception as exc:
            return name, {"configured": False, "error": str(exc)}

    targets = {
        "vercel": f"{settings.deploy_connector_service_url}/vercel/status",
        "render": f"{settings.deploy_connector_service_url}/render/status",
        "neon": f"{settings.deploy_connector_service_url}/neon/status",
        "jira": f"{settings.jira_connector_service_url}/health",
        "github": f"{settings.git_connector_service_url}/health",
    }
    results = await _asyncio.gather(*[_g(n, u) for n, u in targets.items()])
    out = {name: data for name, data in results}

    # Detectar OpenAI + Claude desde settings
    out["openai"] = {
        "configured": bool(settings.openai_enabled and settings.openai_api_key),
        "model_fast": settings.openai_model_fast,
        "embedding_model": settings.openai_embedding_model,
    }
    out["claude_code"] = {
        "configured": (settings.scrumdev_ai_provider or "").lower() == "claude_code",
        "model": settings.scrumdev_ai_model,
    }
    out["temporal"] = {"enabled": settings.temporal_enabled, "host": settings.temporal_host}
    out["rabbitmq"] = {"enabled": settings.rabbitmq_enabled, "url": settings.rabbitmq_url}

    return out


# ===== Creacion inteligente: industria/intake/doc =====


@app.get("/intake/industries")
async def gw_industries() -> dict:
    return await _proxy_get(f"{settings.agent_runtime_service_url}/intake/industries")


class IntakeFormPayload(BaseModel):
    industry: str
    product_hint: str = ""


@app.post("/intake/form")
async def gw_intake_form(req: IntakeFormPayload) -> dict:
    return await _proxy_post(
        f"{settings.agent_runtime_service_url}/intake/form", req.model_dump(), timeout=90.0
    )


class IntakeVisionPayload(BaseModel):
    industry: str
    answers: dict
    project_name: str = ""


@app.post("/intake/vision")
async def gw_intake_vision(req: IntakeVisionPayload) -> dict:
    return await _proxy_post(
        f"{settings.agent_runtime_service_url}/intake/vision", req.model_dump(), timeout=90.0
    )


class VisionAssistPayload(BaseModel):
    text: str


@app.post("/intake/vision/assist")
async def gw_vision_assist(req: VisionAssistPayload) -> dict:
    return await _proxy_post(
        f"{settings.agent_runtime_service_url}/intake/vision/assist", req.model_dump(), timeout=60.0
    )


@app.post("/intake/document")
async def gw_intake_document(request: Request) -> dict:
    body = await request.body()
    ct = request.headers.get("content-type", "")
    async with httpx.AsyncClient(timeout=90.0) as client:
        r = await client.post(
            f"{settings.agent_runtime_service_url}/intake/document",
            content=body, headers={"content-type": ct},
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


# ===== FASE C: Pipeline 14 fases proxies =====


@app.get("/projects/{project_key}/pipeline")
async def gw_get_pipeline(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/pipeline"
    )


class AdvancePayload(BaseModel):
    triggered_by: str = "po"
    decided_by: str | None = None
    reason: str | None = None


@app.post("/projects/{project_key}/pipeline/advance")
async def gw_advance_pipeline(project_key: str, req: AdvancePayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/pipeline/advance",
        req.model_dump(), timeout=60.0,
    )


@app.post("/projects/{project_key}/pipeline/approve-gate")
async def gw_approve_gate(project_key: str, req: AdvancePayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/pipeline/approve-gate",
        req.model_dump(), timeout=60.0,
    )


@app.delete("/projects/{project_key}")
async def gw_delete_project(project_key: str) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.delete(
                f"{settings.orchestrator_service_url}/projects/{project_key}"
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get("detail", exc.response.text)
        except Exception:
            detail = exc.response.text
        raise HTTPException(status_code=exc.response.status_code, detail=detail)
    except Exception as exc:
        logger.error("proxy_delete_failed", project=project_key, error=str(exc))
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/projects/{project_key}/pipeline/autorun")
async def gw_pipeline_autorun(project_key: str, req: AdvancePayload) -> dict:
    """CRÍTICO: inicia el ciclo de vida gateado. Sin este proxy, el botón del
    chat daba 404 silencioso y la generación nunca arrancaba."""
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/pipeline/autorun",
        req.model_dump(), timeout=60.0,
    )


@app.get("/projects/{project_key}/refinement")
async def gw_refinement(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/refinement", timeout=30.0
    )


@app.get("/projects/{project_key}/planner")
async def gw_planner(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/planner", timeout=30.0
    )


@app.get("/projects/{project_key}/agent-runs")
async def gw_agent_runs(project_key: str) -> dict:
    # Trazabilidad por agente (panel AgentTracePanel del frontend). Sin este
    # proxy el gateway devolvía 404 y la trazabilidad llegaba vacía al usuario.
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/agent-runs", timeout=30.0
    )


@app.get("/projects/{project_key}/orchestration")
async def gw_orchestration(project_key: str) -> dict:
    # Vista de orquestación en vivo (OrchestrationStudio): pasos + handoffs +
    # agente activo + debug del despliegue, en una sola llamada.
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/orchestration", timeout=30.0
    )


@app.get("/projects/{project_key}/mockups")
async def gw_mockups(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/mockups", timeout=60.0
    )


@app.get("/projects/{project_key}/code-summary")
async def gw_code_summary(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/code-summary", timeout=30.0
    )


class FeedbackPayload(BaseModel):
    title: str
    description: str = ""
    kind: str = "bug"


@app.post("/projects/{project_key}/feedback")
async def gw_feedback(project_key: str, req: FeedbackPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/feedback",
        req.model_dump(), timeout=30.0,
    )


# ===== FASE B: Sprint planning proxies =====


class GwCreateSprint(BaseModel):
    name: str
    goal: str = ""
    version_id: str | None = None


@app.post("/projects/{project_key}/sprints")
async def gw_create_sprint(project_key: str, req: GwCreateSprint) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints",
        req.model_dump(),
    )


@app.post("/projects/{project_key}/sprints/plan")
async def gw_plan_sprints(project_key: str) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints/plan",
        {}, timeout=120.0,
    )


@app.get("/projects/{project_key}/sprints")
async def gw_list_sprints(project_key: str, version_id: str | None = None) -> dict:
    suffix = f"?version_id={version_id}" if version_id else ""
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints{suffix}"
    )


class SprintReorderPayload(BaseModel):
    sprint_ids: list[str]


@app.post("/projects/{project_key}/sprints/reorder")
async def gw_reorder_sprints(project_key: str, req: SprintReorderPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints/reorder",
        req.model_dump(),
    )


class MoveStoryPayload(BaseModel):
    story_key: str
    sprint_id: str | None = None


@app.post("/projects/{project_key}/sprints/move-story")
async def gw_move_story(project_key: str, req: MoveStoryPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints/move-story",
        req.model_dump(),
    )


class SprintStatusPayload(BaseModel):
    status: str


@app.post("/projects/{project_key}/sprints/{sprint_id}/status")
async def gw_sprint_status(project_key: str, sprint_id: str, req: SprintStatusPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints/{sprint_id}/status",
        req.model_dump(),
    )


@app.get("/projects/{project_key}/integrations")
async def project_integrations(project_key: str) -> dict:
    """Estado de integraciones especifico al proyecto: deploy actual, DB,
    issues Jira, decisiones pendientes."""
    import asyncio as _asyncio

    name = project_key.lower().replace("_", "-")

    async def _safe(coro):
        try:
            return await coro
        except Exception as exc:
            return {"error": str(exc)}

    async def _deploy_preview():
        return await get_json(
            f"{settings.orchestrator_service_url}/projects/{project_key}/deploy/preview",
            timeout=8.0,
        )

    async def _env_list():
        return await get_json(
            f"{settings.deploy_connector_service_url}/vercel/env/{name}",
            timeout=8.0,
        )

    async def _decisions():
        return await get_json(
            f"{settings.orchestrator_service_url}/decisions/pending?project_key={project_key}",
            timeout=5.0,
        )

    preview, envs, decisions = await _asyncio.gather(
        _safe(_deploy_preview()), _safe(_env_list()), _safe(_decisions())
    )

    env_keys = set((envs.get("envs") or []) and [e.get("key") for e in envs.get("envs", [])])
    has_db = "POSTGRES_URL" in env_keys or "DATABASE_URL" in env_keys

    return {
        "project_key": project_key,
        "deploy": preview,
        "db_connected": has_db,
        "env_keys_count": len(env_keys),
        "pending_decisions": (decisions.get("decisions") or []) if isinstance(decisions, dict) else [],
    }


@app.get("/render/services/{name}")
async def render_service_get(name: str) -> dict:
    return await _proxy_get(
        f"{settings.deploy_connector_service_url}/render/services/{name}"
    )


@app.post("/webhooks/jira")
async def webhook_jira(request: Request) -> dict:
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() in ("content-type", "x-atlassian-webhook-secret", "x-atlassian-webhook-identifier")
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{settings.jira_connector_service_url}/webhooks/jira",
            content=body,
            headers=headers,
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@app.post("/webhooks/github")
async def webhook_github(request: Request) -> dict:
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() in ("content-type", "x-github-event", "x-hub-signature-256", "x-github-delivery")
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{settings.git_connector_service_url}/webhooks/github",
            content=body,
            headers=headers,
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@app.post("/projects/{project_key}/chat/upload-image")
async def project_chat_upload_image(project_key: str, request: Request) -> dict:
    """Proxy multipart al user_service para que el frontend pueda subir imagenes
    de chat via gateway (mismo origen, sin CORS extra)."""
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{settings.user_service_url}/projects/{project_key}/chat/upload-image",
            content=body,
            headers={"content-type": content_type},
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


class DeployPayload(BaseModel):
    triggered_by: str
    create_vercel_project: bool = True
    framework: str = "nextjs"


@app.post("/projects/{project_key}/deploy")
async def project_deploy(project_key: str, req: DeployPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/deploy",
        req.model_dump(),
        timeout=300.0,
    )


@app.get("/deploy/status")
async def deploy_status() -> dict:
    git = await _proxy_get(f"{settings.git_connector_service_url}/health")
    try:
        vercel = await _proxy_get(f"{settings.deploy_connector_service_url}/vercel/status")
    except Exception:
        vercel = {"configured": False}
    return {
        "github": {"configured": bool(git.get("configured")), "repo": git.get("repo")},
        "vercel": vercel,
    }


@app.get("/projects/{project_key}/deploy/preview")
async def project_deploy_preview(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/deploy/preview"
    )


class PostgresConfigurePayload(BaseModel):
    database_url: str | None = None
    auto_provision: bool = True


@app.post("/projects/{project_key}/postgres/configure")
async def project_postgres_configure(project_key: str, req: PostgresConfigurePayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/postgres/configure",
        req.model_dump(),
        timeout=90.0,
    )


@app.get("/projects/{project_key}/state")
async def project_state(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.orchestrator_service_url}/projects/{project_key}/state"
    )


class SmartBuildPayload(BaseModel):
    triggered_by: str
    force_regenerate: bool = False


@app.post("/projects/{project_key}/smart-build")
async def smart_build(project_key: str, req: SmartBuildPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/smart-build",
        req.model_dump(),
        timeout=30.0,
    )


class GenerateAppPayload(BaseModel):
    triggered_by: str
    replace_existing: bool = True


@app.post("/projects/{project_key}/generate-app")
async def generate_app(project_key: str, req: GenerateAppPayload) -> dict:
    return await _proxy_post(
        f"{settings.orchestrator_service_url}/projects/{project_key}/generate-app",
        req.model_dump(),
        timeout=30.0,
    )


# ===== Brand kit + assets (proxy a user_service) =====


@app.get("/projects/{project_key}/brand-kit")
async def get_brand_kit(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.user_service_url}/projects/{project_key}/brand-kit"
    )


@app.put("/projects/{project_key}/brand-kit")
async def upsert_brand_kit(project_key: str, body: dict[str, Any]) -> dict:
    import httpx

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.put(
            f"{settings.user_service_url}/projects/{project_key}/brand-kit", json=body
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@app.get("/projects/{project_key}/assets")
async def list_assets(project_key: str) -> dict:
    return await _proxy_get(
        f"{settings.user_service_url}/projects/{project_key}/assets"
    )


@app.delete("/projects/{project_key}/assets/{asset_id}")
async def delete_asset(project_key: str, asset_id: str) -> dict:
    import httpx

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.delete(
            f"{settings.user_service_url}/projects/{project_key}/assets/{asset_id}"
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


@app.post("/projects/{project_key}/assets")
async def upload_asset_proxy(project_key: str, request: Request) -> dict:
    """Streaming proxy multipart al user_service."""
    import httpx

    body = await request.body()
    ct = request.headers.get("content-type", "")
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{settings.user_service_url}/projects/{project_key}/assets",
            content=body,
            headers={"content-type": ct} if ct else {},
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

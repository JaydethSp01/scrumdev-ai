from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from services.agent_runtime_service.app.runtime.agent_executor import AgentExecutor
from shared.config.settings import settings
from shared.events.domain_events import DomainEvent
from shared.events.event_bus import event_bus
from shared.events.event_types import (
    AGENT_EXECUTION_COMPLETED,
    AGENT_EXECUTION_FAILED,
    AGENT_EXECUTION_STARTED,
)
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("agent-runtime-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Agent Runtime", version="0.1.0")
instrument_app(app, "agent-runtime-service")

executor = AgentExecutor()


class CrewRunRequest(BaseModel):
    inputs: dict
    correlation_id: str | None = None


@app.on_event("startup")
async def _startup() -> None:
    provider = (settings.scrumdev_ai_provider or "claude_code").lower()
    logger.info("agent_runtime_ready", provider=provider, model=settings.scrumdev_ai_model)
    if provider != "claude_code":
        try:
            from services.agent_runtime_service.app.runtime.bootstrap import get_registry

            registry = get_registry()
            logger.info("agent_registry_ready", agents=registry.list_agents())
        except Exception as exc:
            logger.warning("agent_registry_init_skipped", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "agent-runtime-service",
        "provider": settings.scrumdev_ai_provider,
        "model": settings.scrumdev_ai_model,
    }


@app.get("/agents")
async def list_agents() -> dict[str, list[str] | str]:
    provider = (settings.scrumdev_ai_provider or "claude_code").lower()
    if provider == "claude_code":
        return {
            "provider": provider,
            "agents": [
                "po_agent",
                "architect_agent",
                "developer_agent",
                "qa_agent",
                "security_agent",
            ],
        }
    from services.agent_runtime_service.app.runtime.bootstrap import get_registry

    return {"provider": provider, "agents": get_registry().list_agents()}


@app.get("/crews")
async def list_crews() -> dict[str, list[str]]:
    return {"crews": ["refinement", "architecture", "delivery"]}


class AdrRequest(BaseModel):
    project_key: str
    adr_number: int
    topic: str
    context: str
    nfr_data: dict | None = None


class BacklogRequest(BaseModel):
    project_key: str
    vision: str
    target_users: str | None = None
    stack_preference: str | None = None
    max_stories: int = 12


class CodeRequest(BaseModel):
    project_key: str
    story_title: str
    story_description: str
    acceptance_criteria: list[str] = []
    architecture_context: str | None = None
    stack: str | None = "FastAPI + React"
    max_files: int = 5


class AssistantRequest(BaseModel):
    project_key: str
    message: str
    vision: dict | None = None
    backlog: list[dict] = []
    last_build: dict | None = None
    pending_decisions: list[dict] = []
    image_paths: list[str] = []


@app.post("/assistant/ask")
async def assistant_ask(req: AssistantRequest) -> dict:
    from services.agent_runtime_service.app.runtime.project_assistant import (
        ask_assistant,
    )

    try:
        return await ask_assistant(
            req.project_key,
            req.message,
            req.vision,
            req.backlog,
            req.last_build,
            req.pending_decisions,
            req.image_paths,
        )
    except Exception as exc:
        logger.exception("assistant_failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/backlog/generate")
async def generate_backlog_endpoint(req: BacklogRequest) -> dict:
    from services.agent_runtime_service.app.runtime.backlog_generator import (
        generate_backlog,
    )

    try:
        stories = await generate_backlog(
            req.project_key,
            req.vision,
            req.target_users,
            req.stack_preference,
            req.max_stories,
        )
        return {"stories": stories, "count": len(stories)}
    except Exception as exc:
        logger.exception("backlog_generation_failed")
        raise HTTPException(status_code=500, detail=str(exc))


class FullAppRequest(BaseModel):
    project_key: str
    vision: str
    target_users: str | None = None
    backlog: list[dict] = []
    stack_preference: str | None = None
    brand_kit: dict | None = None
    assets: list[dict] = []
    nfr: dict | None = None


@app.post("/app/generate")
async def generate_full_app_endpoint(req: FullAppRequest) -> dict:
    from services.agent_runtime_service.app.runtime.app_generator import generate_full_app

    try:
        return await generate_full_app(
            req.project_key,
            req.vision,
            req.target_users,
            req.backlog,
            req.stack_preference,
            req.brand_kit,
            req.assets,
            req.nfr,
        )
    except Exception as exc:
        logger.exception("full_app_generation_failed")
        raise HTTPException(status_code=500, detail=str(exc))


class SprintPlanRequest(BaseModel):
    project_key: str
    vision: str
    backlog: list[dict] = []
    sprint_capacity: int = 13


@app.post("/sprints/plan")
async def plan_sprints_endpoint(req: SprintPlanRequest) -> dict:
    """PO Agent agrupa historias en sprints sugeridos. El PO humano ajusta."""
    from services.agent_runtime_service.app.runtime.sprint_planner import plan_sprints

    try:
        sprints = await plan_sprints(
            req.project_key, req.vision, req.backlog, req.sprint_capacity
        )
        return {"sprints": sprints, "count": len(sprints)}
    except Exception as exc:
        logger.exception("sprint_plan_failed")
        raise HTTPException(status_code=500, detail=str(exc))


class ClassifyRequest(BaseModel):
    vision: str
    nfr: dict | None = None


@app.post("/product/classify")
async def classify_product_endpoint(req: ClassifyRequest) -> dict:
    """Clasifica el producto (software real vs estatico) — usado por orchestrator
    para mostrar al PO que se va a construir antes de generar."""
    from services.agent_runtime_service.app.runtime.product_classifier import classify_product

    try:
        return await classify_product(req.vision, req.nfr)
    except Exception as exc:
        logger.exception("classify_failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/code/generate")
async def generate_code_endpoint(req: CodeRequest) -> dict:
    from services.agent_runtime_service.app.runtime.code_generator import (
        generate_code_for_story,
    )

    try:
        return await generate_code_for_story(
            req.project_key,
            req.story_title,
            req.story_description,
            req.acceptance_criteria,
            req.architecture_context,
            req.stack,
            req.max_files,
        )
    except Exception as exc:
        logger.exception("code_generation_failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/adr/generate")
async def generate_adr_endpoint(req: AdrRequest) -> dict:
    from services.agent_runtime_service.app.runtime.adr_generator import generate_adr

    try:
        return await generate_adr(
            req.project_key, req.adr_number, req.topic, req.context, req.nfr_data
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/crews/{crew_name}/run")
async def run_crew(crew_name: str, request: CrewRunRequest) -> dict:
    correlation_id = request.correlation_id or "n/a"
    await event_bus.publish(
        DomainEvent(
            event_type=AGENT_EXECUTION_STARTED,
            source_service="agent-runtime-service",
            correlation_id=correlation_id,
            payload={"crew_name": crew_name, "inputs": request.inputs},
        )
    )
    try:
        output = await executor.run_crew(crew_name, request.inputs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("crew_run_failed", crew=crew_name)
        await event_bus.publish(
            DomainEvent(
                event_type=AGENT_EXECUTION_FAILED,
                source_service="agent-runtime-service",
                correlation_id=correlation_id,
                payload={"crew_name": crew_name, "error": str(exc)},
            )
        )
        return {"success": False, "error": str(exc), "correlation_id": correlation_id}

    await event_bus.publish(
        DomainEvent(
            event_type=AGENT_EXECUTION_COMPLETED,
            source_service="agent-runtime-service",
            correlation_id=correlation_id,
            payload={"crew_name": crew_name},
        )
    )
    return {"success": True, "output": output, "correlation_id": correlation_id}

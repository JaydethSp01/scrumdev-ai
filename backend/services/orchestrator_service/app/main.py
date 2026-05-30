"""Orchestrator Service con state machine completa, NFR, decisions y Temporal opcional."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from services.orchestrator_service.app.build_pipeline import run_build_pipeline
from services.orchestrator_service.app.project_state import diagnose as diagnose_project
from services.orchestrator_service.app.smart_build import (
    execute_smart_build,
    run_smart_build,
)
from services.orchestrator_service.app.state_machine import (
    crew_for_state,
    next_state,
    requires_human_approval,
)
from services.orchestrator_service.app.temporal_client import start_workflow
from shared.clients.http import post_json
from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import (
    BacklogItem,
    BrandKit,
    BuildRun,
    CodeArtifact,
    ChatMessage,
    HumanDecision,
    NFRCapture,
    ProjectAsset,
    ProjectVision,
    Sprint,
    WorkflowRun,
)
from shared.db.session import get_session
from shared.events.domain_events import DomainEvent
from shared.events.event_bus import event_bus
from shared.events.event_types import (
    ARCHITECTURE_PROPOSED,
    HUMAN_APPROVAL_GRANTED,
    HUMAN_APPROVAL_REJECTED,
    HUMAN_APPROVAL_REQUIRED,
    NFR_CAPTURED,
    WORKFLOW_COMPLETED,
    WORKFLOW_STARTED,
    WORKFLOW_STATE_ARCHITECTURE_APPROVAL,
    WORKFLOW_STATE_ARCHITECTURE_INCEPTION,
    WORKFLOW_STATE_FAILED,
    WORKFLOW_STATE_NFR_CAPTURE,
    WORKFLOW_STATE_REFINEMENT,
    WORKFLOW_STATE_RELEASE_APPROVAL,
)
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("orchestrator-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Orchestrator Service", version="0.2.0")
instrument_app(app, "orchestrator-service")


class StartWorkflowRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    message: str
    crew_name: str = "refinement"


class NFRSubmitRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    nfr_data: dict[str, Any]


class DecisionResolveRequest(BaseModel):
    decided_by: str
    decision_reason: str | None = None


class AdvanceRequest(BaseModel):
    user_id: str
    project_key: str
    issue_key: str | None = None
    correlation_id: str | None = None
    target_state: str | None = None
    context: dict[str, Any] = {}


class VisionRequest(BaseModel):
    project_key: str
    vision: str
    target_users: str | None = None
    stack_preference: str | None = None


class BuildRequest(BaseModel):
    project_key: str
    triggered_by: str
    stack: str | None = None
    max_stories_to_code: int = 5


class SmartBuildRequest(BaseModel):
    triggered_by: str
    force_regenerate: bool = False


class GenerateAppRequest(BaseModel):
    triggered_by: str
    replace_existing: bool = True


async def _run_generate_full_app(
    project_key: str, triggered_by: str, replace_existing: bool, build_id: str
) -> None:
    """Pipeline holistico: vision + backlog -> proyecto Next.js+FastAPI completo.

    FASE B: si hay un sprint ACTIVO, genera solo las historias de ese sprint
    (entrega incremental). Si no hay sprint activo, genera todo el backlog.
    """
    try:
        active_sprint_name = None
        async for session in get_session():
            v_res = await session.execute(
                select(ProjectVision).where(ProjectVision.project_key == project_key)
            )
            vision = v_res.scalar_one_or_none()
            if not vision:
                raise ValueError("project_vision_missing")

            # buscar sprint activo
            active = (await session.execute(
                select(Sprint).where(
                    Sprint.project_key == project_key, Sprint.status == "active"
                )
            )).scalar_one_or_none()

            b_stmt = (
                select(BacklogItem)
                .where(BacklogItem.project_key == project_key)
                .order_by(BacklogItem.order_index)
            )
            if active:
                b_stmt = b_stmt.where(BacklogItem.sprint_id == active.id)
                active_sprint_name = f"Sprint {active.number}: {active.name}"

            backlog = [
                {
                    "story_key": i.story_key,
                    "title": i.title,
                    "description": i.description,
                    "priority": i.priority,
                    "story_points": i.story_points,
                }
                for i in (await session.execute(b_stmt)).scalars().all()
            ]
            # si el sprint activo no tiene historias, caer a todo el backlog
            if active and not backlog:
                backlog = [
                    {"story_key": i.story_key, "title": i.title, "description": i.description,
                     "priority": i.priority, "story_points": i.story_points}
                    for i in (await session.execute(
                        select(BacklogItem).where(BacklogItem.project_key == project_key)
                        .order_by(BacklogItem.order_index)
                    )).scalars().all()
                ]
                active_sprint_name = None
            break

        if active_sprint_name:
            logger.info("generating_for_active_sprint", project=project_key, sprint=active_sprint_name, stories=len(backlog))

        async for session in get_session():
            run = await session.get(BuildRun, build_id)
            if run:
                run.stage = "generating_app"
                run.progress_percent = 30
                await session.commit()
            break

        # Cargar brand_kit + assets del cliente para personalizar generacion
        brand_kit_dict: dict | None = None
        assets_list: list[dict] = []
        async for s2 in get_session():
            bk_res = await s2.execute(
                select(BrandKit).where(BrandKit.project_key == project_key)
            )
            bk = bk_res.scalar_one_or_none()
            if bk:
                brand_kit_dict = {
                    "primary_color": bk.primary_color,
                    "secondary_color": bk.secondary_color,
                    "accent_color": bk.accent_color,
                    "background_color": bk.background_color,
                    "text_color": bk.text_color,
                    "font_family": bk.font_family,
                    "logo_url": bk.logo_url,
                    "tone": bk.tone,
                    "industry": bk.industry,
                }
            a_res = await s2.execute(
                select(ProjectAsset).where(ProjectAsset.project_key == project_key)
            )
            assets_list = [
                {
                    "asset_type": a.asset_type,
                    "name": a.name,
                    "url": a.url,
                    "alt_text": a.alt_text,
                }
                for a in a_res.scalars().all()
            ]
            break

        resp = await post_json(
            f"{settings.agent_runtime_service_url}/app/generate",
            {
                "project_key": project_key,
                "vision": vision.vision,
                "target_users": vision.target_users,
                "backlog": backlog,
                "stack_preference": vision.stack_preference,
                "brand_kit": brand_kit_dict,
                "assets": assets_list,
            },
            timeout=600.0,
        )
        files = resp.get("files", [])

        async for session in get_session():
            if replace_existing:
                existing = await session.execute(
                    select(CodeArtifact).where(CodeArtifact.project_key == project_key)
                )
                for a in existing.scalars().all():
                    await session.delete(a)
                await session.commit()
            for f in files:
                session.add(
                    CodeArtifact(
                        project_key=project_key,
                        story_id=None,
                        file_path=f.get("path", "unknown"),
                        language=f.get("language", "text"),
                        content=f.get("content", ""),
                    )
                )
            # Marcar TODAS las stories del backlog como done — el generate-app
            # holistico produce un proyecto que CUBRE todas las historias en un
            # solo pase (la guia Delfin lo trata como MVP completo).
            stories_res = await session.execute(
                select(BacklogItem).where(BacklogItem.project_key == project_key)
            )
            stories_marked = 0
            for story in stories_res.scalars().all():
                if story.status != "done":
                    story.status = "done"
                    stories_marked += 1
            await session.commit()
            run = await session.get(BuildRun, build_id)
            if run:
                run.stage = "completed"
                run.progress_percent = 100
                run.summary = {
                    "stack": resp.get("stack"),
                    "summary": resp.get("summary"),
                    "routes": resp.get("routes", []),
                    "code_files_generated": len(files),
                    "stories_marked_done": stories_marked,
                }
                run.completed_at = datetime.now(timezone.utc)
                await session.commit()
            break

        await event_bus.publish(
            DomainEvent(
                event_type="FULL_APP_GENERATED",
                source_service="orchestrator-service",
                correlation_id=build_id,
                project_key=project_key,
                payload={"files": len(files), "stack": resp.get("stack")},
            )
        )
    except Exception as exc:
        logger.exception("generate_app_failed")
        async for session in get_session():
            run = await session.get(BuildRun, build_id)
            if run:
                run.stage = "failed"
                run.error = str(exc)
                run.completed_at = datetime.now(timezone.utc)
                await session.commit()
            break


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "orchestrator-service",
        "temporal_enabled": settings.temporal_enabled,
    }


async def _persist_run(run: WorkflowRun) -> None:
    async for session in get_session():
        session.add(run)
        await session.commit()


async def _update_run(workflow_id: str, **fields) -> None:
    async for session in get_session():
        run = await session.get(WorkflowRun, workflow_id)
        if run is None:
            return
        for key, value in fields.items():
            setattr(run, key, value)
        await session.commit()


async def _execute_crew(crew_name: str, inputs: dict, correlation_id: str) -> dict:
    """Ejecuta un crew via Temporal si esta habilitado, sino HTTP directo."""
    if settings.temporal_enabled:
        result = await start_workflow(crew_name, inputs, correlation_id)
        if result is not None:
            crew_result = result.get("crew_result", {})
            return {
                "success": crew_result.get("success", True),
                "output": crew_result.get("output"),
                "error": crew_result.get("error"),
                "via": "temporal",
            }
    response = await post_json(
        f"{settings.agent_runtime_service_url}/crews/{crew_name}/run",
        {"inputs": inputs, "correlation_id": correlation_id},
        timeout=300.0,
    )
    response["via"] = "http"
    return response


@app.post("/workflows/start")
async def start_workflow_endpoint(request: StartWorkflowRequest) -> dict:
    correlation_id = str(uuid4())
    workflow_id = str(uuid4())

    run = WorkflowRun(
        id=workflow_id,
        correlation_id=correlation_id,
        project_key=request.project_key,
        issue_key=request.issue_key,
        crew_name=request.crew_name,
        status="running",
        inputs=request.model_dump(),
    )
    try:
        await _persist_run(run)
    except Exception as exc:
        logger.warning("persistence_unavailable", error=str(exc))

    await event_bus.publish(
        DomainEvent(
            event_type=WORKFLOW_STARTED,
            source_service="orchestrator-service",
            correlation_id=correlation_id,
            project_key=request.project_key,
            issue_key=request.issue_key,
            payload={"workflow_id": workflow_id, "crew_name": request.crew_name},
        )
    )

    crew_input = {
        "story": request.message,
        "project_key": request.project_key,
        "issue_key": request.issue_key,
        "user_id": request.user_id,
    }

    try:
        runtime_response = await _execute_crew(request.crew_name, crew_input, correlation_id)
    except Exception as exc:
        logger.error("crew_execution_failed", error=str(exc))
        try:
            await _update_run(workflow_id, status="failed", error=str(exc))
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=str(exc))

    success = runtime_response.get("success", False)
    output = runtime_response.get("output")
    error = runtime_response.get("error")

    try:
        await _update_run(
            workflow_id,
            status="completed" if success else "failed",
            result={"output": output, "via": runtime_response.get("via")} if output else None,
            error=error,
        )
    except Exception as exc:
        logger.warning("persistence_unavailable", error=str(exc))

    await event_bus.publish(
        DomainEvent(
            event_type=WORKFLOW_COMPLETED,
            source_service="orchestrator-service",
            correlation_id=correlation_id,
            project_key=request.project_key,
            issue_key=request.issue_key,
            payload={"workflow_id": workflow_id, "success": success},
        )
    )

    return {
        "success": success,
        "workflow_id": workflow_id,
        "correlation_id": correlation_id,
        "result": {"output": output, "via": runtime_response.get("via")} if output else None,
        "error": error,
    }


@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> dict:
    async for session in get_session():
        run = await session.get(WorkflowRun, workflow_id)
        if run is None:
            raise HTTPException(status_code=404, detail="workflow not found")
        return {
            "workflow_id": run.id,
            "correlation_id": run.correlation_id,
            "project_key": run.project_key,
            "issue_key": run.issue_key,
            "crew_name": run.crew_name,
            "status": run.status,
            "inputs": run.inputs,
            "result": run.result,
            "error": run.error,
            "created_at": run.created_at.isoformat(),
            "updated_at": run.updated_at.isoformat(),
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/workflows")
async def list_workflows(project_key: str | None = None, limit: int = 50) -> dict:
    async for session in get_session():
        stmt = select(WorkflowRun).order_by(WorkflowRun.created_at.desc()).limit(limit)
        if project_key:
            stmt = stmt.where(WorkflowRun.project_key == project_key)
        result = await session.execute(stmt)
        return {
            "workflows": [
                {
                    "workflow_id": r.id,
                    "correlation_id": r.correlation_id,
                    "project_key": r.project_key,
                    "issue_key": r.issue_key,
                    "crew_name": r.crew_name,
                    "status": r.status,
                    "created_at": r.created_at.isoformat(),
                    "updated_at": r.updated_at.isoformat(),
                }
                for r in result.scalars().all()
            ]
        }
    return {"workflows": []}


@app.post("/nfr")
async def submit_nfr(req: NFRSubmitRequest) -> dict:
    async for session in get_session():
        nfr = NFRCapture(
            project_key=req.project_key,
            issue_key=req.issue_key,
            user_id=req.user_id,
            nfr_data=req.nfr_data,
        )
        session.add(nfr)
        await session.commit()
        await session.refresh(nfr)

        await event_bus.publish(
            DomainEvent(
                event_type=NFR_CAPTURED,
                source_service="orchestrator-service",
                correlation_id=nfr.id,
                project_key=req.project_key,
                issue_key=req.issue_key,
                payload={"nfr_id": nfr.id, "user_id": req.user_id},
            )
        )

        return {
            "nfr_id": nfr.id,
            "next_state": WORKFLOW_STATE_ARCHITECTURE_INCEPTION,
            "advance_with": "/workflows/advance",
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/nfr")
async def list_nfr(project_key: str | None = None) -> dict:
    async for session in get_session():
        stmt = select(NFRCapture).order_by(NFRCapture.created_at.desc())
        if project_key:
            stmt = stmt.where(NFRCapture.project_key == project_key)
        result = await session.execute(stmt)
        return {
            "nfrs": [
                {
                    "id": n.id,
                    "project_key": n.project_key,
                    "issue_key": n.issue_key,
                    "user_id": n.user_id,
                    "nfr_data": n.nfr_data,
                    "created_at": n.created_at.isoformat(),
                }
                for n in result.scalars().all()
            ]
        }
    return {"nfrs": []}


@app.post("/workflows/advance")
async def advance_workflow(req: AdvanceRequest) -> dict:
    """Avanza la state machine para la historia indicada.

    Si el estado requiere aprobacion humana, crea un HumanDecision y devuelve
    el id para que el frontend lo muestre en su panel.
    """
    correlation_id = req.correlation_id or str(uuid4())
    target_state = req.target_state

    current_state = WORKFLOW_STATE_REFINEMENT
    if target_state is None:
        target_state = next_state(current_state)

    if requires_human_approval(target_state):
        async for session in get_session():
            decision = HumanDecision(
                correlation_id=correlation_id,
                project_key=req.project_key,
                issue_key=req.issue_key,
                decision_type=target_state,
                title=f"Aprobacion requerida: {target_state}",
                description=f"Workflow en {target_state}. Aprueba para continuar.",
                context=req.context,
                status="pending",
            )
            session.add(decision)
            await session.commit()
            await session.refresh(decision)

            await event_bus.publish(
                DomainEvent(
                    event_type=HUMAN_APPROVAL_REQUIRED,
                    source_service="orchestrator-service",
                    correlation_id=correlation_id,
                    project_key=req.project_key,
                    issue_key=req.issue_key,
                    payload={"decision_id": decision.id, "state": target_state},
                )
            )

            return {
                "state": target_state,
                "pending_decision_id": decision.id,
                "requires_human_approval": True,
            }
        raise HTTPException(status_code=503, detail="database unavailable")

    crew_name = crew_for_state(target_state)
    if crew_name:
        crew_input = {
            "story": req.context.get("story", ""),
            "project_key": req.project_key,
            "issue_key": req.issue_key,
            "user_id": req.user_id,
        }
        if target_state == WORKFLOW_STATE_ARCHITECTURE_INCEPTION:
            crew_input["requirements"] = req.context.get(
                "requirements", req.context.get("story", "")
            )
        try:
            runtime_response = await _execute_crew(crew_name, crew_input, correlation_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        if target_state == WORKFLOW_STATE_ARCHITECTURE_INCEPTION:
            await event_bus.publish(
                DomainEvent(
                    event_type=ARCHITECTURE_PROPOSED,
                    source_service="orchestrator-service",
                    correlation_id=correlation_id,
                    project_key=req.project_key,
                    issue_key=req.issue_key,
                    payload={"output_preview": (runtime_response.get("output") or "")[:200]},
                )
            )

        return {
            "state": target_state,
            "executed_crew": crew_name,
            "output": runtime_response.get("output"),
            "via": runtime_response.get("via"),
            "next_state": next_state(target_state),
        }

    return {"state": target_state, "next_state": next_state(target_state)}


@app.post("/projects/{project_key}/vision")
async def set_vision(project_key: str, req: VisionRequest) -> dict:
    if req.project_key != project_key:
        raise HTTPException(status_code=400, detail="project_key mismatch")
    async for session in get_session():
        existing = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        v = existing.scalar_one_or_none()
        if v:
            v.vision = req.vision
            v.target_users = req.target_users
            v.stack_preference = req.stack_preference
        else:
            v = ProjectVision(
                project_key=project_key,
                vision=req.vision,
                target_users=req.target_users,
                stack_preference=req.stack_preference,
            )
            session.add(v)
        await session.commit()
        await session.refresh(v)
        return {
            "id": v.id,
            "project_key": v.project_key,
            "vision": v.vision,
            "target_users": v.target_users,
            "stack_preference": v.stack_preference,
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/projects/{project_key}/vision")
async def get_vision(project_key: str) -> dict:
    async for session in get_session():
        result = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        v = result.scalar_one_or_none()
        if not v:
            raise HTTPException(status_code=404, detail="vision not set")
        return {
            "id": v.id,
            "project_key": v.project_key,
            "vision": v.vision,
            "target_users": v.target_users,
            "stack_preference": v.stack_preference,
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/projects/{project_key}/backlog")
async def list_backlog(project_key: str) -> dict:
    async for session in get_session():
        result = await session.execute(
            select(BacklogItem)
            .where(BacklogItem.project_key == project_key)
            .order_by(BacklogItem.order_index.asc())
        )
        items = result.scalars().all()
        return {
            "items": [
                {
                    "id": i.id,
                    "story_key": i.story_key,
                    "title": i.title,
                    "description": i.description,
                    "acceptance_criteria": i.acceptance_criteria,
                    "story_points": i.story_points,
                    "priority": i.priority,
                    "status": i.status,
                    "order_index": i.order_index,
                    "sprint_id": i.sprint_id,
                    "created_at": i.created_at.isoformat(),
                }
                for i in items
            ]
        }
    return {"items": []}


# ===== FASE C: Pipeline de 14 fases + 4 aprobaciones humanas (guia §7) =====

from shared.db.models import Project as _Project  # noqa: E402


@app.get("/projects/{project_key}/pipeline")
async def get_pipeline(project_key: str) -> dict:
    """Devuelve las 14 fases con el estado actual del proyecto."""
    from services.orchestrator_service.app.project_pipeline import build_pipeline_view

    async for session in get_session():
        proj = (await session.execute(
            select(_Project).where(_Project.key == project_key)
        )).scalar_one_or_none()
        state = proj.workflow_state if proj else "BACKLOG"
        # decisiones pendientes para mostrar en el gate
        pending = (await session.execute(
            select(HumanDecision).where(
                HumanDecision.project_key == project_key,
                HumanDecision.status == "pending",
            )
        )).scalars().all()
        view = build_pipeline_view(state)
        view["pending_decisions"] = [
            {"id": d.id, "decision_type": d.decision_type, "title": d.title}
            for d in pending
        ]
        return view
    from services.orchestrator_service.app.project_pipeline import build_pipeline_view as _bpv
    return _bpv("BACKLOG")


class AdvancePhaseRequest(BaseModel):
    triggered_by: str = "po"
    decided_by: str | None = None
    reason: str | None = None


@app.post("/projects/{project_key}/pipeline/advance")
async def advance_pipeline(project_key: str, req: AdvancePhaseRequest) -> dict:
    """Avanza el proyecto a la siguiente fase. Si la fase ACTUAL es un gate
    de aprobacion humana, crea la decision pendiente y NO avanza hasta aprobar.
    Si ya hay aprobacion (o no es gate), avanza."""
    from services.orchestrator_service.app.project_pipeline import (
        build_pipeline_view, is_human_gate, next_phase, _PHASE_BY_STATE,
    )

    async for session in get_session():
        proj = (await session.execute(
            select(_Project).where(_Project.key == project_key)
        )).scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="project not found")

        current = proj.workflow_state
        meta = _PHASE_BY_STATE.get(current, {})

        # Si la fase actual es un gate humano, requiere aprobacion previa
        if is_human_gate(current):
            # buscar decision aprobada para este gate
            decision_type = f"gate_{meta.get('gate_n','x')}_{current}"
            approved = (await session.execute(
                select(HumanDecision).where(
                    HumanDecision.project_key == project_key,
                    HumanDecision.decision_type == decision_type,
                    HumanDecision.status == "approved",
                )
            )).scalar_one_or_none()
            if not approved:
                # crear decision pendiente si no existe
                existing = (await session.execute(
                    select(HumanDecision).where(
                        HumanDecision.project_key == project_key,
                        HumanDecision.decision_type == decision_type,
                        HumanDecision.status == "pending",
                    )
                )).scalar_one_or_none()
                if not existing:
                    from uuid import uuid4 as _uuid
                    d = HumanDecision(
                        correlation_id=str(_uuid()),
                        project_key=project_key,
                        decision_type=decision_type,
                        title=f"{meta.get('label','Aprobacion')} (Gate #{meta.get('gate_n')})",
                        description=meta.get("desc", ""),
                        context={"phase": current},
                        status="pending",
                    )
                    session.add(d)
                    await session.commit()
                    await event_bus.publish(DomainEvent(
                        event_type=HUMAN_APPROVAL_REQUIRED,
                        source_service="orchestrator-service",
                        correlation_id=d.correlation_id,
                        project_key=project_key,
                        payload={"decision_id": d.id, "gate": meta.get("gate_n"), "phase": current},
                    ))
                return {
                    "advanced": False,
                    "blocked_by_gate": True,
                    "gate_n": meta.get("gate_n"),
                    "message": f"Esta fase requiere tu aprobacion (Gate #{meta.get('gate_n')}). Aprueba para continuar.",
                    "pipeline": build_pipeline_view(current),
                }

        # Avanzar
        nxt = next_phase(current)
        if not nxt:
            return {"advanced": False, "message": "Ya esta en RELEASED",
                    "pipeline": build_pipeline_view(current)}
        proj.workflow_state = nxt
        await session.commit()
        await event_bus.publish(DomainEvent(
            event_type="WORKFLOW_PHASE_ADVANCED",
            source_service="orchestrator-service",
            correlation_id=str(uuid4()),
            project_key=project_key,
            payload={"from": current, "to": nxt},
        ))
        break

    # FASE 79: disparar la accion REAL asociada a la nueva fase (fire-and-forget)
    from services.orchestrator_service.app.project_pipeline import action_for
    action = action_for(nxt)
    action_status = None
    if action:
        asyncio.create_task(_run_phase_action(project_key, nxt, action, req.triggered_by))
        action_status = f"Ejecutando: {action}"

    return {"advanced": True, "from": current, "to": nxt,
            "action": action, "action_status": action_status,
            "pipeline": build_pipeline_view(nxt)}


async def _run_phase_action(project_key: str, phase: str, action: str, triggered_by: str) -> None:
    """Ejecuta el trabajo real de cada fase del pipeline (fire-and-forget).

    Conecta el pipeline a los agentes/servicios reales:
    - generate_backlog -> PO Agent
    - propose_architecture -> Architect Agent (via agent_runtime)
    - plan_sprints -> sprint planner
    - generate_code -> generate_full_app (del sprint activo)
    - run_policy_check -> policy_service
    - deploy_staging/production -> deploy
    """
    try:
        logger.info("phase_action_start", project=project_key, phase=phase, action=action)
        if action == "generate_backlog":
            # disparar smart-build que genera backlog si no existe
            try:
                bid = await run_smart_build(project_key, triggered_by, False)
                asyncio.create_task(execute_smart_build(project_key, bid, "generate_backlog"))
            except Exception:
                pass
        elif action == "plan_sprints":
            # planificar sprints automaticamente
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    await client.post(
                        f"{settings.orchestrator_service_url}/projects/{project_key}/sprints/plan"
                    )
            except Exception:
                pass
        elif action == "generate_code":
            # generar codigo (del sprint activo si hay)
            async for session in get_session():
                run = BuildRun(
                    project_key=project_key, triggered_by=triggered_by,
                    stage="queued (pipeline DEVELOPMENT)", progress_percent=5,
                    summary={"action": "generate_full_app", "phase": phase},
                )
                session.add(run)
                await session.commit()
                await session.refresh(run)
                bid = run.id
                break
            asyncio.create_task(_run_generate_full_app(project_key, triggered_by, True, bid))
        elif action == "run_policy_check":
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    await client.post(
                        f"{settings.policy_service_url}/evaluate",
                        json={"project_key": project_key, "stage": "post-coding", "context": {}},
                    )
            except Exception:
                pass
        # deploy_staging / deploy_production: el usuario los dispara desde el tab Deploy
        logger.info("phase_action_done", project=project_key, action=action)
    except Exception as exc:
        logger.warning("phase_action_failed", project=project_key, action=action, error=str(exc))


@app.post("/projects/{project_key}/pipeline/approve-gate")
async def approve_current_gate(project_key: str, req: AdvancePhaseRequest) -> dict:
    """Aprueba el gate de la fase actual y avanza automaticamente."""
    from services.orchestrator_service.app.project_pipeline import (
        is_human_gate, _PHASE_BY_STATE,
    )

    async for session in get_session():
        proj = (await session.execute(
            select(_Project).where(_Project.key == project_key)
        )).scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="project not found")
        current = proj.workflow_state
        if not is_human_gate(current):
            raise HTTPException(status_code=400, detail="la fase actual no es un gate")
        meta = _PHASE_BY_STATE.get(current, {})
        decision_type = f"gate_{meta.get('gate_n','x')}_{current}"
        # marcar pending como approved (o crear approved)
        pend = (await session.execute(
            select(HumanDecision).where(
                HumanDecision.project_key == project_key,
                HumanDecision.decision_type == decision_type,
                HumanDecision.status == "pending",
            )
        )).scalar_one_or_none()
        if pend:
            pend.status = "approved"
            pend.decided_by = req.decided_by or "po"
            pend.decision_reason = req.reason
            pend.decided_at = datetime.now(timezone.utc)
        else:
            from uuid import uuid4 as _uuid
            d = HumanDecision(
                correlation_id=str(_uuid()), project_key=project_key,
                decision_type=decision_type,
                title=f"{meta.get('label')} (Gate #{meta.get('gate_n')})",
                description=meta.get("desc", ""), context={"phase": current},
                status="approved", decided_by=req.decided_by or "po",
                decided_at=datetime.now(timezone.utc),
            )
            session.add(d)
        await session.commit()
        await event_bus.publish(DomainEvent(
            event_type=HUMAN_APPROVAL_GRANTED,
            source_service="orchestrator-service",
            correlation_id=str(uuid4()),
            project_key=project_key,
            payload={"gate": meta.get("gate_n"), "phase": current},
        ))
        break

    # ahora avanzar
    return await advance_pipeline(project_key, req)


# ===== FASE B: Sprint planning (el PO decide) =====


@app.post("/projects/{project_key}/sprints/plan")
async def plan_project_sprints(project_key: str) -> dict:
    """PO Agent agrupa el backlog en sprints sugeridos y los persiste.
    El PO humano luego ajusta (reordenar, mover historias, activar)."""
    # cargar vision + backlog
    vision_txt = ""
    backlog: list[dict] = []
    async for session in get_session():
        v = (await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )).scalar_one_or_none()
        vision_txt = v.vision if v else ""
        rows = (await session.execute(
            select(BacklogItem).where(BacklogItem.project_key == project_key)
            .order_by(BacklogItem.order_index)
        )).scalars().all()
        backlog = [
            {"story_key": r.story_key, "title": r.title, "story_points": r.story_points,
             "priority": r.priority}
            for r in rows
        ]
        break

    if not backlog:
        raise HTTPException(status_code=400, detail="No hay backlog. Genera historias primero.")

    # llamar al PO Agent planner
    try:
        resp = await post_json(
            f"{settings.agent_runtime_service_url}/sprints/plan",
            {"project_key": project_key, "vision": vision_txt, "backlog": backlog},
            timeout=90.0,
        )
        suggested = resp.get("sprints", [])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"planner failed: {exc}")

    # persistir: borrar sprints previos, crear nuevos, asignar historias
    async for session in get_session():
        from sqlalchemy import delete as sa_delete
        await session.execute(sa_delete(Sprint).where(Sprint.project_key == project_key))
        # reset sprint_id de historias
        rows = (await session.execute(
            select(BacklogItem).where(BacklogItem.project_key == project_key)
        )).scalars().all()
        by_key = {r.story_key: r for r in rows}
        for r in rows:
            r.sprint_id = None
        created = []
        for s in suggested:
            sp = Sprint(
                project_key=project_key,
                number=s.get("number", 1),
                name=s.get("name", f"Sprint {s.get('number',1)}"),
                goal=s.get("goal", ""),
                order_index=s.get("order_index", 0),
                total_points=s.get("total_points", 0),
                status="planned",
            )
            session.add(sp)
            await session.flush()  # obtener sp.id
            for k in s.get("story_keys", []):
                if k in by_key:
                    by_key[k].sprint_id = sp.id
            created.append({"id": sp.id, "number": sp.number, "name": sp.name,
                            "goal": sp.goal, "story_keys": s.get("story_keys", []),
                            "total_points": sp.total_points})
        await session.commit()
        break

    return {"sprints": created, "count": len(created)}


@app.get("/projects/{project_key}/sprints")
async def list_sprints(project_key: str) -> dict:
    async for session in get_session():
        sprints = (await session.execute(
            select(Sprint).where(Sprint.project_key == project_key)
            .order_by(Sprint.order_index.asc())
        )).scalars().all()
        items = (await session.execute(
            select(BacklogItem).where(BacklogItem.project_key == project_key)
        )).scalars().all()
        by_sprint: dict[str, list] = {}
        for it in items:
            if it.sprint_id:
                by_sprint.setdefault(it.sprint_id, []).append({
                    "story_key": it.story_key, "title": it.title,
                    "story_points": it.story_points, "status": it.status,
                })
        unassigned = [
            {"story_key": it.story_key, "title": it.title, "story_points": it.story_points,
             "status": it.status}
            for it in items if not it.sprint_id
        ]
        return {
            "sprints": [
                {
                    "id": s.id, "number": s.number, "name": s.name, "goal": s.goal,
                    "order_index": s.order_index, "status": s.status,
                    "total_points": s.total_points,
                    "stories": by_sprint.get(s.id, []),
                }
                for s in sprints
            ],
            "unassigned": unassigned,
        }
    return {"sprints": [], "unassigned": []}


class SprintReorderRequest(BaseModel):
    sprint_ids: list[str]  # orden nuevo


@app.post("/projects/{project_key}/sprints/reorder")
async def reorder_sprints(project_key: str, req: SprintReorderRequest) -> dict:
    """El PO decide el orden de ejecucion de los sprints."""
    async for session in get_session():
        for idx, sid in enumerate(req.sprint_ids):
            sp = await session.get(Sprint, sid)
            if sp and sp.project_key == project_key:
                sp.order_index = idx
        await session.commit()
        break
    return {"ok": True, "order": req.sprint_ids}


class MoveStoryRequest(BaseModel):
    story_key: str
    sprint_id: str | None = None  # null = mover a backlog sin asignar


@app.post("/projects/{project_key}/sprints/move-story")
async def move_story_to_sprint(project_key: str, req: MoveStoryRequest) -> dict:
    """El PO mueve una historia entre sprints (o al backlog)."""
    async for session in get_session():
        story = (await session.execute(
            select(BacklogItem).where(
                BacklogItem.project_key == project_key,
                BacklogItem.story_key == req.story_key,
            )
        )).scalar_one_or_none()
        if not story:
            raise HTTPException(status_code=404, detail="story not found")
        story.sprint_id = req.sprint_id
        await session.commit()
        # recalcular puntos de sprints afectados
        await _recalc_sprint_points(session, project_key)
        break
    return {"ok": True, "story_key": req.story_key, "sprint_id": req.sprint_id}


class SprintStatusRequest(BaseModel):
    status: str  # planned | active | completed | cancelled


@app.post("/projects/{project_key}/sprints/{sprint_id}/status")
async def set_sprint_status(project_key: str, sprint_id: str, req: SprintStatusRequest) -> dict:
    """El PO activa/completa un sprint. Solo 1 sprint activo a la vez."""
    if req.status not in ("planned", "active", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="status invalido")
    async for session in get_session():
        sp = await session.get(Sprint, sprint_id)
        if not sp or sp.project_key != project_key:
            raise HTTPException(status_code=404, detail="sprint not found")
        if req.status == "active":
            # desactivar otros activos
            others = (await session.execute(
                select(Sprint).where(
                    Sprint.project_key == project_key, Sprint.status == "active"
                )
            )).scalars().all()
            for o in others:
                if o.id != sprint_id:
                    o.status = "planned"
        sp.status = req.status
        await session.commit()
        break
    return {"ok": True, "sprint_id": sprint_id, "status": req.status}


async def _recalc_sprint_points(session, project_key: str) -> None:
    sprints = (await session.execute(
        select(Sprint).where(Sprint.project_key == project_key)
    )).scalars().all()
    items = (await session.execute(
        select(BacklogItem).where(BacklogItem.project_key == project_key)
    )).scalars().all()
    for sp in sprints:
        sp.total_points = sum(it.story_points for it in items if it.sprint_id == sp.id)
    await session.commit()


@app.get("/projects/{project_key}/code")
async def list_code(project_key: str) -> dict:
    async for session in get_session():
        result = await session.execute(
            select(CodeArtifact)
            .where(CodeArtifact.project_key == project_key)
            .order_by(CodeArtifact.created_at.desc())
        )
        items = result.scalars().all()
        return {
            "files": [
                {
                    "id": a.id,
                    "story_id": a.story_id,
                    "file_path": a.file_path,
                    "language": a.language,
                    "content": a.content,
                    "created_at": a.created_at.isoformat(),
                }
                for a in items
            ]
        }
    return {"files": []}


@app.post("/projects/{project_key}/build")
async def trigger_build(project_key: str, req: BuildRequest) -> dict:
    """Dispara el pipeline en BACKGROUND y devuelve inmediatamente.

    El cliente debe hacer polling a `/projects/{key}/builds?limit=1` para ver el
    progreso. El build NO se interrumpe si el cliente cierra la pagina o el modal.
    """
    if req.project_key != project_key:
        raise HTTPException(status_code=400, detail="project_key mismatch")

    # Validacion temprana: que exista vision (sino el pipeline fallaria sin sentido).
    async for session in get_session():
        v_res = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        if v_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400,
                detail="No hay vision de producto. Crea una primero en el wizard.",
            )
        break

    # Pre-crea un BuildRun en estado "queued" para que el frontend lo vea inmediato.
    async for session in get_session():
        pending = BuildRun(
            project_key=project_key,
            triggered_by=req.triggered_by,
            stage="queued",
            progress_percent=2,
            summary={},
        )
        session.add(pending)
        await session.commit()
        await session.refresh(pending)
        pending_id = pending.id
        break

    # Lanzamos la coroutine sin await: el HTTP termina, pipeline sigue.
    asyncio.create_task(
        _run_build_safely(
            project_key, req.triggered_by, req.stack, req.max_stories_to_code, pending_id
        )
    )

    return {
        "build_id": pending_id,
        "stage": "queued",
        "progress_percent": 2,
        "async": True,
        "poll_endpoint": f"/projects/{project_key}/builds?limit=1",
    }


async def _run_build_safely(
    project_key: str,
    triggered_by: str,
    stack: str | None,
    max_stories: int,
    pre_build_id: str,
) -> None:
    """Wrapper que ejecuta el pipeline y captura cualquier excepcion.

    El BuildRun pre-creado se elimina (el pipeline crea uno propio con stage tracking).
    """
    try:
        async for session in get_session():
            row = await session.get(BuildRun, pre_build_id)
            if row:
                await session.delete(row)
                await session.commit()
            break
    except Exception:
        pass
    try:
        await run_build_pipeline(project_key, triggered_by, stack, max_stories)
    except Exception as exc:
        logger.exception("background_build_failed", project=project_key)
        # Si fallo antes de crear BuildRun, creamos uno marcado fallido para que el UI lo vea.
        try:
            from datetime import datetime, timezone

            async for session in get_session():
                fallback = BuildRun(
                    project_key=project_key,
                    triggered_by=triggered_by,
                    stage="failed",
                    progress_percent=0,
                    error=str(exc),
                    completed_at=datetime.now(timezone.utc),
                )
                session.add(fallback)
                await session.commit()
                break
        except Exception:
            pass


class AssistantAskRequest(BaseModel):
    user_id: str
    message: str
    image_paths: list[str] = []
    image_urls: list[str] = []


async def _generate_code_for_story_async(project_key: str, story: dict) -> None:
    try:
        resp = await post_json(
            f"{settings.agent_runtime_service_url}/code/generate",
            {
                "project_key": project_key,
                "story_title": story["title"],
                "story_description": story["description"],
                "acceptance_criteria": story.get("acceptance_criteria", []),
                "stack": "FastAPI + React",
                "max_files": 4,
            },
            timeout=300.0,
        )
        files = resp.get("files", [])
        async for session in get_session():
            for f in files:
                a = CodeArtifact(
                    project_key=project_key,
                    story_id=story["id"],
                    file_path=f.get("path", "unknown"),
                    language=f.get("language", "text"),
                    content=f.get("content", ""),
                )
                session.add(a)
            db_item = await session.get(BacklogItem, story["id"])
            if db_item:
                db_item.status = "done"
            await session.commit()
            break
    except Exception as exc:
        logger.exception("async_code_gen_failed", error=str(exc))


@app.post("/projects/{project_key}/assistant")
async def project_assistant(project_key: str, req: AssistantAskRequest) -> dict:
    """Chat libre del proyecto: arma contexto + consulta al agent_runtime."""
    vision_dict: dict | None = None
    backlog_list: list[dict] = []
    last_build: dict | None = None
    pending: list[dict] = []

    async for session in get_session():
        v_res = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        v = v_res.scalar_one_or_none()
        if v:
            vision_dict = {
                "vision": v.vision,
                "target_users": v.target_users,
                "stack_preference": v.stack_preference,
            }

        b_res = await session.execute(
            select(BacklogItem)
            .where(BacklogItem.project_key == project_key)
            .order_by(BacklogItem.order_index)
        )
        backlog_list = [
            {
                "id": i.id,
                "story_key": i.story_key,
                "title": i.title,
                "description": i.description,
                "story_points": i.story_points,
                "priority": i.priority,
                "status": i.status,
                "acceptance_criteria": i.acceptance_criteria,
            }
            for i in b_res.scalars().all()
        ]

        lb_res = await session.execute(
            select(BuildRun)
            .where(BuildRun.project_key == project_key)
            .order_by(BuildRun.started_at.desc())
            .limit(1)
        )
        lb = lb_res.scalar_one_or_none()
        if lb:
            last_build = {
                "stage": lb.stage,
                "progress_percent": lb.progress_percent,
                "summary": lb.summary,
                "error": lb.error,
            }

        d_res = await session.execute(
            select(HumanDecision)
            .where(
                HumanDecision.project_key == project_key,
                HumanDecision.status == "pending",
            )
            .order_by(HumanDecision.created_at.desc())
            .limit(10)
        )
        pending = [
            {"id": d.id, "decision_type": d.decision_type, "title": d.title}
            for d in d_res.scalars().all()
        ]
        break

    try:
        result = await post_json(
            f"{settings.agent_runtime_service_url}/assistant/ask",
            {
                "project_key": project_key,
                "message": req.message,
                "vision": vision_dict,
                "backlog": backlog_list,
                "last_build": last_build,
                "pending_decisions": pending,
                "image_paths": req.image_paths,
            },
            timeout=180.0,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    action = result.get("action") or {}
    if action.get("type") == "generate_code" and action.get("story_key"):
        story_key = action["story_key"]
        story = next((s for s in backlog_list if s["story_key"] == story_key), None)
        if story:
            asyncio.create_task(_generate_code_for_story_async(project_key, story))
            result["action_status"] = f"Generacion iniciada para {story_key}"

    # Persistir mensajes del chat (user + assistant) en DB, atados a project+user
    try:
        async for session in get_session():
            session.add(
                ChatMessage(
                    project_key=project_key,
                    user_id=req.user_id,
                    role="user",
                    content=req.message,
                    image_urls=req.image_urls or None,
                )
            )
            session.add(
                ChatMessage(
                    project_key=project_key,
                    user_id=req.user_id,
                    role="assistant",
                    content=result.get("reply") or "",
                    action=action if action.get("type") != "none" else None,
                )
            )
            await session.commit()
            break
    except Exception as exc:
        logger.warning("chat_persist_failed", error=str(exc))

    return result


from fastapi import WebSocket, WebSocketDisconnect  # noqa: E402


@app.websocket("/projects/{project_key}/chat/ws")
async def chat_websocket(websocket: WebSocket, project_key: str, user_id: str) -> None:
    """WebSocket que empuja nuevos mensajes del chat del proyecto.

    Polling interno cada 2s contra la tabla chat_messages; cuando aparece
    un mensaje > last_seen, lo emite por el socket. Solucion simple sin pub/sub
    externo, suficiente para chat de baja frecuencia (T4 §463).
    """
    await websocket.accept()
    import asyncio as _asyncio
    from datetime import datetime, timezone

    last_seen: datetime | None = None
    # Inicial: enviar todo el historial
    async for session in get_session():
        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.project_key == project_key,
                ChatMessage.user_id == user_id,
            )
            .order_by(ChatMessage.created_at.asc())
        )
        rows = (await session.execute(stmt)).scalars().all()
        for m in rows:
            await websocket.send_json(
                {
                    "type": "message",
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "image_urls": m.image_urls,
                    "action": m.action,
                    "created_at": m.created_at.isoformat(),
                }
            )
            last_seen = m.created_at
        break

    await websocket.send_json({"type": "snapshot_complete", "at": datetime.now(timezone.utc).isoformat()})

    try:
        while True:
            await _asyncio.sleep(2.0)
            async for session in get_session():
                stmt = (
                    select(ChatMessage)
                    .where(
                        ChatMessage.project_key == project_key,
                        ChatMessage.user_id == user_id,
                    )
                    .order_by(ChatMessage.created_at.asc())
                )
                if last_seen is not None:
                    stmt = stmt.where(ChatMessage.created_at > last_seen)
                rows = (await session.execute(stmt)).scalars().all()
                for m in rows:
                    await websocket.send_json(
                        {
                            "type": "message",
                            "id": m.id,
                            "role": m.role,
                            "content": m.content,
                            "image_urls": m.image_urls,
                            "action": m.action,
                            "created_at": m.created_at.isoformat(),
                        }
                    )
                    last_seen = m.created_at
                break
    except WebSocketDisconnect:
        return
    except Exception as exc:
        logger.warning("chat_ws_error", error=str(exc))
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/projects/{project_key}/chat")
async def get_chat_history(
    project_key: str, user_id: str, limit: int = 200
) -> dict:
    """Devuelve los mensajes del chat del proyecto para un user especifico."""
    async for session in get_session():
        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.project_key == project_key,
                ChatMessage.user_id == user_id,
            )
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
        )
        rows = (await session.execute(stmt)).scalars().all()
        return {
            "project_key": project_key,
            "user_id": user_id,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "image_urls": m.image_urls,
                    "action": m.action,
                    "created_at": m.created_at.isoformat(),
                }
                for m in rows
            ],
        }
    return {"project_key": project_key, "user_id": user_id, "messages": []}


@app.delete("/projects/{project_key}/chat")
async def clear_chat_history(project_key: str, user_id: str) -> dict:
    """Borra los mensajes del chat del user en el proyecto."""
    from sqlalchemy import delete as sa_delete

    async for session in get_session():
        result = await session.execute(
            sa_delete(ChatMessage).where(
                ChatMessage.project_key == project_key,
                ChatMessage.user_id == user_id,
            )
        )
        await session.commit()
        return {"deleted": result.rowcount or 0}
    return {"deleted": 0}


@app.get("/projects/{project_key}/state")
async def project_state(project_key: str) -> dict:
    return await diagnose_project(project_key)


@app.post("/projects/{project_key}/generate-app")
async def generate_app(project_key: str, req: GenerateAppRequest) -> dict:
    """Genera proyecto completo profesional (FastAPI + Next.js + Postgres) en background."""
    async for session in get_session():
        v_res = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        if v_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=400, detail="Define la vision antes de generar."
            )
        run = BuildRun(
            project_key=project_key,
            triggered_by=req.triggered_by,
            stage="queued (generate_full_app)",
            progress_percent=5,
            summary={"action": "generate_full_app"},
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        build_id = run.id
        break

    asyncio.create_task(
        _run_generate_full_app(project_key, req.triggered_by, req.replace_existing, build_id)
    )
    return {"build_id": build_id, "async": True, "stage": "queued"}


@app.post("/projects/{project_key}/smart-build")
async def smart_build(project_key: str, req: SmartBuildRequest) -> dict:
    """Decide que generar segun el estado y dispara background."""
    state = await diagnose_project(project_key)
    if not state.get("vision_set"):
        raise HTTPException(status_code=400, detail="No hay vision. Define una primero.")

    build_id = await run_smart_build(project_key, req.triggered_by, req.force_regenerate)
    action = "regenerate" if req.force_regenerate else state.get("next_action")
    asyncio.create_task(execute_smart_build(project_key, build_id, action))
    return {
        "build_id": build_id,
        "action_executed": action,
        "label": state.get("next_action_label"),
        "stories_pending_count": state.get("stories_pending_count"),
        "async": True,
    }


@app.get("/projects/{project_key}/builds")
async def list_builds(project_key: str, limit: int = 10) -> dict:
    async for session in get_session():
        result = await session.execute(
            select(BuildRun)
            .where(BuildRun.project_key == project_key)
            .order_by(BuildRun.started_at.desc())
            .limit(limit)
        )
        items = result.scalars().all()
        return {
            "builds": [
                {
                    "id": b.id,
                    "stage": b.stage,
                    "progress_percent": b.progress_percent,
                    "triggered_by": b.triggered_by,
                    "summary": b.summary,
                    "error": b.error,
                    "started_at": b.started_at.isoformat(),
                    "completed_at": b.completed_at.isoformat() if b.completed_at else None,
                }
                for b in items
            ]
        }
    return {"builds": []}


class DeployRequest(BaseModel):
    triggered_by: str
    create_vercel_project: bool = True
    framework: str = "nextjs"


@app.post("/projects/{project_key}/deploy")
async def deploy_project(project_key: str, req: DeployRequest) -> dict:
    """Publica todos los CodeArtifact al repo GitHub del usuario y opcionalmente
    crea un proyecto Vercel apuntado al repo (Vercel hace auto-deploy en cada push)."""
    async for session in get_session():
        result = await session.execute(
            select(CodeArtifact).where(CodeArtifact.project_key == project_key)
        )
        artifacts = result.scalars().all()
        if not artifacts:
            raise HTTPException(
                status_code=400,
                detail="No hay codigo generado. Ejecuta /build primero.",
            )
        files = [
            {"path": a.file_path, "content": a.content} for a in artifacts
        ]

        # FASE E: validar y auto-arreglar ANTES del scaffold (0 errores deploy).
        # Generico: detecta stack, arregla imports rotos/exports faltantes.
        from services.orchestrator_service.app.deploy_validator import validate_and_fix
        files, validation_report = validate_and_fix(files)
        logger.info("deploy_validation", project=project_key, report=validation_report)

        # Anade scaffold (package.json, next.config, app/layout/page, vercel.json)
        # para que el deploy en Vercel funcione sin configuracion manual.
        from services.orchestrator_service.app.deploy_scaffold import build_scaffold

        scaffold = build_scaffold(project_key.lower().replace("_", "-"), files)
        files = scaffold + files

        # Push a GitHub via git_connector
        try:
            git_resp = await post_json(
                f"{settings.git_connector_service_url}/publish",
                {
                    "repo_name": project_key.lower(),
                    "description": f"Generated by ScrumDev AI for {project_key}",
                    "private": True,
                    "files": files,
                    "commit_message": f"feat: ScrumDev AI build {datetime.now(timezone.utc).isoformat()}",
                },
                timeout=180.0,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"git_publish_failed: {exc}")

        # Si el connector no pudo crear el repo, retornamos al UI con instrucciones.
        if git_resp.get("needs_user_action"):
            repo_err = git_resp.get("repo", {})
            return {
                "git_url": None,
                "vercel_url": None,
                "vercel_state": None,
                "files_count": len(files),
                "needs_user_action": True,
                "error_code": repo_err.get("error"),
                "message": repo_err.get("message"),
                "manual_create_url": repo_err.get("manual_create_url"),
                "git": git_resp,
            }

        vercel_resp: dict | None = None
        vercel_deploy_resp: dict | None = None
        render_resp: dict | None = None
        used_fallback: str | None = None
        project_name_vercel = project_key.lower().replace("_", "-")

        def _is_quota_exceeded(resp: dict | None) -> bool:
            if not resp:
                return False
            err = (resp.get("error") or "")
            if isinstance(err, str):
                low = err.lower()
                return any(
                    sig in low
                    for sig in (
                        "payment_required",
                        "free-per-day",
                        "resource is limited",
                        "402",
                        "quota",
                    )
                )
            return False

        if req.create_vercel_project and settings.scrumdev_git_owner:
            try:
                vercel_resp = await post_json(
                    f"{settings.deploy_connector_service_url}/vercel/projects",
                    {
                        "name": project_name_vercel,
                        "git_owner": settings.scrumdev_git_owner,
                        "git_repo": project_name_vercel,
                        "framework": req.framework,
                    },
                    timeout=60.0,
                )
            except Exception as exc:
                vercel_resp = {"error": str(exc)}

            try:
                vercel_deploy_resp = await post_json(
                    f"{settings.deploy_connector_service_url}/vercel/deploy",
                    {
                        "name": project_name_vercel,
                        "git_owner": settings.scrumdev_git_owner,
                        "git_repo": project_name_vercel,
                        "git_branch": "main",
                    },
                    timeout=60.0,
                )
            except Exception as exc:
                vercel_deploy_resp = {"error": str(exc)}

            # FALLBACK A RENDER: si Vercel agoto quota (402) o paymet_required,
            # creamos servicio en Render del mismo repo. El frontend Next se
            # sirve igual (con mock data si backend API no disponible).
            if _is_quota_exceeded(vercel_deploy_resp) or _is_quota_exceeded(vercel_resp):
                logger.warning(
                    "vercel_quota_exceeded_falling_back_to_render",
                    project=project_key,
                )
                try:
                    render_resp = await post_json(
                        f"{settings.deploy_connector_service_url}/render/services",
                        {
                            "name": project_name_vercel,
                            "git_owner": settings.scrumdev_git_owner,
                            "git_repo": project_name_vercel,
                            "branch": "main",
                            "runtime": "node",
                            "build_command": "npm install && npm run build",
                            "start_command": "npm start",
                        },
                        timeout=60.0,
                    )
                    used_fallback = "render"
                except Exception as exc:
                    render_resp = {"error": str(exc)}

        # AUTO-PROVISION Postgres con Neon API si no esta seteado.
        # Esto evita que el user pegue connection strings manualmente — la
        # plataforma crea la DB y la inyecta como POSTGRES_URL en Vercel.
        neon_resp: dict | None = None
        try:
            # Chequear si ya hay POSTGRES_URL seteado
            async with httpx.AsyncClient(timeout=10.0) as client:
                env_r = await client.get(
                    f"{settings.deploy_connector_service_url}/vercel/env/{project_name_vercel}"
                )
                already_has_db = False
                if env_r.status_code == 200:
                    envs = env_r.json().get("envs", [])
                    keys = {e.get("key") for e in envs}
                    already_has_db = "POSTGRES_URL" in keys or "DATABASE_URL" in keys

            if not already_has_db:
                neon_resp = await post_json(
                    f"{settings.deploy_connector_service_url}/neon/projects",
                    {"name": project_name_vercel},
                    timeout=60.0,
                )
                if neon_resp.get("ok") and neon_resp.get("connection_uri"):
                    db_url = neon_resp["connection_uri"]
                    # Setear en Vercel
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        for key in ("POSTGRES_URL", "DATABASE_URL"):
                            await client.post(
                                f"{settings.deploy_connector_service_url}/vercel/env",
                                json={
                                    "project_id_or_name": project_name_vercel,
                                    "key": key,
                                    "value": db_url,
                                    "target": ["production", "preview", "development"],
                                },
                            )
                    logger.info("neon_auto_provisioned", project=project_key)
        except Exception as exc:
            logger.warning("neon_auto_provision_skipped", error=str(exc))

        await event_bus.publish(
            DomainEvent(
                event_type="PROJECT_DEPLOYED",
                source_service="orchestrator-service",
                correlation_id=str(uuid4()),
                project_key=project_key,
                payload={
                    "triggered_by": req.triggered_by,
                    "files_pushed": git_resp.get("push", {}).get("pushed_count", 0),
                    "git_url": git_resp.get("push", {}).get("url"),
                    "vercel": bool(vercel_resp and "error" not in (vercel_resp or {})),
                    "neon_auto": bool(neon_resp and neon_resp.get("ok")),
                },
            )
        )

        repo_url = (git_resp.get("push") or {}).get("url")
        vercel_url = None
        vercel_state = None
        # Si el trigger_deploy ya devolvio una URL, usarla inmediatamente.
        if vercel_deploy_resp and vercel_deploy_resp.get("url"):
            vercel_url = vercel_deploy_resp["url"]
            vercel_state = vercel_deploy_resp.get("readyState") or "INITIALIZING"
        if vercel_resp and not vercel_resp.get("error") and not vercel_url:
            # Fallback: polling corto al endpoint de listado de deployments.
            for _ in range(8):
                latest = await post_json(
                    f"{settings.deploy_connector_service_url}/vercel/deployments/"
                    + project_key.lower().replace("_", "-"),
                    {},
                    timeout=10.0,
                ) if False else None
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        r = await client.get(
                            f"{settings.deploy_connector_service_url}/vercel/deployments/"
                            + project_key.lower().replace("_", "-")
                        )
                        if r.status_code == 200:
                            ld = r.json()
                            if ld.get("url"):
                                vercel_url = ld["url"]
                                vercel_state = ld.get("readyState") or ld.get("state")
                                break
                except Exception:
                    pass
                await asyncio.sleep(6)

        # Si caimos a Render, extraer URL
        render_url = None
        render_state = None
        if render_resp and not render_resp.get("error"):
            svc = render_resp.get("service") or render_resp
            render_url = svc.get("serviceDetails", {}).get("url") or svc.get("dashboardUrl")
            render_state = "created"

        return {
            "git_url": repo_url,
            "vercel_url": vercel_url,
            "vercel_state": vercel_state,
            "render_url": render_url,
            "render_state": render_state,
            "fallback_provider": used_fallback,
            "git": git_resp,
            "vercel": vercel_resp,
            "render": render_resp,
            "files_count": len(files),
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/projects/{project_key}/deploy/preview")
async def deploy_preview(project_key: str) -> dict:
    """Devuelve estado real del deploy. Valida que el repo EXISTA en GitHub
    antes de retornar github_url (sino el UI muestra link 404)."""
    repo_slug = project_key.lower().replace("_", "-")
    owner = settings.scrumdev_git_owner
    repo_exists = False
    repo_url: str | None = None
    vercel_url = None
    state = None

    # 1. Verifica si el repo realmente existe en GitHub.
    if owner and settings.scrumdev_git_token:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo_slug}",
                    headers={
                        "Authorization": f"Bearer {settings.scrumdev_git_token}",
                        "Accept": "application/vnd.github+json",
                    },
                )
                if r.status_code == 200:
                    repo_exists = True
                    repo_url = r.json().get("html_url")
        except Exception:
            pass

    # 2. Si hay deploy Vercel previo, retorna su URL + estado.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{settings.deploy_connector_service_url}/vercel/deployments/{repo_slug}"
            )
            if r.status_code == 200:
                ld = r.json()
                vercel_url = ld.get("url")
                state = ld.get("readyState") or ld.get("state")
    except Exception:
        pass

    return {
        "vercel_url": vercel_url,
        "state": state,
        "github_url": repo_url if repo_exists else None,
        "github_owner": owner,
        "expected_repo_slug": repo_slug,
        "deployed": bool(repo_exists or vercel_url),
    }


class PostgresConfigureRequest(BaseModel):
    database_url: str | None = None
    auto_provision: bool = True


@app.post("/projects/{project_key}/postgres/configure")
async def configure_postgres(project_key: str, req: PostgresConfigureRequest) -> dict:
    """Configura POSTGRES_URL en el proyecto Vercel.

    Prioridad:
    1. Si el user pega `database_url`, lo seteamos directo (estable, siempre funciona).
    2. Si no, y `auto_provision=True`, intentamos crear Vercel Postgres (Neon
       integrado). Si falla por plan, devolvemos `needs_manual_url=True`.
    """
    project_name_vercel = project_key.lower().replace("_", "-")
    database_url = req.database_url

    if not database_url and req.auto_provision:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                provision_resp = await client.post(
                    f"{settings.deploy_connector_service_url}/vercel/postgres",
                    json={"name": project_name_vercel},
                )
                provision_data = provision_resp.json()
                if not provision_data.get("provisioned"):
                    return {
                        "ok": False,
                        "needs_manual_url": True,
                        "hint": provision_data.get("hint"),
                        "error": provision_data.get("error"),
                    }
                store = provision_data.get("store", {})
                database_url = (
                    store.get("connectionStrings", {}).get("uri")
                    or store.get("connection_string")
                    or store.get("POSTGRES_URL")
                )
        except Exception as exc:
            return {"ok": False, "needs_manual_url": True, "error": str(exc)}

    if not database_url:
        return {"ok": False, "needs_manual_url": True, "error": "no database_url provided"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for key in ("POSTGRES_URL", "DATABASE_URL"):
                env_resp = await client.post(
                    f"{settings.deploy_connector_service_url}/vercel/env",
                    json={
                        "project_id_or_name": project_name_vercel,
                        "key": key,
                        "value": database_url,
                        "target": ["production", "preview", "development"],
                    },
                )
                if env_resp.status_code >= 400:
                    return {
                        "ok": False,
                        "error": f"setting {key}: {env_resp.text}",
                    }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "configured_keys": ["POSTGRES_URL", "DATABASE_URL"],
        "project": project_name_vercel,
        "hint": "Re-despliega para aplicar la nueva env var.",
    }


class DecisionCreateRequest(BaseModel):
    project_key: str
    decision_type: str
    title: str
    summary: str | None = ""
    description: str | None = ""
    issue_key: str | None = None
    correlation_id: str | None = None
    context: dict = {}
    requested_by: str | None = None


@app.post("/decisions", status_code=201)
async def create_decision(req: DecisionCreateRequest) -> dict:
    """Crea una HumanDecision pendiente. Usada por la activity Temporal
    request_human_approval antes de gates criticos (prod deploy, architecture)."""
    from uuid import uuid4

    async for session in get_session():
        d = HumanDecision(
            correlation_id=req.correlation_id or str(uuid4()),
            project_key=req.project_key,
            issue_key=req.issue_key,
            decision_type=req.decision_type,
            title=req.title,
            description=req.summary or req.description or "",
            context=req.context or {},
            status="pending",
        )
        session.add(d)
        await session.commit()
        await session.refresh(d)

        await event_bus.publish(
            DomainEvent(
                event_type=HUMAN_APPROVAL_REQUIRED,
                source_service="orchestrator-service",
                correlation_id=d.correlation_id,
                project_key=d.project_key,
                issue_key=d.issue_key,
                payload={
                    "decision_id": d.id,
                    "decision_type": d.decision_type,
                    "title": d.title,
                },
            )
        )

        return {
            "id": d.id,
            "correlation_id": d.correlation_id,
            "status": d.status,
            "decision_type": d.decision_type,
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/decisions/pending")
async def list_pending_decisions(project_key: str | None = None) -> dict:
    async for session in get_session():
        stmt = (
            select(HumanDecision)
            .where(HumanDecision.status == "pending")
            .order_by(HumanDecision.created_at.desc())
        )
        if project_key:
            stmt = stmt.where(HumanDecision.project_key == project_key)
        result = await session.execute(stmt)
        return {
            "decisions": [
                {
                    "id": d.id,
                    "correlation_id": d.correlation_id,
                    "project_key": d.project_key,
                    "issue_key": d.issue_key,
                    "decision_type": d.decision_type,
                    "title": d.title,
                    "description": d.description,
                    "context": d.context,
                    "created_at": d.created_at.isoformat(),
                }
                for d in result.scalars().all()
            ]
        }
    return {"decisions": []}


@app.post("/decisions/{decision_id}/approve")
async def approve_decision(decision_id: str, req: DecisionResolveRequest) -> dict:
    return await _resolve_decision(decision_id, req, approved=True)


@app.post("/decisions/{decision_id}/reject")
async def reject_decision(decision_id: str, req: DecisionResolveRequest) -> dict:
    return await _resolve_decision(decision_id, req, approved=False)


async def _resolve_decision(
    decision_id: str, req: DecisionResolveRequest, approved: bool
) -> dict:
    async for session in get_session():
        decision = await session.get(HumanDecision, decision_id)
        if decision is None:
            raise HTTPException(status_code=404, detail="decision not found")
        if decision.status != "pending":
            raise HTTPException(status_code=409, detail=f"decision already {decision.status}")
        decision.status = "approved" if approved else "rejected"
        decision.decided_by = req.decided_by
        decision.decision_reason = req.decision_reason
        decision.decided_at = datetime.now(timezone.utc)
        await session.commit()

        await event_bus.publish(
            DomainEvent(
                event_type=HUMAN_APPROVAL_GRANTED if approved else HUMAN_APPROVAL_REJECTED,
                source_service="orchestrator-service",
                correlation_id=decision.correlation_id,
                project_key=decision.project_key,
                issue_key=decision.issue_key,
                payload={
                    "decision_id": decision.id,
                    "decision_type": decision.decision_type,
                    "decided_by": req.decided_by,
                    "reason": req.decision_reason,
                },
            )
        )

        return {
            "id": decision.id,
            "status": decision.status,
            "decided_by": decision.decided_by,
            "next_state": next_state(decision.decision_type) if approved else WORKFLOW_STATE_FAILED,
        }
    raise HTTPException(status_code=503, detail="database unavailable")

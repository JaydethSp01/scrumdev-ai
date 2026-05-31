"""Pipeline "Generar sistema completo".

Orquesta:
  1. Toma vision + NFR del proyecto.
  2. PO Agent genera backlog (historias) y se persisten.
  3. Architecture Agent genera arquitectura general.
  4. Por cada historia (top N por priority): Dev Agent genera codigo.
  5. Persiste BuildRun con resumen.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select

from shared.config.settings import settings
from shared.db.models import (
    BacklogItem,
    BuildRun,
    CodeArtifact,
    NFRCapture,
    ProjectVision,
)
from shared.db.session import get_session
from shared.events.domain_events import DomainEvent
from shared.events.event_bus import event_bus
from shared.observability import get_logger

logger = get_logger(__name__)

AGENT_RUNTIME = settings.agent_runtime_service_url


async def _post_json(path: str, payload: dict, timeout: float = 300.0) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{AGENT_RUNTIME}{path}", json=payload)
        r.raise_for_status()
        return r.json()


async def _update_build(build_id: str, **fields) -> None:
    async for session in get_session():
        run = await session.get(BuildRun, build_id)
        if not run:
            return
        for k, v in fields.items():
            setattr(run, k, v)
        await session.commit()


async def _load_vision_and_nfr(project_key: str) -> tuple[ProjectVision | None, dict]:
    vision = None
    nfr: dict = {}
    async for session in get_session():
        v_res = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        vision = v_res.scalar_one_or_none()
        n_res = await session.execute(
            select(NFRCapture)
            .where(NFRCapture.project_key == project_key)
            .order_by(NFRCapture.created_at.desc())
            .limit(1)
        )
        n = n_res.scalar_one_or_none()
        if n:
            nfr = n.nfr_data
        break
    return vision, nfr


async def _save_backlog(project_key: str, stories: list[dict]) -> list[BacklogItem]:
    items: list[BacklogItem] = []
    async for session in get_session():
        for s in stories:
            item = BacklogItem(
                project_key=project_key,
                story_key=s.get("story_key", "S-?"),
                title=s.get("title", "Sin titulo"),
                description=s.get("description", ""),
                acceptance_criteria=s.get("acceptance_criteria", []),
                story_points=int(s.get("story_points", 3)),
                priority=s.get("priority", "medium"),
                status="backlog",
                order_index=int(s.get("order_index", 0)),
            )
            session.add(item)
            items.append(item)
        await session.commit()
        for item in items:
            await session.refresh(item)
        break
    # Sincronizar con Jira (best-effort): crear los issues en el tablero del
    # cliente. No bloquea el flujo si Jira no esta configurado o falla.
    try:
        await _sync_backlog_to_jira(project_key, items)
    except Exception as exc:
        logger.warning("jira_sync_skipped", project=project_key, error=str(exc))
    return items


async def _sync_backlog_to_jira(project_key: str, items: list) -> None:
    """Crea los issues del backlog en Jira (config del proyecto o global)."""
    from shared.db.models import IntegrationConfig
    import base64 as _b64
    # resolver credenciales: primero las del proyecto, si no las globales
    base_url = email = token = jira_pk = None
    async for session in get_session():
        cfg = (await session.execute(
            select(IntegrationConfig).where(
                IntegrationConfig.project_key == project_key,
                IntegrationConfig.provider == "jira",
            )
        )).scalar_one_or_none()
        if cfg and cfg.secret_enc:
            base_url = cfg.config.get("base_url")
            email = cfg.config.get("email")
            token = _b64.b64decode(cfg.secret_enc).decode()
            jira_pk = cfg.config.get("project_key_jira")
        break
    if not (base_url and email and token):
        # global
        base_url = settings.scrumdev_jira_base_url
        email = settings.scrumdev_jira_email
        token = settings.scrumdev_jira_api_token
        jira_pk = settings.scrumdev_jira_project_key
    if not (base_url and email and token and jira_pk):
        logger.info("jira_not_configured_skip", project=project_key)
        return
    import httpx as _hx
    auth = _b64.b64encode(f"{email}:{token}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}", "Accept": "application/json",
               "Content-Type": "application/json"}
    created = 0
    async with _hx.AsyncClient(timeout=20.0) as c:
        for it in items[:20]:
            payload = {"fields": {
                "project": {"key": jira_pk},
                "summary": f"[{it.story_key}] {it.title}"[:240],
                "description": {"type": "doc", "version": 1, "content": [
                    {"type": "paragraph", "content": [
                        {"type": "text", "text": (it.description or it.title)[:500]}]}]},
                "issuetype": {"name": "Task"},
            }}
            try:
                r = await c.post(f"{base_url.rstrip('/')}/rest/api/3/issue", json=payload, headers=headers)
                if r.status_code < 300:
                    created += 1
            except Exception:
                pass
    logger.info("jira_backlog_synced", project=project_key, created=created, total=len(items))


async def _save_code(project_key: str, story_id: str, files: list[dict]) -> list[CodeArtifact]:
    artifacts: list[CodeArtifact] = []
    async for session in get_session():
        # asociar el codigo a la version ACTIVA (ciclo de vida), no siempre v1
        from services.orchestrator_service.app.versions import ensure_v1, get_active_version
        version = await get_active_version(session, project_key) or await ensure_v1(session, project_key)
        await session.commit()
        for f in files:
            a = CodeArtifact(
                project_key=project_key,
                version_id=version.id,
                story_id=story_id,
                file_path=f.get("path", "unknown"),
                language=f.get("language", "text"),
                content=f.get("content", ""),
            )
            session.add(a)
            artifacts.append(a)
        await session.commit()
        for a in artifacts:
            await session.refresh(a)
        break
    return artifacts


PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


async def run_build_pipeline(
    project_key: str,
    triggered_by: str,
    stack: str | None = None,
    max_stories_to_code: int = 5,
) -> BuildRun:
    """Ejecuta el pipeline completo. Retorna el BuildRun final."""
    async for session in get_session():
        run = BuildRun(
            project_key=project_key,
            triggered_by=triggered_by,
            stage="vision",
            progress_percent=5,
            summary={},
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        build_id = run.id
        break

    await event_bus.publish(
        DomainEvent(
            event_type="BUILD_PIPELINE_STARTED",
            source_service="orchestrator-service",
            correlation_id=build_id,
            project_key=project_key,
            payload={"triggered_by": triggered_by},
        )
    )

    summary: dict[str, Any] = {}

    try:
        vision, nfr_data = await _load_vision_and_nfr(project_key)
        if not vision:
            await _update_build(
                build_id,
                stage="failed",
                error="No hay vision de producto registrada. Crea una primero.",
                completed_at=datetime.now(timezone.utc),
            )
            raise ValueError("project_vision_missing")

        effective_stack = stack or vision.stack_preference or "FastAPI + React + Postgres"

        await _update_build(build_id, stage="backlog", progress_percent=15)
        backlog_resp = await _post_json(
            "/backlog/generate",
            {
                "project_key": project_key,
                "vision": vision.vision,
                "target_users": vision.target_users,
                "stack_preference": effective_stack,
                "max_stories": 10,
            },
        )
        stories_raw = backlog_resp.get("stories", [])
        saved_items = await _save_backlog(project_key, stories_raw)
        summary["backlog_count"] = len(saved_items)

        await _update_build(build_id, stage="architecture", progress_percent=35)
        nfr_block = (
            f"Requerimientos no funcionales: {nfr_data}" if nfr_data else "(sin NFR formal)"
        )
        arch_input = (
            f"### Vision\n{vision.vision}\n\n### Stack\n{effective_stack}\n\n{nfr_block}"
        )
        arch_resp = await _post_json(
            "/crews/architecture/run",
            {"inputs": {"requirements": arch_input}, "correlation_id": build_id},
        )
        architecture_output = arch_resp.get("output", "")
        summary["architecture_chars"] = len(architecture_output)

        await _update_build(build_id, stage="coding", progress_percent=60)
        # UNIFICADO: usar el generador per-tier (/app/generate) que clasifica el
        # producto y respeta is_static (landing = solo frontend, sin backend).
        # Antes /code/generate generaba SIEMPRE fullstack por-historia y
        # contaminaba los landings con backend.
        top_items = sorted(
            saved_items,
            key=lambda x: (PRIORITY_RANK.get(x.priority, 1), x.order_index),
        )
        backlog_for_gen = [
            {
                "story_key": it.story_key,
                "title": it.title,
                "description": it.description,
                "priority": it.priority,
                "story_points": it.story_points,
            }
            for it in top_items
        ]
        app_resp = await _post_json(
            "/app/generate",
            {
                "project_key": project_key,
                "vision": vision.vision,
                "target_users": vision.target_users,
                "backlog": backlog_for_gen,
                "stack_preference": effective_stack,
                "nfr": nfr_data or None,
            },
            timeout=600.0,
        )
        files = app_resp.get("files", [])
        await _save_code(project_key, None, files)
        # marcar historias del backlog como done (el generador holistico las cubre)
        async for session in get_session():
            for it in saved_items:
                db_item = await session.get(BacklogItem, it.id)
                if db_item and db_item.status != "done":
                    db_item.status = "done"
            await session.commit()
            break
        await _update_build(build_id, progress_percent=90)

        summary["code_files_generated"] = len(files)
        summary["stack_generated"] = app_resp.get("stack")
        summary["architecture_preview"] = architecture_output[:500]

        await _update_build(
            build_id,
            stage="completed",
            progress_percent=100,
            summary=summary,
            completed_at=datetime.now(timezone.utc),
        )
        await event_bus.publish(
            DomainEvent(
                event_type="BUILD_PIPELINE_COMPLETED",
                source_service="orchestrator-service",
                correlation_id=build_id,
                project_key=project_key,
                payload={"summary": summary},
            )
        )

    except Exception as exc:
        logger.exception("build_pipeline_failed")
        await _update_build(
            build_id,
            stage="failed",
            error=str(exc),
            completed_at=datetime.now(timezone.utc),
        )
        await event_bus.publish(
            DomainEvent(
                event_type="BUILD_PIPELINE_FAILED",
                source_service="orchestrator-service",
                correlation_id=build_id,
                project_key=project_key,
                payload={"error": str(exc)},
            )
        )
        raise

    async for session in get_session():
        return await session.get(BuildRun, build_id)
    raise RuntimeError("session unavailable")

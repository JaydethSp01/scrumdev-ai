"""Build inteligente: ejecuta solo lo que falta segun el estado del proyecto.

- next_action=generate_backlog -> pipeline completo
- next_action=generate_pending_code -> solo dispara code_generation para las historias pendientes
- next_action=ready_to_deploy -> no genera, retorna mensaje
- next_action=regenerate (forzado) -> pipeline completo
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from services.orchestrator_service.app.project_state import diagnose
from shared.config.settings import settings
from shared.db.models import BacklogItem, BuildRun, CodeArtifact
from shared.db.session import get_session
from shared.events.domain_events import DomainEvent
from shared.events.event_bus import event_bus
from shared.observability import get_logger

logger = get_logger(__name__)


async def _post(path: str, payload: dict, timeout: float = 300.0) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{settings.agent_runtime_service_url}{path}", json=payload)
        r.raise_for_status()
        return r.json()


async def _save_files(project_key: str, story_id: str, files: list[dict]) -> int:
    n = 0
    async for session in get_session():
        for f in files:
            session.add(
                CodeArtifact(
                    project_key=project_key,
                    story_id=story_id,
                    file_path=f.get("path", "unknown"),
                    language=f.get("language", "text"),
                    content=f.get("content", ""),
                )
            )
            n += 1
        item = await session.get(BacklogItem, story_id)
        if item:
            item.status = "done"
        await session.commit()
        break
    return n


async def generate_pending_code(project_key: str, build_id: str, max_stories: int = 5) -> dict:
    """Para las historias pendientes (sin codigo), llama al code_generator."""
    state = await diagnose(project_key)
    pending = state.get("stories_pending", [])[:max_stories]
    if not pending:
        return {"stories_processed": 0, "files_generated": 0}

    total_files = 0
    processed: list[dict] = []
    for i, s in enumerate(pending):
        try:
            async for session in get_session():
                full = await session.get(BacklogItem, s["id"])
                if not full:
                    break
                story = {
                    "id": full.id,
                    "story_key": full.story_key,
                    "title": full.title,
                    "description": full.description,
                    "acceptance_criteria": full.acceptance_criteria,
                }
                break
            resp = await _post(
                "/code/generate",
                {
                    "project_key": project_key,
                    "story_title": story["title"],
                    "story_description": story["description"],
                    "acceptance_criteria": story.get("acceptance_criteria") or [],
                    "stack": "FastAPI + React",
                    "max_files": 4,
                },
            )
            files = resp.get("files", [])
            n = await _save_files(project_key, story["id"], files)
            total_files += n
            processed.append({"story_key": story["story_key"], "files": n})

            pct = 20 + int((i + 1) / max(1, len(pending)) * 75)
            async for session in get_session():
                run = await session.get(BuildRun, build_id)
                if run:
                    run.progress_percent = pct
                    run.stage = f"coding {i+1}/{len(pending)}"
                    await session.commit()
                break
        except Exception as exc:
            logger.warning("pending_code_failed", story=s.get("story_key"), error=str(exc))

    return {"stories_processed": len(processed), "files_generated": total_files, "details": processed}


async def run_smart_build(project_key: str, triggered_by: str, force_regenerate: bool = False) -> str:
    """Decide que hacer segun el estado y lo ejecuta en background. Devuelve build_id."""
    state = await diagnose(project_key)
    action = "regenerate" if force_regenerate else state.get("next_action", "generate_backlog")

    async for session in get_session():
        run = BuildRun(
            project_key=project_key,
            triggered_by=triggered_by,
            stage=f"queued ({action})",
            progress_percent=5,
            summary={"action": action, "initial_state": state},
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        build_id = run.id
        break

    await event_bus.publish(
        DomainEvent(
            event_type="SMART_BUILD_STARTED",
            source_service="orchestrator-service",
            correlation_id=build_id,
            project_key=project_key,
            payload={"action": action},
        )
    )
    return build_id


async def execute_smart_build(
    project_key: str, build_id: str, action: str, backlog_only: bool = False
) -> None:
    """Ejecuta el action escogido. Llamado en background task. Si backlog_only,
    la fase de backlog SOLO genera el backlog y se detiene en el gate (flujo
    gateado del Taller 3: arquitectura y código son fases posteriores)."""
    from services.orchestrator_service.app.build_pipeline import run_build_pipeline

    summary: dict = {}
    try:
        if action == "generate_backlog" or action == "regenerate":
            await run_build_pipeline(project_key, "smart", max_stories_to_code=3,
                                     backlog_only=backlog_only)
            # run_build_pipeline crea su propio BuildRun, eliminamos el placeholder
            async for session in get_session():
                placeholder = await session.get(BuildRun, build_id)
                if placeholder:
                    await session.delete(placeholder)
                    await session.commit()
                break
            return

        if action == "generate_pending_code":
            async for session in get_session():
                run = await session.get(BuildRun, build_id)
                if run:
                    run.stage = "coding"
                    run.progress_percent = 20
                    await session.commit()
                break
            result = await generate_pending_code(project_key, build_id, max_stories=5)
            summary.update(result)

        elif action == "ready_to_deploy":
            summary["message"] = "El proyecto ya tiene todas las historias con codigo. Usa Desplegar."

        elif action == "set_vision":
            summary["message"] = "Define la vision antes de generar."

        async for session in get_session():
            run = await session.get(BuildRun, build_id)
            if run:
                run.stage = "completed"
                run.progress_percent = 100
                run.summary = {**(run.summary or {}), **summary}
                run.completed_at = datetime.now(timezone.utc)
                await session.commit()
            break

    except Exception as exc:
        logger.exception("smart_build_failed", project=project_key)
        async for session in get_session():
            run = await session.get(BuildRun, build_id)
            if run:
                run.stage = "failed"
                run.error = str(exc)
                run.completed_at = datetime.now(timezone.utc)
                await session.commit()
            break

"""Diagnostico del estado de un proyecto para decisiones de build inteligente.

Resume:
- vision_set: hay vision capturada?
- backlog_count: cuantas historias hay
- stories_with_code: cuantas tienen al menos 1 archivo
- stories_pending: cuantas estan en backlog sin codigo
- last_build: stage del ultimo build
- next_action: que tiene sentido hacer ahora ("generate_backlog" | "generate_pending_code" |
  "regenerate" | "deploy" | "ready_to_deploy")
"""
from __future__ import annotations

from sqlalchemy import func, select

from shared.db.models import BacklogItem, BuildRun, CodeArtifact, ProjectVision
from shared.db.session import get_session


async def diagnose(project_key: str) -> dict:
    async for session in get_session():
        v_res = await session.execute(
            select(ProjectVision).where(ProjectVision.project_key == project_key)
        )
        vision = v_res.scalar_one_or_none()

        backlog_res = await session.execute(
            select(BacklogItem).where(BacklogItem.project_key == project_key)
        )
        items = backlog_res.scalars().all()

        artifacts_res = await session.execute(
            select(CodeArtifact.story_id).where(CodeArtifact.project_key == project_key)
        )
        story_ids_with_code = {row[0] for row in artifacts_res.all() if row[0]}

        code_count = await session.execute(
            select(func.count()).select_from(CodeArtifact).where(
                CodeArtifact.project_key == project_key
            )
        )
        code_files_total = code_count.scalar() or 0

        lb_res = await session.execute(
            select(BuildRun)
            .where(BuildRun.project_key == project_key)
            .order_by(BuildRun.started_at.desc())
            .limit(1)
        )
        lb = lb_res.scalar_one_or_none()

        stories_with_code = sum(1 for i in items if i.id in story_ids_with_code)
        stories_pending = [
            i for i in items if i.id not in story_ids_with_code and i.status != "done"
        ]

        # Decidir next_action
        if not vision:
            next_action = "set_vision"
            label = "Define la vision para empezar"
        elif not items:
            next_action = "generate_backlog"
            label = "Generar backlog y primer codigo"
        elif stories_pending:
            next_action = "generate_pending_code"
            label = f"Completar {len(stories_pending)} historias pendientes"
        elif code_files_total > 0:
            next_action = "ready_to_deploy"
            label = "Listo para desplegar"
        else:
            next_action = "regenerate"
            label = "Regenerar (warning)"

        return {
            "project_key": project_key,
            "vision_set": bool(vision),
            "backlog_count": len(items),
            "stories_with_code": stories_with_code,
            "stories_pending_count": len(stories_pending),
            "stories_pending": [
                {
                    "id": s.id,
                    "story_key": s.story_key,
                    "title": s.title,
                    "priority": s.priority,
                }
                for s in stories_pending[:10]
            ],
            "code_files_total": code_files_total,
            "last_build_stage": lb.stage if lb else None,
            "last_build_completed": bool(lb and lb.stage == "completed"),
            "next_action": next_action,
            "next_action_label": label,
        }
    return {"project_key": project_key, "vision_set": False, "next_action": "set_vision"}

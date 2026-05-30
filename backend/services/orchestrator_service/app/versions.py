"""Gestion de versiones del ciclo de vida.

Proyecto -> N Versiones -> N Sprints -> N Tareas.

Reglas (decision de arquitectura para software facil/escalable/mantenible):
- v1 se crea al crear el proyecto = lo que el cliente pidio primero.
- Una version ACUMULA codigo: los sprints de una version suman al mismo
  codebase (no se borra entre sprints) -> entrega incremental real.
- Una version NUEVA parte del codigo de la anterior (copy-forward de los
  CodeArtifact) y le agrega los cambios grandes. Asi el cliente evoluciona su
  software sin perder lo construido.
- Cambios chicos / bugs NO necesitan version nueva: son tareas en la version activa.
"""
from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select

from shared.db.models import CodeArtifact, ProjectVersion, Sprint
from shared.observability import get_logger

logger = get_logger(__name__)


async def get_active_version(session, project_key: str) -> ProjectVersion | None:
    """Version activa (donde se trabaja ahora). Si no hay, la de mayor numero."""
    active = (await session.execute(
        select(ProjectVersion).where(
            ProjectVersion.project_key == project_key,
            ProjectVersion.status == "active",
        ).order_by(ProjectVersion.number.desc())
    )).scalars().first()
    if active:
        return active
    return (await session.execute(
        select(ProjectVersion).where(ProjectVersion.project_key == project_key)
        .order_by(ProjectVersion.number.desc())
    )).scalars().first()


async def ensure_v1(session, project_key: str) -> ProjectVersion:
    """Garantiza que el proyecto tenga al menos una version (v1 activa)."""
    existing = (await session.execute(
        select(ProjectVersion).where(ProjectVersion.project_key == project_key)
        .order_by(ProjectVersion.number.asc())
    )).scalars().first()
    if existing:
        return existing
    v = ProjectVersion(
        id=str(uuid4()), project_key=project_key, number=1,
        name="v1 - Versión inicial",
        description="Lo que el cliente pidió primero.",
        status="active", order_index=0,
    )
    session.add(v)
    await session.flush()
    logger.info("v1_created", project=project_key, version=v.id)
    return v


async def create_version(
    session, project_key: str, name: str, description: str,
    copy_code_from_active: bool = True,
) -> ProjectVersion:
    """Crea una version nueva. Por defecto PARTE del codigo de la version activa
    (copy-forward) para que el cliente evolucione sin perder lo construido."""
    # numero siguiente
    last = (await session.execute(
        select(ProjectVersion).where(ProjectVersion.project_key == project_key)
        .order_by(ProjectVersion.number.desc())
    )).scalars().first()
    next_num = (last.number + 1) if last else 1
    based_on = last.id if last else None

    v = ProjectVersion(
        id=str(uuid4()), project_key=project_key, number=next_num,
        name=name or f"v{next_num}",
        description=description or "",
        status="draft", order_index=next_num - 1,
        based_on_version_id=based_on,
    )
    session.add(v)
    await session.flush()

    # copy-forward del codigo de la version anterior -> base de la nueva
    copied = 0
    if copy_code_from_active and based_on:
        prev_artifacts = (await session.execute(
            select(CodeArtifact).where(
                CodeArtifact.project_key == project_key,
                CodeArtifact.version_id == based_on,
            )
        )).scalars().all()
        for a in prev_artifacts:
            session.add(CodeArtifact(
                id=str(uuid4()), project_key=project_key, version_id=v.id,
                story_id=None, file_path=a.file_path, language=a.language,
                content=a.content,
            ))
            copied += 1
    await session.flush()
    logger.info("version_created", project=project_key, version=v.id,
                number=next_num, copied_files=copied)
    return v


def version_dict(v: ProjectVersion, sprint_count: int = 0, file_count: int = 0) -> dict:
    return {
        "id": v.id, "number": v.number, "name": v.name,
        "description": v.description, "status": v.status,
        "based_on_version_id": v.based_on_version_id,
        "order_index": v.order_index,
        "sprint_count": sprint_count, "file_count": file_count,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "released_at": v.released_at.isoformat() if v.released_at else None,
    }

"""Repository del agregado Project."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import Project


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_key(self, key: str) -> Project | None:
        return (
            await self.session.execute(select(Project).where(Project.key == key))
        ).scalar_one_or_none()

    async def list_by_owner(self, owner_id: str) -> list[Project]:
        return list(
            (
                await self.session.execute(
                    select(Project)
                    .where(Project.owner_id == owner_id)
                    .order_by(Project.created_at.desc())
                )
            ).scalars().all()
        )

    async def set_workflow_state(self, key: str, state: str) -> Project | None:
        proj = await self.get_by_key(key)
        if proj:
            proj.workflow_state = state
            await self.session.commit()
        return proj

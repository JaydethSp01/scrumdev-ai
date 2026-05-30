"""Repository del agregado BacklogItem + Sprint."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import BacklogItem, Sprint


class BacklogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_project(self, project_key: str) -> list[BacklogItem]:
        return list(
            (
                await self.session.execute(
                    select(BacklogItem)
                    .where(BacklogItem.project_key == project_key)
                    .order_by(BacklogItem.order_index)
                )
            ).scalars().all()
        )

    async def list_by_sprint(self, sprint_id: str) -> list[BacklogItem]:
        return list(
            (
                await self.session.execute(
                    select(BacklogItem).where(BacklogItem.sprint_id == sprint_id)
                )
            ).scalars().all()
        )

    async def active_sprint(self, project_key: str) -> Sprint | None:
        return (
            await self.session.execute(
                select(Sprint).where(
                    Sprint.project_key == project_key, Sprint.status == "active"
                )
            )
        ).scalar_one_or_none()

    async def sprints(self, project_key: str) -> list[Sprint]:
        return list(
            (
                await self.session.execute(
                    select(Sprint)
                    .where(Sprint.project_key == project_key)
                    .order_by(Sprint.order_index)
                )
            ).scalars().all()
        )

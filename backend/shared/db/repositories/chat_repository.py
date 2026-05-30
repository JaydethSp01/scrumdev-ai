"""Repository del agregado ChatMessage."""
from __future__ import annotations

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.models import ChatMessage


class ChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def history(self, project_key: str, user_id: str, limit: int = 200) -> list[ChatMessage]:
        return list(
            (
                await self.session.execute(
                    select(ChatMessage)
                    .where(
                        ChatMessage.project_key == project_key,
                        ChatMessage.user_id == user_id,
                    )
                    .order_by(ChatMessage.created_at.asc())
                    .limit(limit)
                )
            ).scalars().all()
        )

    async def add(self, msg: ChatMessage) -> None:
        self.session.add(msg)

    async def clear(self, project_key: str, user_id: str) -> int:
        result = await self.session.execute(
            sa_delete(ChatMessage).where(
                ChatMessage.project_key == project_key,
                ChatMessage.user_id == user_id,
            )
        )
        await self.session.commit()
        return result.rowcount or 0

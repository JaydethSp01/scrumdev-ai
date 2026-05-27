from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI
from sqlalchemy import select

from services.conversation_service.app.models.chat_message import ChatMessage
from shared.clients.http import post_json
from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import Conversation, Message
from shared.db.session import get_session
from shared.events.domain_events import DomainEvent
from shared.events.event_bus import event_bus
from shared.events.event_types import HUMAN_MESSAGE_RECEIVED
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("conversation-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Conversation Service", version="0.1.0")
instrument_app(app, "conversation-service")


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "conversation-service"}


async def _ensure_conversation(message: ChatMessage) -> str:
    async for session in get_session():
        stmt = (
            select(Conversation)
            .where(
                Conversation.user_id == message.user_id,
                Conversation.project_key == message.project_key,
                Conversation.issue_key == message.issue_key,
            )
            .limit(1)
        )
        result = await session.execute(stmt)
        conversation = result.scalar_one_or_none()
        if conversation is None:
            conversation = Conversation(
                user_id=message.user_id,
                project_key=message.project_key,
                issue_key=message.issue_key,
            )
            session.add(conversation)
            await session.commit()
            await session.refresh(conversation)
        return conversation.id


async def _persist_message(conversation_id: str, role: str, content: str) -> None:
    async for session in get_session():
        session.add(Message(conversation_id=conversation_id, role=role, content=content))
        await session.commit()


@app.post("/messages")
async def receive_message(message: ChatMessage) -> dict:
    correlation_id = str(uuid4())
    conversation_id: str | None = None
    try:
        conversation_id = await _ensure_conversation(message)
        await _persist_message(conversation_id, "user", message.content)
    except Exception as exc:
        logger.warning("persistence_unavailable", error=str(exc))

    await event_bus.publish(
        DomainEvent(
            event_type=HUMAN_MESSAGE_RECEIVED,
            source_service="conversation-service",
            correlation_id=correlation_id,
            project_key=message.project_key,
            issue_key=message.issue_key,
            payload=message.model_dump(),
        )
    )

    try:
        orchestrator_response = await post_json(
            f"{settings.orchestrator_service_url}/workflows/start",
            {
                "user_id": message.user_id,
                "project_key": message.project_key,
                "issue_key": message.issue_key,
                "message": message.content,
                "crew_name": "refinement",
            },
            timeout=180.0,
        )
    except Exception as exc:
        logger.error("orchestrator_unreachable", error=str(exc))
        orchestrator_response = {
            "success": False,
            "error": f"orchestrator-service unreachable: {exc}",
        }

    assistant_message = ""
    if orchestrator_response.get("success"):
        result = orchestrator_response.get("result") or {}
        assistant_message = result.get("output") or "Workflow ejecutado."
    else:
        assistant_message = orchestrator_response.get("error") or "No fue posible procesar."

    if conversation_id:
        try:
            await _persist_message(conversation_id, "assistant", assistant_message)
        except Exception as exc:
            logger.warning("persistence_unavailable", error=str(exc))

    return {
        "success": orchestrator_response.get("success", False),
        "correlation_id": correlation_id,
        "conversation_id": conversation_id,
        "assistant_message": assistant_message,
        "orchestrator": orchestrator_response,
    }

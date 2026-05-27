"""Audit Service - Fase 1: persiste eventos en Postgres si esta arriba, sino in-memory."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from sqlalchemy import select

from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import AuditEvent
from shared.db.session import get_session
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("audit-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Audit Service", version="0.1.0")
instrument_app(app, "audit-service")

_in_memory: list[dict] = []


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "audit-service"}


@app.post("/events")
async def ingest(event: dict) -> dict:
    try:
        async for session in get_session():
            session.add(
                AuditEvent(
                    event_type=event.get("event_type", "UNKNOWN"),
                    source_service=event.get("source_service", "unknown"),
                    correlation_id=event.get("correlation_id", "n/a"),
                    payload=event.get("payload", {}),
                )
            )
            await session.commit()
            return {"persisted": True}
    except Exception as exc:
        logger.warning("audit_db_unavailable", error=str(exc))
        _in_memory.append({**event, "received_at": datetime.now(timezone.utc).isoformat()})
        return {"persisted": False, "in_memory": True}
    return {"persisted": False}


@app.get("/events")
async def list_events(limit: int = 50) -> dict:
    try:
        async for session in get_session():
            result = await session.execute(
                select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(limit)
            )
            rows = result.scalars().all()
            return {
                "events": [
                    {
                        "id": r.id,
                        "event_type": r.event_type,
                        "source_service": r.source_service,
                        "correlation_id": r.correlation_id,
                        "payload": r.payload,
                        "occurred_at": r.occurred_at.isoformat(),
                    }
                    for r in rows
                ]
            }
    except Exception:
        return {"events": _in_memory[-limit:]}
    return {"events": []}

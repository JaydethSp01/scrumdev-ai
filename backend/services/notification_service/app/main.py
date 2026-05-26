"""Notification Service.

Fase 1: persiste notificaciones en Postgres y expone WebSocket para push live al
frontend. El frontend se suscribe a `ws://host:8010/ws/{user_id}` y recibe
mensajes JSON cuando alguien hace POST a /notify.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from contextlib import suppress

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select

from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import Notification
from shared.db.session import get_session
from shared.observability import configure_logging, get_logger

configure_logging("notification-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Notification Service", version="0.1.0")


class NotifyRequest(BaseModel):
    user_id: str
    title: str
    body: str
    channel: str = "in_app"


class BroadcastRequest(BaseModel):
    title: str
    body: str
    channel: str = "in_app"


_subscribers: dict[str, set[WebSocket]] = defaultdict(set)
_lock = asyncio.Lock()


async def _publish_ws(user_id: str, payload: dict) -> None:
    async with _lock:
        targets = list(_subscribers.get(user_id, set()))
        broadcasts = list(_subscribers.get("*", set()))
    dead: list[WebSocket] = []
    for ws in targets + broadcasts:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.append(ws)
    if dead:
        async with _lock:
            for ws in dead:
                for s in _subscribers.values():
                    s.discard(ws)


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str | int]:
    total = sum(len(s) for s in _subscribers.values())
    return {"status": "ok", "service": "notification-service", "ws_connections": total}


@app.post("/notify")
async def notify(req: NotifyRequest) -> dict:
    notif_id: str | None = None
    try:
        async for session in get_session():
            n = Notification(
                user_id=req.user_id, title=req.title, body=req.body, channel=req.channel
            )
            session.add(n)
            await session.commit()
            await session.refresh(n)
            notif_id = n.id
            break
    except Exception as exc:
        logger.warning("persist_failed", error=str(exc))

    payload = {
        "id": notif_id,
        "user_id": req.user_id,
        "title": req.title,
        "body": req.body,
        "channel": req.channel,
    }
    await _publish_ws(req.user_id, payload)
    return {"sent": True, "id": notif_id}


@app.post("/notify/broadcast")
async def broadcast(req: BroadcastRequest) -> dict:
    payload = {"title": req.title, "body": req.body, "channel": req.channel}
    await _publish_ws("*", payload)
    return {"sent": True, "channel": req.channel}


@app.get("/notifications/{user_id}")
async def list_notifications(user_id: str, limit: int = 50) -> dict:
    async for session in get_session():
        result = await session.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return {
            "notifications": [
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "channel": n.channel,
                    "read": n.read,
                    "created_at": n.created_at.isoformat(),
                }
                for n in rows
            ]
        }
    return {"notifications": []}


@app.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str) -> dict:
    async for session in get_session():
        n = await session.get(Notification, notification_id)
        if not n:
            raise HTTPException(status_code=404, detail="not found")
        n.read = True
        await session.commit()
        return {"id": notification_id, "read": True}
    raise HTTPException(status_code=503, detail="database unavailable")


@app.websocket("/ws/{user_id}")
async def ws_endpoint(websocket: WebSocket, user_id: str) -> None:
    await websocket.accept()
    async with _lock:
        _subscribers[user_id].add(websocket)
    logger.info("ws_connected", user_id=user_id)
    try:
        while True:
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("ws_error", error=str(exc))
    finally:
        async with _lock:
            _subscribers[user_id].discard(websocket)
        logger.info("ws_disconnected", user_id=user_id)

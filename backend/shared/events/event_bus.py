"""Bus de eventos hibrido: in-memory + RabbitMQ opcional + sink HTTP a audit_service.

El bus es in-memory POR PROCESO. Para que los eventos de TODOS los servicios
queden en el audit_service centralizado, hacemos fire-and-forget POST al
endpoint /events del audit_service cuando publicamos.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Awaitable, Callable

import httpx
import structlog

from shared.config.settings import settings
from shared.events.domain_events import DomainEvent
from shared.events.rabbitmq_bus import get_rabbitmq_bus

logger = structlog.get_logger(__name__)

Handler = Callable[[DomainEvent], Awaitable[None]]


class HybridEventBus:
    """Distribuye eventos a handlers locales y, si esta habilitado, a RabbitMQ."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._history: list[DomainEvent] = []
        self._history_limit = 500

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        self._history.append(event)
        if len(self._history) > self._history_limit:
            self._history = self._history[-self._history_limit :]

        logger.info(
            "event_published",
            event_type=event.event_type,
            source=event.source_service,
            correlation_id=event.correlation_id,
        )

        tasks = [self._safe_invoke(h, event) for h in self._handlers.get(event.event_type, [])]

        if settings.rabbitmq_enabled:
            rmq = get_rabbitmq_bus()
            if rmq is not None:
                tasks.append(self._publish_rabbitmq(rmq, event))

        # Sink HTTP al audit_service (fire-and-forget). El propio audit_service no
        # debe llamarse a si mismo para evitar loops infinitos.
        if event.source_service != "audit-service":
            tasks.append(self._publish_audit(event))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=False)

    @staticmethod
    async def _publish_audit(event: DomainEvent) -> None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{settings.audit_service_url}/events",
                    json={
                        "event_type": event.event_type,
                        "source_service": event.source_service,
                        "correlation_id": event.correlation_id,
                        "payload": event.payload,
                    },
                )
        except Exception:
            pass  # audit es best-effort, no rompe el flujo

    async def _safe_invoke(self, handler: Handler, event: DomainEvent) -> None:
        try:
            await handler(event)
        except Exception as exc:
            logger.error(
                "event_handler_failed",
                event_type=event.event_type,
                handler=handler.__name__,
                error=str(exc),
            )

    @staticmethod
    async def _publish_rabbitmq(rmq, event: DomainEvent) -> None:
        try:
            await rmq.publish(event)
        except Exception as exc:
            logger.warning("rabbitmq_publish_warn", error=str(exc))

    @property
    def history(self) -> list[DomainEvent]:
        return list(self._history)


event_bus = HybridEventBus()
InMemoryEventBus = HybridEventBus  # alias retrocompatibilidad

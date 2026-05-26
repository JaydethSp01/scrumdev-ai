"""RabbitMQ event bus adapter.

Activado solo si RABBITMQ_ENABLED=true. Publica eventos en exchange topic
`scrumdev.events` con routing key = event_type. Los servicios suscriptores
crean colas exclusivas y atan bindings con el patron que les interese.
"""
from __future__ import annotations

import asyncio
import json

from shared.config.settings import settings
from shared.events.domain_events import DomainEvent
from shared.observability import get_logger

logger = get_logger(__name__)

EXCHANGE_NAME = "scrumdev.events"


class RabbitMQEventBus:
    def __init__(self) -> None:
        self._connection = None
        self._channel = None
        self._exchange = None
        self._lock = asyncio.Lock()

    async def _ensure_connected(self) -> bool:
        if self._exchange is not None:
            return True
        async with self._lock:
            if self._exchange is not None:
                return True
            try:
                import aio_pika
            except ImportError as exc:
                logger.warning("aio_pika_missing", error=str(exc))
                return False
            try:
                self._connection = await aio_pika.connect_robust(settings.rabbitmq_url)
                self._channel = await self._connection.channel()
                self._exchange = await self._channel.declare_exchange(
                    EXCHANGE_NAME, aio_pika.ExchangeType.TOPIC, durable=True
                )
                logger.info("rabbitmq_connected", url=settings.rabbitmq_url)
                return True
            except Exception as exc:
                logger.warning("rabbitmq_connect_failed", error=str(exc))
                return False

    async def publish(self, event: DomainEvent) -> bool:
        if not await self._ensure_connected():
            return False
        try:
            import aio_pika
        except ImportError:
            return False
        try:
            message = aio_pika.Message(
                body=event.model_dump_json().encode(),
                content_type="application/json",
                headers={"event_id": event.event_id, "source": event.source_service},
            )
            assert self._exchange is not None
            await self._exchange.publish(message, routing_key=event.event_type)
            return True
        except Exception as exc:
            logger.warning("rabbitmq_publish_failed", error=str(exc))
            return False

    async def close(self) -> None:
        if self._connection:
            try:
                await self._connection.close()
            except Exception:
                pass


_rabbitmq_bus: RabbitMQEventBus | None = None


def get_rabbitmq_bus() -> RabbitMQEventBus | None:
    global _rabbitmq_bus
    if not settings.rabbitmq_enabled:
        return None
    if _rabbitmq_bus is None:
        _rabbitmq_bus = RabbitMQEventBus()
    return _rabbitmq_bus

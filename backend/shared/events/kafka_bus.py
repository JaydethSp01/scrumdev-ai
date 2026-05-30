"""Kafka event bus adapter - FASE D.

La guia Delfin §4.2: "Bus de eventos recomendado para produccion: Kafka,
NATS o RabbitMQ". Kafka es el estandar de produccion para event-driven a escala.

Activado solo si KAFKA_ENABLED=true. Publica en topics por dominio:
  scrumdev.workflow   - eventos de workflow/state machine
  scrumdev.agent      - ejecuciones de agentes
  scrumdev.deploy     - deploys
  scrumdev.events     - catch-all

Routing por event_type prefix.
"""
from __future__ import annotations

import asyncio
import json

from shared.config.settings import settings
from shared.events.domain_events import DomainEvent
from shared.observability import get_logger

logger = get_logger(__name__)


def _topic_for(event_type: str) -> str:
    et = (event_type or "").lower()
    if et.startswith("workflow") or "approval" in et or "state" in et:
        return "scrumdev.workflow"
    if et.startswith("agent") or "crew" in et:
        return "scrumdev.agent"
    if "deploy" in et or "release" in et:
        return "scrumdev.deploy"
    return "scrumdev.events"


class KafkaEventBus:
    def __init__(self) -> None:
        self._producer = None
        self._lock = asyncio.Lock()

    async def _ensure_producer(self):
        if self._producer is not None:
            return self._producer
        async with self._lock:
            if self._producer is not None:
                return self._producer
            try:
                from aiokafka import AIOKafkaProducer
            except ImportError:
                logger.warning("aiokafka_missing")
                return None
            try:
                producer = AIOKafkaProducer(
                    bootstrap_servers=settings.kafka_bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v).encode(),
                    enable_idempotence=True,
                )
                await producer.start()
                self._producer = producer
                logger.info("kafka_producer_started", servers=settings.kafka_bootstrap_servers)
                return producer
            except Exception as exc:
                logger.warning("kafka_connect_failed", error=str(exc))
                return None

    async def publish(self, event: DomainEvent) -> None:
        producer = await self._ensure_producer()
        if producer is None:
            return
        topic = _topic_for(event.event_type)
        payload = {
            "event_type": event.event_type,
            "source_service": event.source_service,
            "correlation_id": event.correlation_id,
            "project_key": getattr(event, "project_key", None),
            "issue_key": getattr(event, "issue_key", None),
            "payload": event.payload,
        }
        try:
            # key por correlation_id para ordering por workflow
            key = (event.correlation_id or "na").encode()
            await producer.send_and_wait(topic, value=payload, key=key)
        except Exception as exc:
            logger.warning("kafka_publish_failed", topic=topic, error=str(exc))

    async def close(self) -> None:
        if self._producer is not None:
            try:
                await self._producer.stop()
            except Exception:
                pass
            self._producer = None


_kafka_bus: KafkaEventBus | None = None


def get_kafka_bus() -> KafkaEventBus | None:
    global _kafka_bus
    if not settings.kafka_enabled:
        return None
    if _kafka_bus is None:
        _kafka_bus = KafkaEventBus()
    return _kafka_bus

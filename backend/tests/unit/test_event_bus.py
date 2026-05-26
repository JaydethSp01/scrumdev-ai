import pytest

from shared.events.domain_events import DomainEvent
from shared.events.event_bus import InMemoryEventBus


@pytest.mark.asyncio
async def test_publish_invokes_subscribers() -> None:
    bus = InMemoryEventBus()
    received: list[DomainEvent] = []

    async def handler(event: DomainEvent) -> None:
        received.append(event)

    bus.subscribe("PING", handler)
    await bus.publish(
        DomainEvent(
            event_type="PING",
            source_service="test",
            correlation_id="c1",
            payload={"x": 1},
        )
    )
    assert len(received) == 1
    assert received[0].payload["x"] == 1


@pytest.mark.asyncio
async def test_history_records_events() -> None:
    bus = InMemoryEventBus()
    await bus.publish(
        DomainEvent(event_type="A", source_service="t", correlation_id="c", payload={})
    )
    await bus.publish(
        DomainEvent(event_type="B", source_service="t", correlation_id="c", payload={})
    )
    assert len(bus.history) == 2
    assert [e.event_type for e in bus.history] == ["A", "B"]

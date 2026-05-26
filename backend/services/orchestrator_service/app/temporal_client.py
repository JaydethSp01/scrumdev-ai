"""Cliente Temporal opcional. Se inicializa solo si TEMPORAL_ENABLED=true.

El orchestrator usa este cliente para arrancar workflows durables cuando esta
disponible; sino cae a llamada HTTP sincrona al agent_runtime.
"""
from __future__ import annotations

from typing import Any

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)

_client = None


async def get_client():
    global _client
    if not settings.temporal_enabled:
        return None
    if _client is not None:
        return _client
    try:
        from temporalio.client import Client

        _client = await Client.connect(
            settings.temporal_host, namespace=settings.temporal_namespace
        )
        logger.info("temporal_client_connected", host=settings.temporal_host)
        return _client
    except Exception as exc:
        logger.warning("temporal_client_unavailable", error=str(exc))
        return None


async def start_workflow(crew_name: str, inputs: dict[str, Any], correlation_id: str) -> dict | None:
    client = await get_client()
    if client is None:
        return None
    try:
        from temporal.workflows.software_delivery_workflow import (
            CrewCommand,
            SoftwareDeliveryWorkflow,
        )

        cmd = CrewCommand(crew_name=crew_name, inputs=inputs, correlation_id=correlation_id)
        handle = await client.start_workflow(
            SoftwareDeliveryWorkflow.run,
            cmd,
            id=f"wf-{correlation_id}",
            task_queue=settings.temporal_task_queue,
        )
        result = await handle.result()
        return result
    except Exception as exc:
        logger.warning("temporal_workflow_failed", error=str(exc))
        return None

"""Activity: ejecuta un crew CrewAI/Claude via agent_runtime_service.

Reintentos por defecto: 3, backoff exponencial. Idempotente respecto al
correlation_id (el agent_runtime debe deduplicar).
"""
from __future__ import annotations

import httpx
from temporalio import activity

from shared.config.settings import settings


@activity.defn
async def run_crew_activity(crew_name: str, inputs: dict, correlation_id: str) -> dict:
    """Llama POST /crews/{name}/run y devuelve el output."""
    async with httpx.AsyncClient(timeout=600.0) as client:
        r = await client.post(
            f"{settings.agent_runtime_service_url}/crews/{crew_name}/run",
            json={"inputs": inputs, "correlation_id": correlation_id},
        )
        r.raise_for_status()
        return r.json()

"""Activity: registra una decision humana pendiente y espera signal.

El workflow llama esta activity en el approval gate antes de deploy a prod.
Crea un HumanDecision en DB con status='pending' y un Notification al user.
El workflow espera signal `approval_received` antes de proceder.
"""
from __future__ import annotations

import httpx
from temporalio import activity

from shared.config.settings import settings


@activity.defn
async def request_human_approval(
    project_key: str,
    decision_type: str,
    title: str,
    summary: str,
    requested_by: str,
) -> dict:
    """Crea HumanDecision pendiente y notificacion. Retorna decision_id."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{settings.orchestrator_service_url}/decisions",
            json={
                "project_key": project_key,
                "decision_type": decision_type,
                "title": title,
                "summary": summary,
                "requested_by": requested_by,
            },
        )
        r.raise_for_status()
        return r.json()

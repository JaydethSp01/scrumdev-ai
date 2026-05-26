"""Activity: crea/actualiza issues en Jira via jira_connector_service."""
from __future__ import annotations

import httpx
from temporalio import activity

from shared.config.settings import settings


@activity.defn
async def push_to_jira(stories: list[dict], project_key: str) -> dict:
    """Empuja un set de stories a Jira. Retorna mapa story_key -> issue_key."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{settings.jira_connector_service_url}/issues/bulk",
            json={"project_key": project_key, "stories": stories},
        )
        r.raise_for_status()
        return r.json()

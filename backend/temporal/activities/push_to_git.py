"""Activity: pushea codigo a GitHub via git_connector_service."""
from __future__ import annotations

import httpx
from temporalio import activity

from shared.config.settings import settings


@activity.defn
async def push_to_git(repo: str, files: list[dict], branch: str = "main") -> dict:
    """Sube los files al repo en GitHub. Retorna sha + url del commit."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{settings.git_connector_service_url}/push",
            json={"repo": repo, "branch": branch, "files": files},
        )
        r.raise_for_status()
        return r.json()

"""Activity: dispara deploy a Vercel via deploy_connector_service."""
from __future__ import annotations

import httpx
from temporalio import activity

from shared.config.settings import settings


@activity.defn
async def deploy_to_vercel(project_name: str, git_branch: str = "main") -> dict:
    """Triggers production deploy en Vercel."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{settings.deploy_connector_service_url}/vercel/deploy",
            json={
                "name": project_name,
                "git_owner": settings.scrumdev_git_owner,
                "git_repo": project_name,
                "git_branch": git_branch,
            },
        )
        r.raise_for_status()
        return r.json()

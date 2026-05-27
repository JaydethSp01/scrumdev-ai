"""Adapter Render - fallback cuando Vercel agota free tier."""
from __future__ import annotations

import httpx

from shared.config.settings import settings
from .vercel_adapter import DeployResult


class RenderDeployAdapter:
    name = "render"

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.deploy_connector_service_url

    async def ensure_project(self, name: str, repo_full_name: str, framework: str = "nextjs") -> DeployResult:
        owner, _, repo = repo_full_name.partition("/")
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.base_url}/render/services",
                json={
                    "name": name,
                    "git_owner": owner,
                    "git_repo": repo,
                    "branch": "main",
                    "runtime": "node",
                    "build_command": "npm install && npm run build",
                    "start_command": "npm start",
                },
            )
            data = r.json() if r.status_code < 500 else {"error": r.text}
            if "error" in data:
                return DeployResult(ok=False, error=data.get("error"), project=name)
            svc = data.get("service") or data
            url = svc.get("serviceDetails", {}).get("url") or svc.get("dashboardUrl")
            return DeployResult(ok=True, url=url, state="created", project=name)

    async def trigger_deploy(self, project_name: str, branch: str = "main") -> DeployResult:
        # En Render el primer deploy se dispara con la creacion del servicio.
        # Para re-deploy: necesita service_id. Para simplicidad delegamos al servicio.
        return DeployResult(ok=True, state="auto-on-push", project=project_name)

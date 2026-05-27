"""Adapter Vercel implementa DeployPort."""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from shared.config.settings import settings


@dataclass
class DeployResult:
    ok: bool
    url: str | None = None
    state: str | None = None
    project: str | None = None
    error: str | None = None
    quota_exceeded: bool = False


_QUOTA_SIGNALS = (
    "payment_required",
    "free-per-day",
    "resource is limited",
    "402",
    "quota",
)


def _looks_like_quota(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    return any(s in lower for s in _QUOTA_SIGNALS)


class VercelDeployAdapter:
    """DeployPort para Vercel."""

    name = "vercel"

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.deploy_connector_service_url

    async def ensure_project(self, name: str, repo_full_name: str, framework: str = "nextjs") -> DeployResult:
        owner, _, repo = repo_full_name.partition("/")
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.base_url}/vercel/projects",
                json={"name": name, "git_owner": owner, "git_repo": repo, "framework": framework},
            )
            data = r.json() if r.status_code < 500 else {"error": r.text}
            if "error" in data:
                return DeployResult(
                    ok=False,
                    error=data.get("error"),
                    project=name,
                    quota_exceeded=_looks_like_quota(str(data.get("error", ""))),
                )
            return DeployResult(ok=True, project=name)

    async def trigger_deploy(self, project_name: str, branch: str = "main") -> DeployResult:
        owner = settings.scrumdev_git_owner or ""
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.base_url}/vercel/deploy",
                json={"name": project_name, "git_owner": owner, "git_repo": project_name, "git_branch": branch},
            )
            data = r.json() if r.status_code < 500 else {"error": r.text}
            if "error" in data:
                return DeployResult(
                    ok=False,
                    error=data.get("error"),
                    project=project_name,
                    quota_exceeded=_looks_like_quota(str(data.get("error", ""))),
                )
            return DeployResult(
                ok=True,
                url=data.get("url"),
                state=data.get("readyState") or "INITIALIZING",
                project=project_name,
            )

    async def set_env_var(self, project: str, key: str, value: str, targets: list[str] | None = None) -> dict:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{self.base_url}/vercel/env",
                json={
                    "project_id_or_name": project,
                    "key": key,
                    "value": value,
                    "target": targets or ["production", "preview", "development"],
                },
            )
            return r.json() if r.status_code < 500 else {"error": r.text}

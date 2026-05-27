"""DeployOrchestrator - extrae 243 LOC del god service main.py.

Hexagonal: recibe `primary`, `fallback`, `db` por constructor. El god service
solo lo instancia y delega. Agregar Netlify/Fly = nuevo adapter, no se toca
nada de esta clase (Open/Closed).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

from .adapters.neon_adapter import NeonDatabaseAdapter
from .adapters.render_adapter import RenderDeployAdapter
from .adapters.vercel_adapter import DeployResult, VercelDeployAdapter

logger = get_logger(__name__)


@dataclass
class DeployOrchestrationResult:
    primary_provider: str
    fallback_provider: str | None = None
    used_provider: str | None = None
    url: str | None = None
    state: str | None = None
    db_provisioned: bool = False
    db_url_set: bool = False
    error: str | None = None
    raw: dict = field(default_factory=dict)


class DeployOrchestrator:
    """Coordina deploy con fallback + DB auto-provision."""

    def __init__(
        self,
        primary: VercelDeployAdapter | None = None,
        fallback: RenderDeployAdapter | None = None,
        db: NeonDatabaseAdapter | None = None,
    ) -> None:
        self.primary = primary or VercelDeployAdapter()
        self.fallback = fallback or RenderDeployAdapter()
        self.db = db or NeonDatabaseAdapter()

    async def _vercel_env_keys(self, project_name: str) -> set[str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{settings.deploy_connector_service_url}/vercel/env/{project_name}"
                )
                if r.status_code != 200:
                    return set()
                envs = r.json().get("envs", [])
                return {e.get("key") for e in envs if e.get("key")}
        except Exception:
            return set()

    async def deploy(
        self, project_name: str, git_owner: str, git_repo: str, framework: str = "nextjs"
    ) -> DeployOrchestrationResult:
        repo_full = f"{git_owner}/{git_repo}"
        result = DeployOrchestrationResult(primary_provider=self.primary.name)

        # 1. Intentar primary (Vercel) - ensure project
        ensure = await self.primary.ensure_project(project_name, repo_full, framework)
        if ensure.quota_exceeded:
            return await self._fallback(project_name, repo_full, framework, result, reason="quota")
        if not ensure.ok and ensure.error:
            logger.warning("primary_ensure_failed", error=ensure.error)

        # 2. Trigger deploy primary
        trigger = await self.primary.trigger_deploy(project_name)
        if trigger.quota_exceeded:
            return await self._fallback(project_name, repo_full, framework, result, reason="quota")

        result.used_provider = self.primary.name
        result.url = trigger.url
        result.state = trigger.state

        # 3. Auto-provision DB si no esta seteada
        await self._maybe_provision_db(project_name, result)

        return result

    async def _fallback(
        self,
        project_name: str,
        repo_full: str,
        framework: str,
        result: DeployOrchestrationResult,
        reason: str,
    ) -> DeployOrchestrationResult:
        logger.warning("falling_back_to_render", reason=reason, project=project_name)
        result.fallback_provider = self.fallback.name
        r = await self.fallback.ensure_project(project_name, repo_full, framework)
        if r.ok:
            result.used_provider = self.fallback.name
            result.url = r.url
            result.state = r.state or "created"
        else:
            result.error = r.error or "fallback_failed"
        return result

    async def _maybe_provision_db(
        self, project_name: str, result: DeployOrchestrationResult
    ) -> None:
        try:
            existing = await self._vercel_env_keys(project_name)
            if "POSTGRES_URL" in existing or "DATABASE_URL" in existing:
                result.db_url_set = True
                return
            db_resp = await self.db.ensure_database(project_name)
            if not db_resp.get("ok"):
                return
            conn = db_resp.get("connection_uri")
            if not conn:
                return
            for key in ("POSTGRES_URL", "DATABASE_URL"):
                await self.primary.set_env_var(project_name, key, conn)
            result.db_provisioned = True
            result.db_url_set = True
        except Exception as exc:
            logger.warning("db_provision_skipped", error=str(exc))

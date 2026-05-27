"""Adapter Neon Postgres - auto-provision DB sin user input."""
from __future__ import annotations

import httpx

from shared.config.settings import settings


class NeonDatabaseAdapter:
    name = "neon"

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.deploy_connector_service_url

    async def ensure_database(self, project_name: str) -> dict:
        """Crea (o reusa) proyecto Neon y retorna connection_uri."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{self.base_url}/neon/projects", json={"name": project_name}
            )
            data = r.json() if r.status_code < 500 else {"ok": False, "error": r.text}
            return data

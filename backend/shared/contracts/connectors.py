"""Puertos (interfaces) de conectores externos.

La guia Delfin sec 1.2: el orquestador conoce CONTRATOS, no implementaciones.
Esto permite cambiar GitHub→GitLab o Jira→Asana implementando un nuevo
adaptador sin tocar el resto del sistema.

Cada microservicio conector implementa estos protocolos. El orchestrator
hace HTTP a sus endpoints definidos en el contrato HTTP de cada servicio.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class IssueTrackerPort(Protocol):
    """Adapter para Jira / Asana / Linear / Notion / ClickUp / etc."""

    name: str

    async def create_issue(
        self, project_key: str, title: str, description: str, labels: list[str]
    ) -> dict:
        """Crea un issue. Retorna {'issue_key': str, 'url': str}."""
        ...

    async def update_issue(self, issue_key: str, fields: dict) -> dict:
        """Update parcial de un issue."""
        ...

    async def get_issue(self, issue_key: str) -> dict:
        """Lee un issue."""
        ...

    async def list_issues(self, project_key: str, jql_or_filter: str | None) -> list[dict]:
        """Lista issues del proyecto."""
        ...

    async def add_comment(self, issue_key: str, comment: str) -> dict:
        """Anade comentario."""
        ...


@runtime_checkable
class VersionControlPort(Protocol):
    """Adapter para GitHub / GitLab / Bitbucket / Gitea / Codeberg / etc."""

    name: str

    async def ensure_repo(self, owner: str, name: str, private: bool) -> dict:
        """Crea repo si no existe. Retorna {'url': str, 'clone_url': str}."""
        ...

    async def push_files(
        self, owner: str, name: str, files: list[dict], branch: str, message: str
    ) -> dict:
        """Sube archivos al repo. files: [{path, content}]."""
        ...

    async def create_webhook(
        self, owner: str, name: str, url: str, secret: str, events: list[str]
    ) -> dict:
        """Registra un webhook hacia nosotros."""
        ...


@runtime_checkable
class DeployPort(Protocol):
    """Adapter para Vercel / Netlify / Render / Fly.io / Railway / etc."""

    name: str

    async def ensure_project(self, name: str, repo_full_name: str, framework: str) -> dict:
        """Crea proyecto si no existe."""
        ...

    async def trigger_deploy(self, project_name: str, branch: str) -> dict:
        """Dispara deploy. Retorna {'url': str, 'state': str}."""
        ...

    async def latest_state(self, project_name: str) -> dict:
        """Estado del ultimo deployment."""
        ...

    async def set_env_var(self, project: str, key: str, value: str, targets: list[str]) -> dict:
        """Setea variable de entorno."""
        ...

"""Cliente Vercel API minimo para crear projects + trigger deploys.

Docs: https://vercel.com/docs/rest-api
Necesita VERCEL_TOKEN (https://vercel.com/account/tokens) y opcional team id.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from shared.config.settings import settings

API_BASE = "https://api.vercel.com"


def _token() -> str | None:
    return settings.vercel_token or os.environ.get("VERCEL_TOKEN")


def _team_id() -> str | None:
    return settings.vercel_team_id or os.environ.get("VERCEL_TEAM_ID")


def _team_query() -> str:
    t = _team_id()
    return f"?teamId={t}" if t else ""


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(_token())


async def disable_sso_protection(project_id_or_name: str) -> dict[str, Any]:
    """Desactiva ssoProtection del proyecto.

    Por default en planes Pro/Team, Vercel pone deployment protection que
    obliga a login a Vercel para ver el preview. Para apps que entregamos
    a usuarios finales (no-tech), esto NO tiene sentido. Lo desactivamos
    al crear el proyecto.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.patch(
            f"{API_BASE}/v9/projects/{project_id_or_name}{_team_query()}",
            json={"ssoProtection": None, "passwordProtection": None},
            headers=_headers(),
        )
        if r.status_code >= 400:
            return {"ok": False, "error": r.text}
        return {"ok": True, "result": r.json()}


async def create_project_from_git_repo(
    name: str, git_owner: str, git_repo: str, framework: str = "nextjs"
) -> dict[str, Any]:
    """Crea proyecto Vercel apuntado al repo. Si ya existe, lo devuelve.

    AUTOMATICO: desactiva ssoProtection inmediato para que la URL publica
    no requiera login a Vercel (apps entregadas a usuarios finales).
    """
    project_name = name.lower().replace("_", "-")[:100]
    payload = {
        "name": project_name,
        "framework": framework,
        "gitRepository": {"type": "github", "repo": f"{git_owner}/{git_repo}"},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{API_BASE}/v10/projects{_team_query()}", json=payload, headers=_headers()
        )
        result: dict | None = None
        if r.status_code == 409 or (r.status_code >= 400 and "already exists" in r.text):
            get_r = await client.get(
                f"{API_BASE}/v9/projects/{project_name}{_team_query()}", headers=_headers()
            )
            if get_r.status_code == 200:
                result = {**get_r.json(), "_existed": True}
        elif r.status_code < 400:
            result = r.json()
        else:
            return {"error": r.text, "status": r.status_code}

    # Desactivar SSO (best-effort, no falla el create si esto falla)
    try:
        await disable_sso_protection(project_name)
        if result is not None:
            result["ssoProtection"] = None
    except Exception:
        pass

    return result or {"error": "unknown", "status": r.status_code}


async def latest_deployment(project_name_or_id: str) -> dict[str, Any]:
    """Devuelve el ultimo deployment del proyecto (url, state, readyState)."""
    qs = "&" if "?" in _team_query() else "?"
    sep = "&" if _team_query() else "?"
    url = f"{API_BASE}/v6/deployments{_team_query()}{sep if _team_query() else '?'}projectId={project_name_or_id}&limit=1"
    if not _team_query():
        url = f"{API_BASE}/v6/deployments?projectId={project_name_or_id}&limit=1"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_headers())
        if r.status_code >= 400:
            return {"error": r.text}
        data = r.json()
        deps = data.get("deployments", [])
        if not deps:
            return {"deployments": []}
        d = deps[0]
        return {
            "url": f"https://{d.get('url')}" if d.get("url") else None,
            "state": d.get("state"),
            "readyState": d.get("readyState"),
            "createdAt": d.get("createdAt"),
            "raw": d,
        }


async def list_deployments(project_name_or_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Lista los ultimos N deployments del proyecto (para rollback/status)."""
    sep = "&" if _team_query() else "?"
    url = f"{API_BASE}/v6/deployments{_team_query()}{sep}projectId={project_name_or_id}&limit={limit}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=_headers())
        if r.status_code >= 400:
            return []
        return r.json().get("deployments", [])


async def promote_deployment(project_name_or_id: str, deployment_id: str) -> dict[str, Any]:
    """Re-promueve un deployment previo a produccion (rollback)."""
    sep = "&" if _team_query() else "?"
    url = f"{API_BASE}/v10/projects/{project_name_or_id}/promote/{deployment_id}{_team_query()}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, headers=_headers())
        if r.status_code >= 400:
            return {"error": r.text, "status": r.status_code}
        return {"promoted": True, "deployment_id": deployment_id}


async def _github_repo_id(owner: str, repo: str) -> int | None:
    """Resuelve el id numerico del repo en GitHub (requerido por Vercel v13)."""
    token = settings.scrumdev_git_token or os.environ.get("SCRUMDEV_GIT_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}", headers=headers
        )
        if r.status_code == 200:
            return r.json().get("id")
    return None


async def trigger_deploy(
    project_name: str,
    git_branch: str = "main",
    git_owner: str | None = None,
    git_repo: str | None = None,
    repo_id: int | None = None,
) -> dict[str, Any]:
    # Vercel v13/deployments exige gitSource.repoId para GitHub. Lo resolvemos
    # desde la GitHub API si no nos lo pasaron explicito.
    if repo_id is None and git_owner and git_repo:
        repo_id = await _github_repo_id(git_owner, git_repo)
    git_source: dict[str, Any] = {"type": "github", "ref": git_branch}
    if repo_id is not None:
        git_source["repoId"] = repo_id
    elif git_owner and git_repo:
        # fallback con org/repo (algunas cuentas lo aceptan)
        git_source["org"] = git_owner
        git_source["repo"] = git_repo
    payload = {
        "name": project_name,
        "gitSource": git_source,
        "target": "production",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{API_BASE}/v13/deployments{_team_query()}", json=payload, headers=_headers()
        )
        if r.status_code >= 400:
            return {"error": r.text, "status": r.status_code}
        return r.json()


async def set_env_var(
    project_id_or_name: str,
    key: str,
    value: str,
    target: list[str] | None = None,
    var_type: str = "encrypted",
) -> dict[str, Any]:
    """Crea o actualiza una env var en el proyecto Vercel.

    Si ya existe una var con ese key en ese target, hace PATCH; si no, POST.
    Estable: este endpoint /v10/projects/{id}/env es el mismo que usa el
    dashboard de Vercel.
    """
    targets = target or ["production", "preview", "development"]
    body = {"key": key, "value": value, "target": targets, "type": var_type}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{API_BASE}/v10/projects/{project_id_or_name}/env{_team_query()}",
            json=body,
            headers=_headers(),
        )
        if r.status_code == 200 or r.status_code == 201:
            return {"ok": True, "result": r.json(), "action": "created"}
        if r.status_code == 400 and "already exists" in r.text.lower():
            list_r = await client.get(
                f"{API_BASE}/v9/projects/{project_id_or_name}/env{_team_query()}",
                headers=_headers(),
            )
            if list_r.status_code != 200:
                return {"ok": False, "error": list_r.text}
            for env in list_r.json().get("envs", []):
                if env.get("key") == key and set(env.get("target", [])) & set(targets):
                    env_id = env.get("id")
                    qs = _team_query()
                    sep = "&" if qs else "?"
                    patch_r = await client.patch(
                        f"{API_BASE}/v9/projects/{project_id_or_name}/env/{env_id}{qs}",
                        json={"value": value, "target": targets, "type": var_type},
                        headers=_headers(),
                    )
                    if patch_r.status_code == 200:
                        return {"ok": True, "result": patch_r.json(), "action": "updated"}
                    return {"ok": False, "error": patch_r.text, "status": patch_r.status_code}
            return {"ok": False, "error": "env_var_conflict_no_id"}
        return {"ok": False, "error": r.text, "status": r.status_code}


async def list_env_vars(project_id_or_name: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"{API_BASE}/v9/projects/{project_id_or_name}/env{_team_query()}",
            headers=_headers(),
        )
        if r.status_code >= 400:
            return {"error": r.text, "status": r.status_code}
        envs = r.json().get("envs", [])
        return {"envs": [{"key": e.get("key"), "target": e.get("target"), "type": e.get("type")} for e in envs]}


async def create_postgres_store(name: str, region: str = "iad1") -> dict[str, Any]:
    """Intenta provisionar Postgres Neon via Vercel Storage API.

    Esta API es nueva y puede requerir plan Pro. Si falla, devolvemos error
    estructurado para que la UI lo capture y le pida al user pegar
    POSTGRES_URL manual (ej. desde console.neon.tech free tier).
    """
    store_name = name.lower().replace("_", "-")[:60]
    body = {"name": store_name, "type": "postgres", "primaryRegion": region}
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(
            f"{API_BASE}/v1/storage/stores/integration{_team_query()}",
            json=body,
            headers=_headers(),
        )
        if r.status_code in (200, 201):
            return {"ok": True, "store": r.json()}
        return {
            "ok": False,
            "error": r.text,
            "status": r.status_code,
            "hint": "Vercel Postgres puede requerir un plan superior. "
            "Como alternativa pega POSTGRES_URL desde console.neon.tech (free tier).",
        }

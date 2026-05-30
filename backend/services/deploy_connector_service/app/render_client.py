"""Cliente Render API minimo - fallback cuando Vercel agota free tier.

Docs: https://api-docs.render.com
Auth: Bearer token from https://dashboard.render.com/u/settings#api-keys

Render free tier:
  - Web services free: 750h/mes (1 servicio always-on, varios con cold-start)
  - Sleeps tras 15 min inactivo, despierta en ~30s
  - Sin tarjeta requerida
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from shared.config.settings import settings

API_BASE = "https://api.render.com/v1"


def _token() -> str | None:
    return (
        getattr(settings, "scrumdev_render_api_token", None)
        or settings.scrumdev_deploy_api_token
        or os.environ.get("SCRUMDEV_RENDER_API_TOKEN")
    )


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def is_configured() -> bool:
    return bool(_token())


async def get_owner_id() -> str | None:
    """Devuelve el ownerId (workspace) del token."""
    if not _token():
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{API_BASE}/owners", headers=_headers())
        if r.status_code >= 400:
            return None
        data = r.json()
        if isinstance(data, list) and data:
            return data[0].get("owner", {}).get("id")
        return None


async def find_service_by_name(name: str) -> dict | None:
    """Busca un servicio por nombre."""
    if not _token():
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{API_BASE}/services?name={name}&limit=20",
            headers=_headers(),
        )
        if r.status_code >= 400:
            return None
        for entry in r.json():
            svc = entry.get("service", entry)
            if svc.get("name") == name:
                return svc
        return None


async def create_web_service(
    name: str,
    git_owner: str,
    git_repo: str,
    branch: str = "main",
    runtime: str = "node",
    build_command: str | None = None,
    start_command: str | None = None,
    env_vars: list[dict] | None = None,
) -> dict[str, Any]:
    """Crea un web service en Render desde un repo GitHub publico/privado.

    Para apps fullstack tipo BARISTA (Next.js + api/ Python):
      - runtime='node' + build='npm install && npm run build' + start='npm start'
      - Las funciones Python en /api/ NO se ejecutan en Render (solo Vercel),
        pero el frontend Next sirve mock data igual.
    """
    existing = await find_service_by_name(name)
    if existing:
        return {"existed": True, "service": existing}

    owner_id = await get_owner_id()
    if not owner_id:
        return {"error": "no_owner_found", "hint": "Token Render invalido o sin workspace"}

    body = {
        "type": "web_service",
        "name": name.lower().replace("_", "-")[:60],
        "ownerId": owner_id,
        "repo": f"https://github.com/{git_owner}/{git_repo}",
        "branch": branch,
        "autoDeploy": "yes",
        "serviceDetails": {
            "env": runtime,
            "runtime": runtime,
            "plan": "free",
            "region": "oregon",
            # Render lee build/start commands desde envSpecificDetails para
            # runtimes nativos (python/node). startCommand es OBLIGATORIO.
            "envSpecificDetails": {
                "buildCommand": build_command or "npm install && npm run build",
                "startCommand": start_command or "npm start",
            },
            "numInstances": 1,
        },
        "envVars": env_vars or [],
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(f"{API_BASE}/services", json=body, headers=_headers())
        if r.status_code >= 400:
            return {"error": r.text, "status": r.status_code}
        return r.json()


async def trigger_deploy(service_id: str, clear_cache: bool = False) -> dict[str, Any]:
    """Dispara un nuevo deploy del servicio."""
    body = {"clearCache": "clear" if clear_cache else "do_not_clear"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{API_BASE}/services/{service_id}/deploys", json=body, headers=_headers()
        )
        if r.status_code >= 400:
            return {"error": r.text, "status": r.status_code}
        return r.json()


async def latest_deploy(service_id: str) -> dict[str, Any]:
    """Devuelve el ultimo deploy con su estado."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{API_BASE}/services/{service_id}/deploys?limit=1", headers=_headers()
        )
        if r.status_code >= 400:
            return {"error": r.text}
        data = r.json()
        if not data:
            return {"deploys": []}
        d = data[0].get("deploy", data[0])
        return {
            "id": d.get("id"),
            "status": d.get("status"),
            "createdAt": d.get("createdAt"),
            "finishedAt": d.get("finishedAt"),
            "commit_id": (d.get("commit") or {}).get("id"),
            "raw": d,
        }


async def set_env_var(service_id: str, key: str, value: str) -> dict[str, Any]:
    """Update env var en el servicio. Render requiere PUT con array completo."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r_list = await client.get(
            f"{API_BASE}/services/{service_id}/env-vars", headers=_headers()
        )
        env_vars: list[dict] = []
        if r_list.status_code == 200:
            for entry in r_list.json():
                ev = entry.get("envVar", entry)
                if ev.get("key") != key:
                    env_vars.append({"key": ev["key"], "value": ev.get("value", "")})
        env_vars.append({"key": key, "value": value})
        r = await client.put(
            f"{API_BASE}/services/{service_id}/env-vars",
            json=env_vars,
            headers=_headers(),
        )
        if r.status_code >= 400:
            return {"ok": False, "error": r.text}
        return {"ok": True, "result": r.json()}

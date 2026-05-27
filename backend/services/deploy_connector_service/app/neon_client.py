"""Cliente Neon API - auto-provisiona Postgres por proyecto.

Docs: https://api-docs.neon.tech
Auth: Bearer token from https://console.neon.tech/app/settings/api-keys

El user NO debe pegar connection strings manualmente. La plataforma crea
una DB Neon nueva por cada proyecto generado y la inyecta automaticamente
como POSTGRES_URL en Vercel.

Neon free tier: 10 proyectos por cuenta, 0.5 GB cada uno, sin tarjeta.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from shared.config.settings import settings

API_BASE = "https://console.neon.tech/api/v2"


def _token() -> str | None:
    return (
        getattr(settings, "scrumdev_neon_api_key", None)
        or os.environ.get("SCRUMDEV_NEON_API_KEY")
    )


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def is_configured() -> bool:
    return bool(_token())


async def list_projects() -> list[dict]:
    """Lista todos los proyectos Neon en la cuenta."""
    if not _token():
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{API_BASE}/projects?limit=100", headers=_headers())
        if r.status_code >= 400:
            return []
        return r.json().get("projects", [])


async def find_project_by_name(name: str) -> dict | None:
    """Busca un proyecto Neon por nombre (case-insensitive)."""
    lname = name.lower()
    for p in await list_projects():
        if (p.get("name") or "").lower() == lname:
            return p
    return None


async def create_project(name: str, region: str = "aws-us-east-2") -> dict[str, Any]:
    """Crea proyecto Neon con default branch + role + database.

    Retorna {ok, project, connection_uri} donde connection_uri es el
    string `postgresql://...` listo para inyectar en Vercel.
    """
    if not _token():
        return {"ok": False, "error": "neon_api_key_not_configured"}

    safe_name = name.lower().replace("_", "-")[:60]
    body = {
        "project": {
            "name": safe_name,
            "region_id": region,
            "pg_version": 16,
            "default_endpoint_settings": {
                "autoscaling_limit_min_cu": 0.25,
                "autoscaling_limit_max_cu": 1,
                "suspend_timeout_seconds": 0,
            },
        }
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(f"{API_BASE}/projects", json=body, headers=_headers())
        if r.status_code >= 400:
            return {"ok": False, "error": r.text, "status": r.status_code}
        data = r.json()
        # Neon devuelve connection_uris[0].connection_uri tipo
        # postgresql://user:pass@host.neon.tech/dbname?sslmode=require
        conn_uri = None
        uris = data.get("connection_uris") or []
        if uris:
            conn_uri = uris[0].get("connection_uri")
        if not conn_uri:
            # Fallback: armar manualmente desde roles + database
            project = data.get("project", {})
            roles = data.get("roles", [])
            databases = data.get("databases", [])
            endpoint = (data.get("endpoints") or [{}])[0]
            host = endpoint.get("host")
            db_name = (databases[0].get("name") if databases else "neondb")
            role = (roles[0] if roles else {})
            role_name = role.get("name", "neondb_owner")
            password = role.get("password")
            if host and password:
                conn_uri = f"postgresql://{role_name}:{password}@{host}/{db_name}?sslmode=require"

        return {
            "ok": True,
            "project": data.get("project", data),
            "connection_uri": conn_uri,
            "raw": data,
        }


async def ensure_project(name: str, region: str = "aws-us-east-2") -> dict[str, Any]:
    """Obtiene o crea proyecto Neon para `name`.

    Si ya existe, devuelve un connection_uri NUEVO (Neon no devuelve
    passwords de roles existentes — tenemos que resetear o crear otro role).
    Si no existe, crea de cero.
    """
    if not _token():
        return {"ok": False, "error": "neon_api_key_not_configured"}

    existing = await find_project_by_name(name)
    if existing:
        # Reset password del default role para obtener connection_uri valido
        project_id = existing.get("id")
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                roles_r = await client.get(
                    f"{API_BASE}/projects/{project_id}/branches/main/roles",
                    headers=_headers(),
                )
                roles = roles_r.json().get("roles", []) if roles_r.status_code == 200 else []
                default_role = next(
                    (r for r in roles if not r.get("protected") and r.get("name") not in ("cloud_admin",)),
                    roles[0] if roles else None,
                )
                if not default_role:
                    return {"ok": False, "error": "no_role_found_in_neon_project"}
                reset_r = await client.post(
                    f"{API_BASE}/projects/{project_id}/branches/main/roles/{default_role['name']}/reset_password",
                    headers=_headers(),
                )
                if reset_r.status_code >= 400:
                    return {"ok": False, "error": reset_r.text}
                reset_data = reset_r.json()
                role_data = reset_data.get("role") or {}
                password = role_data.get("password")
                endpoints_r = await client.get(
                    f"{API_BASE}/projects/{project_id}/endpoints", headers=_headers()
                )
                endpoints = endpoints_r.json().get("endpoints", [])
                host = endpoints[0].get("host") if endpoints else None
                db_r = await client.get(
                    f"{API_BASE}/projects/{project_id}/branches/main/databases",
                    headers=_headers(),
                )
                dbs = db_r.json().get("databases", [])
                db_name = dbs[0].get("name") if dbs else "neondb"
                if host and password:
                    return {
                        "ok": True,
                        "project": existing,
                        "connection_uri": f"postgresql://{default_role['name']}:{password}@{host}/{db_name}?sslmode=require",
                        "existed": True,
                    }
                return {"ok": False, "error": "could_not_compose_connection_uri"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    return await create_project(name, region)

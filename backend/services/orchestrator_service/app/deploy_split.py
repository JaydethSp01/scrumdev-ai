"""Deploy split: front Next.js -> Vercel, back FastAPI -> Render, db -> Neon.

Front y back son repos y deploys SEPARADOS. Orden CRITICO de despliegue:

  1. Neon: provisiona Postgres -> DATABASE_URL.
  2. Backend (Render): push repo `<proj>-api`, crea web service python con
     DATABASE_URL + CORS_ORIGINS. La URL de Render es predecible:
     https://<proj>-api.onrender.com.
  3. Frontend (Vercel): push repo `<proj>-web`, crea proyecto con
     NEXT_PUBLIC_API_URL = url del backend YA conocida (Next inlinea las
     NEXT_PUBLIC_* en build-time, por eso el backend va primero), despliega.

Para stack estatico (nextjs-static) solo hay tier frontend: ni Neon ni Render.

Cada tier se construye/despliega de forma independiente; un fallo en uno no
contamina al otro. El build local (build_gate) corre ANTES de tocar la nube.
"""
from __future__ import annotations

from typing import Any

import httpx

from shared.config.settings import settings
from shared.observability import get_logger
from shared.stacks.stack_blueprints import get_blueprint, split_by_tier

logger = get_logger(__name__)


def detect_stack_from_files(files: list[dict]) -> str:
    """Infiere el stack a partir de la estructura de archivos generada."""
    paths = {(f.get("path") or "").lstrip("/") for f in files}
    has_backend = any(p.startswith("backend/") for p in paths) or any(
        p.endswith(".py") for p in paths
    )
    return "nextjs-fastapi-postgres" if has_backend else "nextjs-static"


def render_url_for(api_repo: str) -> str:
    """URL publica predecible de un web service en Render."""
    return f"https://{api_repo}.onrender.com"


async def _publish_repo(conn: str, repo_name: str, files: list[dict], desc: str) -> dict:
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(
            f"{conn}/publish",
            json={
                "repo_name": repo_name,
                "description": desc,
                "private": True,
                "files": files,
                "commit_message": "feat: ScrumDev AI build",
                "branch": "main",
            },
        )
        r.raise_for_status()
        return r.json()


async def _provision_neon(conn: str, name: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(f"{conn}/neon/projects", json={"name": name})
            if r.status_code == 200:
                return r.json()
    except Exception as exc:
        logger.warning("neon_provision_failed", error=str(exc))
    return None


async def _deploy_backend(
    conn: str, owner: str, api_repo: str, files_rel: list[dict],
    db_url: str | None, front_url: str | None,
) -> dict:
    """Push repo backend + crea web service python en Render con env cableado."""
    out: dict[str, Any] = {"tier": "backend", "repo": api_repo}
    pub = await _publish_repo(conn, api_repo, files_rel, f"ScrumDev AI backend ({api_repo})")
    out["git_url"] = (pub.get("push") or {}).get("url")
    if pub.get("needs_user_action"):
        out["error"] = "git_repo_failed"
        out["detail"] = pub.get("repo")
        return out

    env_vars = []
    if db_url:
        env_vars.append({"key": "DATABASE_URL", "value": db_url})
    env_vars.append({"key": "CORS_ORIGINS", "value": front_url or "*"})

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                f"{conn}/render/services",
                json={
                    "name": api_repo,
                    "git_owner": owner,
                    "git_repo": api_repo,
                    "branch": "main",
                    "runtime": "python",
                    "build_command": "pip install -r requirements.txt",
                    "start_command": "uvicorn main:app --host 0.0.0.0 --port $PORT",
                    "env_vars": env_vars,
                },
            )
            data = r.json() if r.status_code < 500 else {"error": r.text}
    except Exception as exc:
        data = {"error": str(exc)}
    out["render"] = data
    out["url"] = render_url_for(api_repo)
    out["deployed"] = "error" not in data
    return out


async def _deploy_frontend(
    conn: str, owner: str, web_repo: str, files_rel: list[dict], api_url: str | None,
) -> dict:
    """Push repo frontend + crea proyecto Vercel con NEXT_PUBLIC_API_URL y despliega."""
    out: dict[str, Any] = {"tier": "frontend", "repo": web_repo}
    pub = await _publish_repo(conn, web_repo, files_rel, f"ScrumDev AI frontend ({web_repo})")
    out["git_url"] = (pub.get("push") or {}).get("url")
    if pub.get("needs_user_action"):
        out["error"] = "git_repo_failed"
        out["detail"] = pub.get("repo")
        return out

    async with httpx.AsyncClient(timeout=90.0) as client:
        # crear proyecto Vercel
        try:
            pr = await client.post(
                f"{conn}/vercel/projects",
                json={"name": web_repo, "git_owner": owner, "git_repo": web_repo, "framework": "nextjs"},
            )
            out["vercel_project"] = pr.json() if pr.status_code < 500 else {"error": pr.text}
        except Exception as exc:
            out["vercel_project"] = {"error": str(exc)}

        # inyectar NEXT_PUBLIC_API_URL ANTES del deploy (Next inlinea en build)
        if api_url:
            try:
                await client.post(
                    f"{conn}/vercel/env",
                    json={
                        "project_id_or_name": web_repo,
                        "key": "NEXT_PUBLIC_API_URL",
                        "value": api_url,
                        "target": ["production", "preview", "development"],
                    },
                )
            except Exception as exc:
                logger.warning("vercel_env_set_failed", error=str(exc))

        # disparar deploy
        try:
            dr = await client.post(
                f"{conn}/vercel/deploy",
                json={"name": web_repo, "git_owner": owner, "git_repo": web_repo, "git_branch": "main"},
            )
            ddata = dr.json() if dr.status_code < 500 else {"error": dr.text}
        except Exception as exc:
            ddata = {"error": str(exc)}
    out["vercel_deploy"] = ddata
    out["url"] = ddata.get("url")
    out["deployed"] = "error" not in ddata
    return out


async def deploy_split(project_key: str, files: list[dict]) -> dict:
    """Orquesta el deploy de los tiers segun el blueprint del stack detectado."""
    conn = settings.deploy_connector_service_url
    owner = settings.scrumdev_git_owner
    base = project_key.lower().replace("_", "-")
    stack = detect_stack_from_files(files)
    bp = get_blueprint(stack)
    buckets = split_by_tier(files, stack)

    web_repo = f"{base}{bp.tier('frontend').repo_suffix}" if bp.tier("frontend") else f"{base}-web"
    result: dict[str, Any] = {"project_key": project_key, "stack": stack, "tiers": {}}

    if not owner:
        return {**result, "error": "scrumdev_git_owner no configurado"}

    db_url = None
    backend_url = None
    backend_res = None

    if bp.needs_backend:
        api_repo = f"{base}{bp.tier('backend').repo_suffix}"
        backend_url = render_url_for(api_repo)
        # 1. Neon
        neon = await _provision_neon(conn, base)
        if neon and neon.get("ok"):
            db_url = neon.get("connection_uri")
        result["neon"] = {"ok": bool(db_url)}
        # 2. Backend -> Render (con DATABASE_URL; CORS abierto, se afina luego)
        backend_res = await _deploy_backend(
            conn, owner, api_repo, buckets.get("backend", []), db_url, None,
        )
        result["tiers"]["backend"] = backend_res

    # 3. Frontend -> Vercel (con NEXT_PUBLIC_API_URL = backend ya conocido)
    frontend_res = await _deploy_frontend(
        conn, owner, web_repo, buckets.get("frontend", []),
        backend_url if bp.needs_backend else None,
    )
    result["tiers"]["frontend"] = frontend_res

    # 4. Afinar CORS del backend con la URL real del frontend (best-effort)
    if bp.needs_backend and frontend_res.get("url"):
        result["frontend_url"] = frontend_res["url"]

    result["frontend_url"] = frontend_res.get("url")
    result["backend_url"] = backend_url
    result["deployed"] = frontend_res.get("deployed", False)
    return result

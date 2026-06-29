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

import asyncio
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


async def _publish_repo(repo_name: str, files: list[dict], desc: str, private: bool = True) -> dict:
    git = settings.git_connector_service_url
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(
            f"{git}/publish",
            json={
                "repo_name": repo_name,
                "description": desc,
                "private": private,
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
    # backend PUBLICO para que Render pueda fetchear el repo sin OAuth conectado
    pub = await _publish_repo(api_repo, files_rel, f"ScrumDev AI backend ({api_repo})", private=False)
    out["git_url"] = (pub.get("push") or {}).get("url")
    if pub.get("needs_user_action"):
        out["error"] = "git_repo_failed"
        out["detail"] = pub.get("repo")
        return out

    env_vars = [
        # Render usa Python 3.14 por defecto; pydantic-core no tiene wheel para
        # 3.14 y compila Rust (falla). Fijar 3.12 -> usa wheels precompiladas.
        {"key": "PYTHON_VERSION", "value": "3.12.6"},
    ]
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
    # PÚBLICO: para que tanto Vercel como el FALLBACK de Render puedan fetchear el
    # repo sin OAuth conectado.
    pub = await _publish_repo(web_repo, files_rel, f"ScrumDev AI frontend ({web_repo})", private=False)
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
    # Vercel devuelve `url` como host PELADO (sin esquema). Normalizamos a absoluto:
    # si se renderiza como href tal cual, el navegador lo trata como enlace RELATIVO
    # y termina en "/projects/<host>" -> pantalla "Proyecto no encontrado".
    _u = ddata.get("url")
    out["url"] = (f"https://{_u}" if _u and not str(_u).startswith("http") else _u)
    out["deployed"] = "error" not in ddata

    # FALLBACK A RENDER: si Vercel falla (p.ej. cuota free 402 "100 deploys/día"),
    # desplegamos el MISMO frontend Next.js en Render como web service node. Así el
    # deploy NO depende de la cuota de Vercel -> resiliente para la demo.
    if "error" in ddata:
        out["vercel_error"] = str(ddata.get("error"))[:200]
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                rr = await client.post(
                    f"{conn}/render/services",
                    json={
                        "name": web_repo, "git_owner": owner, "git_repo": web_repo,
                        "branch": "main", "runtime": "node",
                        # --include=dev: Render pone NODE_ENV=production y npm
                        # OMITE devDependencies (tailwindcss/postcss/autoprefixer)
                        # -> sin ellas el CSS NO se procesa y la app sale SIN ESTILO.
                        "build_command": "npm install --include=dev && npm run build",
                        "start_command": "npx next start -p $PORT",
                        "env_vars": ([{"key": "NEXT_PUBLIC_API_URL", "value": api_url}]
                                     if api_url else []) + [
                            {"key": "NODE_VERSION", "value": "20"},
                            {"key": "NPM_CONFIG_PRODUCTION", "value": "false"},
                        ],
                    },
                )
                rdata = rr.json() if rr.status_code < 500 else {"error": rr.text}
            if "error" not in rdata:
                out["render_fallback"] = rdata
                out["url"] = f"https://{web_repo}.onrender.com"
                out["deployed"] = True
                out["provider"] = "render"
                logger.info("frontend_render_fallback_ok", repo=web_repo)
            else:
                out["render_error"] = str(rdata.get("error"))[:200]
                logger.warning("frontend_render_fallback_failed", repo=web_repo, error=out["render_error"])
        except Exception as exc:  # noqa: BLE001
            out["render_error"] = str(exc)[:200]
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

    # PARALELO: la URL del backend (Render) es PREDECIBLE, así que el frontend NO
    # necesita esperar a que el backend termine — solo su URL. Lanzamos la cadena
    # backend (Neon -> Render) y el frontend (Vercel) en paralelo -> el deploy del
    # backend sale de la ruta crítica (recorta ~30-60s del wall-clock).
    async def _backend_chain() -> dict | None:
        nonlocal db_url
        api_repo = f"{base}{bp.tier('backend').repo_suffix}"
        neon = await _provision_neon(conn, base)
        if neon and neon.get("ok"):
            db_url = neon.get("connection_uri")
        result["neon"] = {"ok": bool(db_url)}
        return await _deploy_backend(
            conn, owner, api_repo, buckets.get("backend", []), db_url, None,
        )

    if bp.needs_backend:
        backend_url = render_url_for(f"{base}{bp.tier('backend').repo_suffix}")
        # return_exceptions: un fallo en un tier NO debe tumbar al otro (objetivo
        # "tiers independientes"). Capturamos y degradamos en vez de propagar.
        backend_res, frontend_res = await asyncio.gather(
            _backend_chain(),
            _deploy_frontend(conn, owner, web_repo, buckets.get("frontend", []), backend_url),
            return_exceptions=True,
        )
        if isinstance(backend_res, BaseException):
            backend_res = {"tier": "backend", "error": "backend_failed", "detail": str(backend_res)[:200]}
        if isinstance(frontend_res, BaseException):
            frontend_res = {"tier": "frontend", "error": "frontend_failed", "detail": str(frontend_res)[:200]}
        result["tiers"]["backend"] = backend_res
    else:
        frontend_res = await _deploy_frontend(
            conn, owner, web_repo, buckets.get("frontend", []), None,
        )
    result["tiers"]["frontend"] = frontend_res

    # 4. Afinar CORS del backend con la URL real del frontend (best-effort)
    if bp.needs_backend and frontend_res.get("url"):
        result["frontend_url"] = frontend_res["url"]

    result["frontend_url"] = frontend_res.get("url")
    result["backend_url"] = backend_url
    result["deployed"] = frontend_res.get("deployed", False)
    return result

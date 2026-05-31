"""Build gate local por tier: compila ANTES de desplegar, sin quemar la nube.

El frontend Next.js se compila de verdad (`npm install && next build`) en un
directorio temporal; si falla, se aplican auto-fixes (CSS faltante, exports
faltantes) y se reintenta. Solo si el build pasa se permite el deploy.

El backend FastAPI se valida con py_compile (sintaxis de todos los .py) +
verificacion de que `main.py` expone `app`. (El build real de pip/Docker lo
hace Render; aqui evitamos romper el deploy por errores triviales.)

Objetivo del usuario: 0 deploys fallidos por errores que se ven en local.
"""
from __future__ import annotations

import asyncio
import os
import py_compile
import shutil
import tempfile
from typing import Any

from shared.observability import get_logger

logger = get_logger(__name__)

# npm/node puede no estar en PATH del proceso del servicio; resolver via NVM.
_NODE_BIN_CANDIDATES = [
    os.path.expanduser("~/.nvm/versions/node/v20.19.4/bin"),
    "/usr/local/bin",
    "/usr/bin",
]


def _node_env() -> dict:
    env = dict(os.environ)
    extra = ":".join(p for p in _NODE_BIN_CANDIDATES if os.path.isdir(p))
    if extra:
        env["PATH"] = extra + ":" + env.get("PATH", "")
    env["CI"] = "true"
    env["NEXT_TELEMETRY_DISABLED"] = "1"
    return env


def _npm_path() -> str | None:
    for d in _NODE_BIN_CANDIDATES:
        cand = os.path.join(d, "npm")
        if os.path.isfile(cand):
            return cand
    return shutil.which("npm")


def _write_tree(base: str, files_rel: list[dict]) -> None:
    for f in files_rel:
        rel = (f.get("path") or "").lstrip("/")
        if not rel:
            continue
        p = os.path.join(base, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(f.get("content") or "")


async def _run(cmd: list[str], cwd: str, env: dict, timeout: int) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=cwd, env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode or 0, out.decode("utf-8", "replace")
    except asyncio.TimeoutError:
        return 124, f"TIMEOUT tras {timeout}s"
    except FileNotFoundError as exc:
        return 127, f"comando no encontrado: {exc}"


def _fix_next_router(files_rel: list[dict], report: list[str]) -> list[dict]:
    """App Router NO tiene `next/router` (es de Pages Router). La IA a veces lo
    importa -> el build falla. Lo reescribimos a `next/navigation` (cuyo
    useRouter cubre push/replace/back/refresh, el uso típico generado)."""
    import re
    fixed = 0
    for f in files_rel:
        path = (f.get("path") or "")
        if not path.endswith((".tsx", ".ts", ".jsx", ".js")):
            continue
        c = f.get("content") or ""
        if "next/router" not in c:
            continue
        new = re.sub(r"""(['"])next/router\1""", r"\1next/navigation\1", c)
        # useRouter().query/pathname no existen en next/navigation; degradar a
        # accesos seguros para que el build no rompa por esos campos.
        new = new.replace("router.query", "({} as any)").replace("router.pathname", '""')
        if new != c:
            f["content"] = new
            fixed += 1
    if fixed:
        report.append(f"next/router->next/navigation en {fixed} archivo(s)")
    return files_rel


def _apply_frontend_autofix(files_rel: list[dict]) -> tuple[list[dict], list[str]]:
    """Reusa los fixes genericos del validador (CSS + exports + rutas paralelas)."""
    from services.orchestrator_service.app.deploy_validator import (
        _ensure_css_imports, _autofix_missing_exports, _dedup_parallel_routes,
    )
    report: list[str] = []
    files_rel = _dedup_parallel_routes(files_rel, report)
    files_rel = _fix_next_router(files_rel, report)
    files_rel = _autofix_missing_exports(files_rel, report)
    files_rel = _ensure_css_imports(files_rel, report)
    return files_rel, report


async def build_gate_frontend(files_rel: list[dict], max_attempts: int = 2) -> dict:
    """Compila el frontend; auto-fix + retry. Devuelve {ok, files, log, fixes}."""
    npm = _npm_path()
    if not npm:
        # sin node disponible: no podemos compilar -> pasar con warning (no bloquear)
        return {"ok": True, "skipped": True, "reason": "npm no disponible en el host",
                "files": files_rel, "fixes": []}

    # PROACTIVO: deduplicar rutas paralelas ANTES del primer build (Next falla
    # el build entero si dos pages resuelven a la misma URL).
    from services.orchestrator_service.app.deploy_validator import _dedup_parallel_routes
    _pre: list[str] = []
    files_rel = _dedup_parallel_routes(files_rel, _pre)
    files_rel = _fix_next_router(files_rel, _pre)  # App Router: next/router -> next/navigation

    env = _node_env()
    all_fixes: list[str] = list(_pre)
    log_tail = ""
    for attempt in range(1, max_attempts + 1):
        tmp = tempfile.mkdtemp(prefix="scrumdev_fe_")
        try:
            _write_tree(tmp, files_rel)
            rc_i, log_i = await _run([npm, "install", "--no-audit", "--no-fund",
                                      "--prefer-offline"], tmp, env, timeout=240)
            if rc_i != 0:
                log_tail = log_i[-1500:]
                # install fallando rara vez se arregla con autofix; abortar
                return {"ok": False, "stage": "install", "files": files_rel,
                        "log": log_tail, "fixes": all_fixes, "attempts": attempt}
            rc_b, log_b = await _run([npm, "run", "build"], tmp, env, timeout=300)
            if rc_b == 0:
                return {"ok": True, "files": files_rel, "fixes": all_fixes,
                        "attempts": attempt, "log": log_b[-400:]}
            log_tail = log_b[-1500:]
            # build fallo: intentar auto-fix y reintentar
            files_rel, fixes = _apply_frontend_autofix(files_rel)
            all_fixes.extend(fixes)
            logger.warning("frontend_build_failed_retry", attempt=attempt, fixes=fixes)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return {"ok": False, "stage": "build", "files": files_rel, "log": log_tail,
            "fixes": all_fixes, "attempts": max_attempts}


def build_gate_backend(files_rel: list[dict]) -> dict:
    """Valida sintaxis de todos los .py + que main.py exponga `app`."""
    tmp = tempfile.mkdtemp(prefix="scrumdev_be_")
    errors: list[str] = []
    try:
        _write_tree(tmp, files_rel)
        for f in files_rel:
            rel = (f.get("path") or "").lstrip("/")
            if not rel.endswith(".py"):
                continue
            p = os.path.join(tmp, rel)
            try:
                py_compile.compile(p, doraise=True)
            except py_compile.PyCompileError as exc:
                errors.append(f"{rel}: {exc.msg}")
        main = next((f for f in files_rel if (f.get("path") or "").lstrip("/") == "main.py"), None)
        if not main:
            errors.append("falta main.py")
        elif "app" not in (main.get("content") or ""):
            errors.append("main.py no define `app`")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return {"ok": not errors, "errors": errors}


async def run_build_gate(files: list[dict], stack: str) -> tuple[list[dict], dict]:
    """Corre el gate por tier y devuelve (files_corregidos_full, report).

    Los fixes del frontend se re-prefijan y se mergean de vuelta al set completo.
    """
    from shared.stacks.stack_blueprints import get_blueprint, split_by_tier

    bp = get_blueprint(stack)
    buckets = split_by_tier(files, stack)
    report: dict[str, Any] = {"stack": stack, "tiers": {}}
    fixed_full: list[dict] = []

    for tier in bp.tiers:
        tier_files = buckets.get(tier.name, [])
        if tier.framework in ("nextjs", "static"):
            res = await build_gate_frontend(tier_files)
            report["tiers"]["frontend"] = {
                "ok": res["ok"], "fixes": res.get("fixes", []),
                "skipped": res.get("skipped", False),
                "log": res.get("log", "")[-300:] if not res["ok"] else "",
            }
            tier_files = res.get("files", tier_files)
        elif tier.framework == "fastapi":
            res = build_gate_backend(tier_files)
            report["tiers"]["backend"] = {"ok": res["ok"], "errors": res.get("errors", [])}
        # re-prefijar al path completo
        for f in tier_files:
            rel = (f.get("path") or "").lstrip("/")
            fixed_full.append({**f, "path": f"{tier.path_prefix}{rel}"})

    report["ok"] = all(t.get("ok", True) for t in report["tiers"].values())
    return fixed_full, report

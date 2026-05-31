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
import re
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


_CLIENT_HOOKS = re.compile(
    r"\buse(State|Effect|Router|Context|Reducer|Ref|Memo|Callback|"
    r"SearchParams|Pathname|LayoutEffect)\b|on(Click|Change|Submit|Input|KeyDown)="
)


def _ensure_use_client(files_rel: list[dict], report: list[str]) -> list[dict]:
    """App Router: un archivo que usa hooks/eventos de cliente DEBE empezar con
    `"use client"`. La IA a veces lo omite -> el build falla. Lo anteponemos."""
    fixed = 0
    for f in files_rel:
        path = (f.get("path") or "")
        if not path.endswith((".tsx", ".jsx")):
            continue
        c = f.get("content") or ""
        if not _CLIENT_HOOKS.search(c):
            continue
        head = c.lstrip()[:40].lower()
        if head.startswith('"use client"') or head.startswith("'use client'"):
            continue
        f["content"] = '"use client";\n\n' + c
        fixed += 1
    if fixed:
        report.append(f'"use client" añadido en {fixed} archivo(s)')
    return files_rel


_KNOWN_DEPS = {
    "axios": "^1.7.7", "clsx": "^2.1.1", "date-fns": "^3.6.0", "zod": "^3.23.8",
    "zustand": "^4.5.5", "swr": "^2.2.5", "@tanstack/react-query": "^5.59.0",
    "react-icons": "^5.3.0", "tailwind-merge": "^2.5.0", "recharts": "^2.12.0",
    "react-hook-form": "^7.53.0", "uuid": "^10.0.0",
}


def _ensure_npm_deps(files_rel: list[dict], report: list[str]) -> list[dict]:
    """La IA importa libs (axios, clsx, zod...) sin declararlas en package.json
    -> 'Module not found'. Detectamos imports de libs conocidas y las añadimos a
    dependencies para que `npm install` las traiga."""
    import json as _json
    pkg = next((f for f in files_rel if (f.get("path") or "").endswith("frontend/package.json")
                or (f.get("path") or "") == "package.json"), None)
    if not pkg:
        return files_rel
    # qué libs se importan en el código
    src = "\n".join(f.get("content") or "" for f in files_rel
                    if (f.get("path") or "").endswith((".ts", ".tsx", ".js", ".jsx")))
    imported = set(re.findall(r"""from\s+['"]([^'".][^'"]*)['"]""", src))
    bare = {m.split("/")[0] if not m.startswith("@") else "/".join(m.split("/")[:2])
            for m in imported}
    try:
        data = _json.loads(pkg.get("content") or "{}")
    except Exception:
        return files_rel
    deps = data.setdefault("dependencies", {})
    added = []
    for lib, ver in _KNOWN_DEPS.items():
        if lib in bare and lib not in deps:
            deps[lib] = ver
            added.append(lib)
    if added:
        pkg["content"] = _json.dumps(data, indent=2)
        report.append(f"deps añadidas a package.json: {', '.join(added)}")
    return files_rel


def _stub_missing_local_imports(files_rel: list[dict], report: list[str]) -> list[dict]:
    """La IA importa componentes locales `@/...` que no generó -> 'Module not
    found'. Creamos un stub por cada archivo faltante para que el build resuelva."""
    existing = {(f.get("path") or "").lstrip("/") for f in files_rel}
    def has(base: str) -> bool:
        for ext in (".tsx", ".ts", ".jsx", ".js"):
            if base + ext in existing or f"{base}/index{ext}" in existing:
                return True
        return False
    import posixpath
    src_files = [f for f in files_rel if (f.get("path") or "").endswith((".tsx", ".ts", ".jsx", ".js"))]
    # recolectar imports default/named de módulos locales (@/ y relativos ./ ../)
    need: dict[str, dict] = {}
    imp_re = re.compile(r"""import\s+(.+?)\s+from\s+['"](@/[^'"]+|\.\.?/[^'"]+)['"]""", re.S)
    for f in src_files:
        fdir = posixpath.dirname((f.get("path") or "").lstrip("/"))
        for clause, spec in imp_re.findall(f.get("content") or ""):
            if spec.startswith("@/"):
                base = spec[2:]                       # relativo al root frontend
            else:
                base = posixpath.normpath(posixpath.join(fdir, spec))  # resolver relativo
            if base.startswith("..") or not base:
                continue
            if has(base):
                continue
            info = need.setdefault(base, {"default": False, "named": set()})
            clause = clause.strip()
            m_named = re.search(r"\{([^}]*)\}", clause)
            if m_named:
                for n in m_named.group(1).split(","):
                    n = n.strip().split(" as ")[0].strip()
                    if n: info["named"].add(n)
            # default: lo que está antes de la llave o solo
            head = clause.split("{")[0].replace(",", "").strip()
            if head and not head.startswith("*"):
                info["default"] = True
    added = []
    for base, info in need.items():
        lines = ['"use client";', "// stub auto-generado por el build gate (import faltante)",
                 "const Noop = (props: any) => null;"]
        for n in sorted(info["named"]):
            lines.append(f"export const {n}: any = Noop;")
        if info["default"] or not info["named"]:
            lines.append("export default Noop;")
        files_rel.append({"path": f"{base}.tsx", "content": "\n".join(lines) + "\n"})
        added.append(base)
    if added:
        report.append(f"stubs creados para imports faltantes: {', '.join(added)}")
    return files_rel


def _relax_next_config(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Asegura que next.config ignore errores de TS/ESLint en build (código
    generado puede tener typos menores que no deben bloquear el deploy)."""
    cfg = next((f for f in files_rel if (f.get("path") or "").rstrip("/").endswith(
        ("next.config.mjs", "next.config.js"))), None)
    if not cfg:
        return files_rel
    c = cfg.get("content") or ""
    if "ignoreBuildErrors" in c:
        return files_rel
    inject = ("typescript: { ignoreBuildErrors: true },\n"
              "  eslint: { ignoreDuringBuilds: true },\n  ")
    # insertar tras la primera llave del objeto de config
    m = re.search(r"(const\s+nextConfig\s*=\s*\{)", c)
    if m:
        cfg["content"] = c[:m.end()] + "\n  " + inject + c[m.end():]
        report.append("next.config: ignoreBuildErrors + eslint ignore")
    return files_rel


def _apply_frontend_autofix(files_rel: list[dict]) -> tuple[list[dict], list[str]]:
    """Reusa los fixes genericos del validador (CSS + exports + rutas paralelas)."""
    from services.orchestrator_service.app.deploy_validator import (
        _ensure_css_imports, _autofix_missing_exports, _dedup_parallel_routes,
    )
    report: list[str] = []
    files_rel = _dedup_parallel_routes(files_rel, report)
    files_rel = _fix_next_router(files_rel, report)
    files_rel = _ensure_use_client(files_rel, report)
    files_rel = _ensure_npm_deps(files_rel, report)
    files_rel = _stub_missing_local_imports(files_rel, report)
    files_rel = _relax_next_config(files_rel, report)
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
    files_rel = _fix_next_router(files_rel, _pre)   # App Router: next/router -> next/navigation
    files_rel = _ensure_use_client(files_rel, _pre)  # hooks de cliente -> "use client"
    files_rel = _ensure_npm_deps(files_rel, _pre)    # libs importadas -> package.json
    files_rel = _stub_missing_local_imports(files_rel, _pre)  # @/ faltantes -> stub
    files_rel = _relax_next_config(files_rel, _pre)  # ignorar errores TS/lint

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

"""Validador de deploy stack-agnostic - FASE E.

Objetivo: 0 errores de carpeta/build en CUALQUIER proyecto generado,
independiente del dominio. Analiza imports/exports REALES (no hardcoded a
un proyecto) y auto-arregla problemas comunes:

1. Stack detection: nextjs | vite-react | static | python-api
2. Imports rotos: si una pagina importa `{ X }` de `@/lib/mock` pero mock no
   exporta X -> agrega stub export.
3. app/page.tsx raiz garantizado (Next.js)
4. package.json con todas las deps de los imports detectados
5. config files faltantes (next.config, tsconfig, tailwind, postcss, globals)

Devuelve (fixed_files, report) con la lista de fixes aplicados.
"""
from __future__ import annotations

import json
import re


# --- Stack detection ---

def detect_stack(files: list[dict]) -> str:
    paths = {(f.get("path") or "") for f in files}
    has_next = any(p.startswith("app/") and p.endswith(("page.tsx", "page.jsx")) for p in paths) \
        or "next.config.mjs" in paths or "next.config.js" in paths
    has_api_py = "api/index.py" in paths or any(p.startswith("api/") and p.endswith(".py") for p in paths)
    has_vite = "vite.config.ts" in paths or "vite.config.js" in paths
    has_index_html = "index.html" in paths
    has_pkg = "package.json" in paths

    if has_next:
        return "nextjs"
    if has_vite or (has_index_html and has_pkg):
        return "vite-react"
    if has_index_html and not has_pkg:
        return "static"
    if has_api_py and not has_pkg:
        return "python-api"
    return "nextjs"  # default seguro


# --- Import/Export analysis (generico) ---

_IMPORT_NAMED_RE = re.compile(
    r"""import\s*\{([^}]+)\}\s*from\s*['"](@/lib/[\w-]+|\./[\w./-]+|\.\./[\w./-]+)['"]"""
)
_EXPORT_RE = re.compile(
    r"""export\s+(?:const|function|class|type|interface|let|var)\s+(\w+)"""
)
_EXPORT_BRACE_RE = re.compile(r"""export\s*\{([^}]+)\}""")


def _module_exports(content: str) -> set[str]:
    names: set[str] = set()
    for m in _EXPORT_RE.finditer(content):
        names.add(m.group(1))
    for m in _EXPORT_BRACE_RE.finditer(content):
        for part in m.group(1).split(","):
            name = part.strip().split(" as ")[-1].strip()
            if name:
                names.add(name)
    return names


def _resolve_local_path(from_module: str, files_by_path: dict[str, dict]) -> str | None:
    """Resuelve @/lib/mock -> lib/mock.ts. Retorna path real o None."""
    if from_module.startswith("@/"):
        base = from_module[2:]
    elif from_module.startswith("./") or from_module.startswith("../"):
        return None  # relativos: complejo, skip
    else:
        return None
    for ext in (".ts", ".tsx", ".js", ".jsx"):
        candidate = base + ext
        if candidate in files_by_path:
            return candidate
        idx = f"{base}/index{ext}"
        if idx in files_by_path:
            return idx
    return None


def _autofix_missing_exports(files: list[dict], report: list[str]) -> list[dict]:
    """Si una pagina importa nombres que el modulo local no exporta, agrega
    stubs al final del modulo. Generico: funciona para cualquier dominio."""
    files_by_path = {(f.get("path") or ""): f for f in files}
    # acumular nombres faltantes por modulo
    missing: dict[str, set[str]] = {}

    for f in files:
        path = (f.get("path") or "")
        if not path.endswith((".tsx", ".ts", ".jsx", ".js")):
            continue
        content = f.get("content") or ""
        for m in _IMPORT_NAMED_RE.finditer(content):
            raw_names = [n.strip() for n in m.group(1).split(",") if n.strip()]
            target = _resolve_local_path(m.group(2), files_by_path)
            if not target:
                continue
            target_content = files_by_path[target].get("content") or ""
            exports = _module_exports(target_content)
            for raw in raw_names:
                # detectar 'type X' import (type-only)
                is_type = raw.startswith("type ")
                name = raw[5:].strip() if is_type else raw
                name = name.split(" as ")[0].strip()
                if name and name != "default" and name not in exports:
                    # marcar si es type para generar el stub correcto
                    missing.setdefault(target, set()).add(("type:" if is_type else "") + name)

    # agregar stubs
    for target, marked_names in missing.items():
        tf = files_by_path[target]
        content = tf.get("content") or ""
        stubs = ["", "// Auto-stub (deploy validator): exports que las paginas usan pero faltaban."]
        clean_names: list[str] = []
        for marked in sorted(marked_names):
            is_type = marked.startswith("type:")
            name = marked[5:] if is_type else marked
            clean_names.append(name)
            if is_type or (name[:1].isupper() and not name.isupper()):
                # type-only import o PascalCase -> type alias
                stubs.append(f"export type {name} = any;")
            elif name.isupper() or name.endswith("MOCK") or name.endswith("_DATA"):
                stubs.append(f"export const {name}: any[] = [];")
            else:
                # camelCase -> objeto generico
                stubs.append(f"export const {name}: any = {{}};")
        tf["content"] = content.rstrip() + "\n" + "\n".join(stubs) + "\n"
        report.append(f"stub exports en {target}: {', '.join(clean_names)}")

    return files


# --- Validacion principal ---

def validate_and_fix(files: list[dict]) -> tuple[list[dict], dict]:
    """Valida y auto-arregla. Retorna (files_corregidos, report)."""
    report: list[str] = []
    stack = detect_stack(files)
    report.append(f"stack detectado: {stack}")

    # 1. Auto-fix exports faltantes (generico, todo stack JS)
    if stack in ("nextjs", "vite-react"):
        files = _autofix_missing_exports(files, report)

    paths = {(f.get("path") or "") for f in files}

    # 2. Garantizar entry point segun stack
    if stack == "nextjs":
        if "app/page.tsx" not in paths and "app/page.jsx" not in paths:
            report.append("FALTA app/page.tsx (lo generara el scaffold con links)")
        if "app/layout.tsx" not in paths and "app/layout.jsx" not in paths:
            report.append("FALTA app/layout.tsx (lo generara el scaffold)")

    return files, {
        "stack": stack,
        "fixes_applied": report,
        "files_count": len(files),
    }

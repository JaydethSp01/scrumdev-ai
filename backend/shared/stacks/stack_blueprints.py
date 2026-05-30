"""Stack Blueprint Registry.

Define, por cada STACK soportado, el contrato completo que un proyecto generado
debe cumplir para compilar y desplegarse sin errores:

  - tiers: deployables independientes (frontend, backend). Cada tier tiene su
    propio prefijo de carpeta, target de deploy (vercel/render), comando de build
    y manifiesto de archivos OBLIGATORIOS.
  - wiring: variables de entorno que conectan los tiers (ej: el frontend recibe
    NEXT_PUBLIC_API_URL apuntando al backend desplegado en Render).

Es la fuente de verdad compartida entre:
  - app_generator (genera exactamente el manifiesto por tier)
  - ml_service (scorer de completitud + exemplars)
  - deploy (split por tier -> 2 repos -> Vercel + Render + Neon)

Decision de arquitectura: front Next.js y back FastAPI NO comparten deploy.
Cada tier va a su propio repo y su propio target, builds 100% independientes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

DeployTarget = Literal["vercel", "render", "neon"]


@dataclass(frozen=True)
class Tier:
    """Un deployable independiente dentro de un proyecto."""
    name: str                       # "frontend" | "backend"
    target: DeployTarget            # donde se despliega
    path_prefix: str                # carpeta en el arbol generado, ej "frontend/"
    framework: str                  # "nextjs" | "fastapi" | "static"
    repo_suffix: str                # sufijo del repo, ej "-web" / "-api"
    build_cmd: str                  # comando de build local (gate) y remoto
    start_cmd: str = ""             # comando de arranque (Render)
    runtime: str = "node"           # node | python (Render env)
    # manifiesto: archivos OBLIGATORIOS (relativos al path_prefix) que el tier
    # DEBE tener para compilar. El scorer de completitud valida contra esto.
    required_files: tuple[str, ...] = ()
    # claves de archivo que deben existir aunque sea con stub (entrypoints).
    entrypoints: tuple[str, ...] = ()


@dataclass(frozen=True)
class WireRule:
    """Una variable de entorno que conecta tiers o servicios externos."""
    tier: str            # tier donde se inyecta la env var ("frontend"/"backend")
    key: str             # nombre de la env var
    source: str          # "backend_url" | "neon_uri" | literal
    note: str = ""


@dataclass(frozen=True)
class StackBlueprint:
    id: str
    label: str
    description: str
    needs_backend: bool
    needs_db: bool
    tiers: tuple[Tier, ...]
    wiring: tuple[WireRule, ...] = field(default_factory=tuple)

    def tier(self, name: str) -> Tier | None:
        for t in self.tiers:
            if t.name == name:
                return t
        return None


# --- Manifiestos por tier ---

_NEXT_FRONTEND_FILES = (
    "package.json",
    "next.config.mjs",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "lib/api.ts",
    ".env.example",
    "README.md",
)

_FASTAPI_BACKEND_FILES = (
    "main.py",
    "requirements.txt",
    "runtime.txt",          # fija Python 3.12 en Render (wheels precompiladas)
    "Dockerfile",
    "app/__init__.py",
    "app/db.py",
    "app/models.py",
    ".env.example",
    "README.md",
)

_STATIC_FILES = (
    "package.json",
    "next.config.mjs",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "README.md",
)


# --- Tiers reutilizables ---

_NEXT_FRONTEND_TIER = Tier(
    name="frontend",
    target="vercel",
    path_prefix="frontend/",
    framework="nextjs",
    repo_suffix="-web",
    build_cmd="npm install --no-audit --no-fund && npm run build",
    start_cmd="npm start",
    runtime="node",
    required_files=_NEXT_FRONTEND_FILES,
    entrypoints=("app/page.tsx", "app/layout.tsx", "app/globals.css"),
)

_FASTAPI_BACKEND_TIER = Tier(
    name="backend",
    target="render",
    path_prefix="backend/",
    framework="fastapi",
    repo_suffix="-api",
    build_cmd="pip install -r requirements.txt",
    start_cmd="uvicorn main:app --host 0.0.0.0 --port $PORT",
    runtime="python",
    required_files=_FASTAPI_BACKEND_FILES,
    entrypoints=("main.py", "requirements.txt"),
)

_STATIC_TIER = Tier(
    name="frontend",
    target="vercel",
    path_prefix="frontend/",
    framework="nextjs",
    repo_suffix="-web",
    build_cmd="npm install --no-audit --no-fund && npm run build",
    start_cmd="npm start",
    runtime="node",
    required_files=_STATIC_FILES,
    entrypoints=("app/page.tsx", "app/layout.tsx", "app/globals.css"),
)


# --- Registro de stacks ---

BLUEPRINTS: dict[str, StackBlueprint] = {
    "nextjs-fastapi-postgres": StackBlueprint(
        id="nextjs-fastapi-postgres",
        label="Software fullstack (Next.js + FastAPI + Postgres)",
        description=(
            "Para SISTEMAS reales (inventario, CRM, pedidos, gestion). Frontend "
            "Next.js desplegado en Vercel; backend FastAPI desplegado en Render "
            "como web service; Postgres en Neon. Front y back son repos y deploys "
            "SEPARADOS, cableados por NEXT_PUBLIC_API_URL."
        ),
        needs_backend=True,
        needs_db=True,
        tiers=(_NEXT_FRONTEND_TIER, _FASTAPI_BACKEND_TIER),
        wiring=(
            WireRule(
                tier="frontend", key="NEXT_PUBLIC_API_URL", source="backend_url",
                note="URL publica del backend en Render (https://<proj>-api.onrender.com).",
            ),
            WireRule(
                tier="backend", key="DATABASE_URL", source="neon_uri",
                note="Connection string de Neon Postgres.",
            ),
            WireRule(
                tier="backend", key="CORS_ORIGINS", source="frontend_url",
                note="URL del frontend en Vercel para permitir CORS.",
            ),
        ),
    ),
    "nextjs-static": StackBlueprint(
        id="nextjs-static",
        label="Landing / sitio estatico (Next.js)",
        description=(
            "Para sitios informativos/landing SIN backend ni DB. Un solo tier "
            "Next.js desplegado en Vercel."
        ),
        needs_backend=False,
        needs_db=False,
        tiers=(_STATIC_TIER,),
        wiring=(),
    ),
}

DEFAULT_STACK = "nextjs-fastapi-postgres"


def get_blueprint(stack_id: str) -> StackBlueprint:
    return BLUEPRINTS.get(stack_id, BLUEPRINTS[DEFAULT_STACK])


def pick_stack(classification: dict) -> str:
    """Elige el stack a partir de la clasificacion del producto.

    classification viene de product_classifier: {type, is_static, needs_backend,
    needs_db, entities, ...}. Regla: si es estatico/landing -> nextjs-static;
    si pide software con datos -> nextjs-fastapi-postgres.
    """
    if classification.get("is_static") or classification.get("type") == "landing":
        return "nextjs-static"
    return "nextjs-fastapi-postgres"


def manifest_for(stack_id: str) -> dict:
    """Vista serializable del blueprint (para la IA y el frontend)."""
    bp = get_blueprint(stack_id)
    return {
        "stack": bp.id,
        "label": bp.label,
        "description": bp.description,
        "needs_backend": bp.needs_backend,
        "needs_db": bp.needs_db,
        "tiers": [
            {
                "name": t.name,
                "target": t.target,
                "path_prefix": t.path_prefix,
                "framework": t.framework,
                "repo_suffix": t.repo_suffix,
                "build_cmd": t.build_cmd,
                "start_cmd": t.start_cmd,
                "runtime": t.runtime,
                "required_files": list(t.required_files),
                "entrypoints": list(t.entrypoints),
            }
            for t in bp.tiers
        ],
        "wiring": [
            {"tier": w.tier, "key": w.key, "source": w.source, "note": w.note}
            for w in bp.wiring
        ],
    }


def split_by_tier(files: list[dict], stack_id: str) -> dict[str, list[dict]]:
    """Separa los archivos generados en sus tiers segun el path_prefix.

    Devuelve {tier_name: [files con path RELATIVO al prefijo]}. Archivos que no
    matchean ningun prefijo se asignan al primer tier (frontend) como fallback,
    salvo que sean claramente backend (.py / requirements / Dockerfile).
    """
    bp = get_blueprint(stack_id)
    buckets: dict[str, list[dict]] = {t.name: [] for t in bp.tiers}
    prefixes = [(t.path_prefix, t.name) for t in bp.tiers]

    def _looks_backend(path: str) -> bool:
        return (
            path.endswith(".py")
            or path in ("requirements.txt", "Dockerfile")
            or path.startswith("api/")
        )

    backend_tier = next((t.name for t in bp.tiers if t.framework == "fastapi"), None)
    frontend_tier = next((t.name for t in bp.tiers if t.framework in ("nextjs", "static")), None)

    for f in files:
        path = (f.get("path") or "").lstrip("/")
        assigned = None
        rel = path
        for prefix, tname in prefixes:
            if path.startswith(prefix):
                assigned = tname
                rel = path[len(prefix):]
                break
        if assigned is None:
            # sin prefijo: clasificar por contenido/extension
            if backend_tier and _looks_backend(path):
                assigned = backend_tier
            elif frontend_tier:
                assigned = frontend_tier
            else:
                assigned = bp.tiers[0].name
            rel = path
        buckets.setdefault(assigned, []).append(
            {**f, "path": rel}
        )
    return buckets


def missing_required(files_rel: list[dict], tier: Tier) -> list[str]:
    """Lista de archivos obligatorios del tier que faltan en files_rel
    (paths relativos al prefijo del tier)."""
    have = {(f.get("path") or "").lstrip("/") for f in files_rel}
    return [req for req in tier.required_files if req not in have]


def completeness_score(files_rel: list[dict], tier: Tier) -> float:
    """Fraccion 0..1 de archivos obligatorios presentes en el tier."""
    if not tier.required_files:
        return 1.0
    miss = missing_required(files_rel, tier)
    return 1.0 - (len(miss) / len(tier.required_files))

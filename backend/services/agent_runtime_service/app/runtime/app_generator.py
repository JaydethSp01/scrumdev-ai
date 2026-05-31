"""Generador holistico de proyectos profesionales (target Vercel fullstack).

Stack OBLIGATORIO:
  - Frontend: Next.js 14 App Router + Tailwind (deploy en Vercel, root del repo).
  - Backend: FastAPI montado en `api/index.py` como ASGI handler (Vercel Serverless Functions Python).
  - Persistencia: PostgreSQL via psycopg[binary] sync (sin asyncpg para evitar
    problemas de pool en serverless). Conexion desde env `POSTGRES_URL`
    (provisto automaticamente por Vercel Postgres = Neon integrado).
  - El frontend llama a `/api/*` en el mismo dominio (sin CORS issues).
  - Si la DB no esta lista, el backend devuelve mock (no estalla).
  - Init schema + seed condicional ocurre en el primer request (idempotente).
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from services.agent_runtime_service.app.runtime.product_classifier import classify_product
from shared.observability import get_logger
from shared.personalization import build_style_prefix, remember

logger = get_logger(__name__)


APP_GENERATOR_SYSTEM = (
    "Eres un Tech Lead y product designer senior. Generas SOFTWARE REAL "
    "FUNCIONAL, COHERENTE y comercialmente competitivo. "
    "Tu trabajo NO es demos academicos ni fragmentos sueltos: el output es un "
    "PRODUCTO COMPLETO que un empresario podria usar de verdad. "
    "Cuando el cliente pide un SISTEMA (inventario, CRM, gestion, pedidos), "
    "construyes CRUD real con todas las entidades, navegacion coherente, auth, "
    "dashboard de entrada y datos persistidos. NO paginas estaticas sueltas. "
    "Devuelves SIEMPRE JSON puro valido, sin markdown ni fences. Sin "
    "placeholders ni ellipsis: cada archivo COMPLETO Y EJECUTABLE."
)


def _extract_json(raw: str):
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


_STACK_FULLSTACK = """**Stack OBLIGATORIO: FULLSTACK SEPARADO (front Vercel, back Render, db Neon).**
El frontend y el backend son DOS proyectos independientes en DOS carpetas raiz
(`frontend/` y `backend/`). NUNCA mezcles codigo de uno en la carpeta del otro.
NUNCA dupliques un archivo en raiz y dentro de `frontend/` a la vez.

### TIER 1 - FRONTEND (TODO bajo `frontend/`, deploy = Vercel):
- Next.js 14 App Router + Tailwind + lucide-react.
- `frontend/app/layout.tsx` (importa `./globals.css`), `frontend/app/page.tsx`,
  `frontend/app/globals.css` (con `@tailwind base; @tailwind components; @tailwind utilities;`).
- 1 pagina por entidad: `frontend/app/<entidad>/page.tsx`.
- `frontend/components/`: Sidebar, Navbar, Table, Card, Button (los que uses).
- `frontend/lib/api.ts`: helper que lee `const API = process.env.NEXT_PUBLIC_API_URL || ''`
  y hace fetch a `${API}/<recurso>`. Si la respuesta NO es ok, hace fallback a `frontend/lib/mock.ts`.
- `frontend/lib/mock.ts`: misma forma de datos del backend (campos snake_case), 8-12 items por entidad.
- `frontend/package.json`: next@14.2.13, react@18.3.1, react-dom@18.3.1, lucide-react@0.451.0;
  devDeps typescript@5.5.4, tailwindcss@3.4.13, autoprefixer@10.4.20, postcss@8.4.47,
  @types/node, @types/react, @types/react-dom. scripts: dev/build/start de Next.
- `frontend/next.config.mjs` con `typescript.ignoreBuildErrors:true` y `eslint.ignoreDuringBuilds:true`.
- `frontend/tailwind.config.ts` content `['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}']`.
- `frontend/postcss.config.mjs` (tailwindcss + autoprefixer). `frontend/tsconfig.json` strict:false, paths `@/*`.
- `frontend/.env.example` con `NEXT_PUBLIC_API_URL=https://tu-backend.onrender.com`.
- `frontend/README.md`.
- El frontend NO tiene codigo Python. NO uses `/api/*` del mismo dominio: usa NEXT_PUBLIC_API_URL.

### TIER 2 - BACKEND (TODO bajo `backend/`, deploy = Render web service):
- FastAPI standalone (NO serverless). `backend/main.py` crea `app = FastAPI()`,
  agrega CORSMiddleware con origins desde `os.environ.get("CORS_ORIGINS","*").split(",")`,
  incluye los routers, y expone `GET /health`. Ultima linea deja `app` accesible.
- `backend/requirements.txt`: fastapi==0.115.0, uvicorn[standard]==0.30.6,
  psycopg[binary]==3.2.3, pydantic==2.9.2.
- `backend/Dockerfile`: `FROM python:3.12-slim`, copia requirements, `pip install -r requirements.txt`,
  copia el codigo, `CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]`.
- `backend/app/__init__.py` (vacio), `backend/app/db.py` (conexion psycopg leyendo
  `os.environ.get("DATABASE_URL")`; si falta o falla -> modo memoria/mock, NUNCA 500),
  `backend/app/models.py` (Pydantic v2 por entidad).
- `backend/app/routers/<entidad>.py`: CRUD REST por entidad (GET lista, GET id, POST, PUT, DELETE).
- Schema init + seed condicional en startup (`@app.on_event("startup")`): CREATE TABLE IF NOT EXISTS
  + si vacio inserta 8-12 filas realistas. Idempotente.
- `backend/.env.example` con `DATABASE_URL=postgres://...` y `CORS_ORIGINS=https://tu-front.vercel.app`.
- `backend/README.md`.
- El backend NO tiene codigo TypeScript/React.

### Imagenes Unsplash (ids verificados, ciclar): 1546026423-e4d3a8e1ee62,
1517466787929-bc90951d0974, 1554151228-14d9def656e4, 1438761681033-6461ffad8d80,
1500648767791-00dcc994a43e, 1531123897727-8f129e1688ce.
URL: `https://images.unsplash.com/photo-{id}?w=800&q=80`."""


_STACK_STATIC = """**Stack OBLIGATORIO: LANDING ESTATICO (un solo tier Next.js en Vercel).**
TODO bajo `frontend/`. Sin backend ni DB.
- `frontend/app/layout.tsx` (importa `./globals.css`), `frontend/app/page.tsx` (landing
  completa: Hero, Features, Testimonios, CTA, Footer), `frontend/app/globals.css`
  (`@tailwind base; @tailwind components; @tailwind utilities;`).
- `frontend/components/` (Navbar, Hero, FeatureGrid, Footer, Button, Card).
- `frontend/package.json` (next@14.2.13, react@18.3.1, react-dom@18.3.1, lucide-react@0.451.0
  + devDeps typescript/tailwindcss/autoprefixer/postcss/@types).
- `frontend/next.config.mjs`, `frontend/tailwind.config.ts`, `frontend/postcss.config.mjs`,
  `frontend/tsconfig.json`, `frontend/README.md`.
- Paginas extra (Sobre nosotros/Contacto/Precios) SOLO si el cliente las menciona."""


def _manifest_block(blueprint: dict) -> str:
    """Lista EXACTA de archivos obligatorios por tier (del blueprint del Stack Expert)."""
    lines = ["### Archivos OBLIGATORIOS por tier (paths EXACTOS, con su prefijo):"]
    for t in blueprint.get("tiers", []):
        prefix = t.get("path_prefix", "")
        lines.append(f"\n**{t['name']} ({t['framework']} -> {t['target']}):**")
        for req in t.get("required_files", []):
            lines.append(f"  - {prefix}{req}")
    wiring = blueprint.get("wiring", [])
    if wiring:
        lines.append("\n### Cableado entre tiers (env vars que ya inyecta el deploy):")
        for w in wiring:
            lines.append(f"  - [{w['tier']}] {w['key']} = {w['source']}  ({w['note']})")
    return "\n".join(lines)


def _exemplars_block(exemplars: list[dict]) -> str:
    """Few-shot fuerte: el ML recupera el proyecto EXITOSO más parecido y le pasa
    a la IA su ESTRUCTURA REAL de archivos para que la imite. Esto es el apoyo
    del ML: la IA no inventa la estructura desde cero, parte de una que funcionó.
    """
    if not exemplars:
        return ""
    top = exemplars[0]
    score = top.get("score")
    lines = [
        "### Proyecto similar que SÍ compiló y desplegó (el ML lo recuperó por "
        f"similitud{f' {score:.0%}' if isinstance(score, (int, float)) else ''} — "
        "IMITA esta estructura de archivos y adáptala al dominio del cliente):",
        f'Visión de referencia: "{(top.get("vision") or "")[:120]}"',
    ]
    for tier, paths in (top.get("manifest") or {}).items():
        shown = paths[:24]
        lines.append(f"\n**{tier}** ({len(paths)} archivos):")
        lines.extend(f"  - {p}" for p in shown)
        if len(paths) > len(shown):
            lines.append(f"  - … (+{len(paths) - len(shown)} más del mismo estilo)")
    # otras referencias, solo el resumen (diversidad)
    if len(exemplars) > 1:
        others = "; ".join(f'"{(e.get("vision") or "")[:50]}"' for e in exemplars[1:3])
        lines.append(f"\nOtras referencias exitosas similares: {others}")
    return "\n".join(lines) + "\n"


def _format_brand_block(brand_kit: dict | None, assets: list[dict] | None) -> str:
    if not brand_kit and not assets:
        return ""
    parts = ["### Identidad visual del cliente (USAR EXACTAMENTE):"]
    if brand_kit:
        parts.append(
            f"- Color primario: {brand_kit.get('primary_color', '#5b6cff')}"
        )
        parts.append(
            f"- Color secundario: {brand_kit.get('secondary_color', '#10b981')}"
        )
        parts.append(f"- Color de acento: {brand_kit.get('accent_color', '#f59e0b')}")
        parts.append(f"- Fondo: {brand_kit.get('background_color', '#ffffff')}")
        parts.append(f"- Texto: {brand_kit.get('text_color', '#171717')}")
        parts.append(f"- Tipografia: {brand_kit.get('font_family', 'Inter')}")
        parts.append(f"- Tono de marca: {brand_kit.get('tone', 'moderno')}")
        if brand_kit.get("industry"):
            parts.append(f"- Industria: {brand_kit['industry']}")
        if brand_kit.get("logo_url"):
            parts.append(f"- Logo URL (usar en Navbar): {brand_kit['logo_url']}")
        parts.append(
            "CONFIGURA tailwind.config.ts con estos colores en theme.extend.colors:"
            f" brand={brand_kit.get('primary_color', '#5b6cff')}, "
            f"secondary={brand_kit.get('secondary_color', '#10b981')}, "
            f"accent={brand_kit.get('accent_color', '#f59e0b')}. "
            "USA tipografia via next/font/google."
        )
    if assets:
        parts.append("\n### Imagenes del cliente (URLs reales, usar TODAS exactamente como vienen):")
        by_type: dict[str, list[dict]] = {}
        for a in assets:
            by_type.setdefault(a.get("asset_type", "other"), []).append(a)
        for atype, items in by_type.items():
            parts.append(f"\n**{atype}** ({len(items)} archivos):")
            for a in items:
                alt = a.get("alt_text") or a.get("name") or ""
                parts.append(f"  - {a['url']}  (alt: {alt})")
        parts.append(
            "IMPORTANTE: Reemplaza CUALQUIER URL Unsplash que ibas a usar por "
            "las imagenes de arriba segun su tipo: 'hero' para landing principal, "
            "'feature' para cards de features, 'avatar' para perfiles, 'logo' en "
            "Navbar, 'gallery' para listados. Si no hay suficientes, recicla las "
            "que el cliente subio antes que inventar Unsplash."
        )
    return "\n".join(parts) + "\n\n"


def _build_software_block(classification: dict) -> str:
    """Instrucciones especificas segun el producto clasificado.

    Para software real (saas_crud, dashboard, etc): exige CRUD funcional con
    las entidades detectadas, dashboard de entrada, auth, navegacion coherente.
    Para landing: sitio estatico bonito.
    """
    ptype = classification.get("type", "saas_crud")
    entities = classification.get("entities", []) or []
    roles = classification.get("roles", []) or ["admin", "usuario"]
    features = classification.get("key_features", []) or []
    is_static = classification.get("is_static", False)

    if is_static:
        return (
            "### TIPO DE PRODUCTO: LANDING / SITIO ESTATICO\n"
            "El cliente pide un sitio informativo/landing. Construye un sitio "
            "estatico profesional con secciones: Hero, Features, Testimonios, "
            "CTA, Footer. NO necesita backend ni DB. `app/page.tsx` es la home "
            "completa con todas las secciones. Paginas extra solo si el cliente "
            "las menciona (Sobre nosotros, Contacto, Precios).\n"
        )

    entities_block = ", ".join(entities) if entities else "las entidades del dominio"
    roles_block = ", ".join(roles)
    features_block = "\n".join(f"  - {f}" for f in features) if features else "  - CRUD de las entidades principales"

    return (
        f"### TIPO DE PRODUCTO: SOFTWARE REAL ({ptype})\n"
        f"El cliente pide un SISTEMA FUNCIONAL, NO una landing. Debes construir "
        f"software de verdad con CRUD real.\n\n"
        f"**Entidades del dominio (modelos de datos):** {entities_block}\n"
        f"**Roles de usuario:** {roles_block}\n"
        f"**Funcionalidades core:**\n{features_block}\n\n"
        "**OBLIGATORIO para software real:**\n"
        "1. `app/page.tsx` = DASHBOARD de entrada (NO landing marketing). Muestra "
        "metricas clave (totales por entidad), accesos rapidos a cada modulo, "
        "y una tabla/grid de actividad reciente. Es el centro de control.\n"
        "2. UNA pagina CRUD por cada entidad principal: "
        "`app/<entidad>/page.tsx` con tabla (listar), boton 'Nuevo' que abre "
        "form (crear), acciones editar/eliminar por fila. Conectada al backend real.\n"
        "3. `components/Sidebar.tsx`: navegacion lateral con links a TODAS las "
        "entidades + dashboard. Presente en el layout, siempre visible.\n"
        "4. Backend `api/index.py`: CRUD REST completo (GET lista, GET id, POST, "
        "PUT, DELETE) por cada entidad, con tablas Postgres relacionadas (FK reales), "
        "validacion Pydantic, y seed de 8-12 registros realistas por tabla.\n"
        "5. Auth: pagina `app/login/page.tsx` + endpoint `/api/auth/login` (puede "
        "ser mock JWT simple). El dashboard asume usuario logueado.\n"
        "6. Cada `<Link>` apunta a una pagina que EXISTE. Cero links rotos.\n"
    )


def _ensure_manifest_complete(
    files: list[dict], stack_id: str, project_key: str
) -> tuple[list[dict], list[str]]:
    """Rellena archivos obligatorios faltantes por tier con defaults validos.

    Garantiza que cada tier tenga su manifiesto completo -> deploy_ready. No
    pisa lo que la IA genero (solo agrega lo que falta).
    """
    from shared.stacks.stack_blueprints import (
        get_blueprint, split_by_tier, missing_required,
    )
    from services.agent_runtime_service.app.runtime.tier_scaffold import default_for

    bp = get_blueprint(stack_id)
    buckets = split_by_tier(files, stack_id)
    existing = {(f.get("path") or "").lstrip("/") for f in files}
    filled: list[str] = []

    for tier in bp.tiers:
        tier_files = buckets.get(tier.name, [])
        for rel in missing_required(tier_files, tier):
            content = default_for(rel, tier.framework, project_key)
            if content is None:
                continue
            full_path = f"{tier.path_prefix}{rel}"
            if full_path in existing:
                continue
            files.append({"path": full_path, "content": content})
            existing.add(full_path)
            filled.append(full_path)
    return files, filled


def _expected_domain_files(classification: dict, stack_id: str) -> list[str]:
    """Archivos de DOMINIO esperados: 1 página + 1 router por entidad. Estos NO
    están en el blueprint (son específicos del producto) -> los rellena la IA,
    no un stub."""
    entities = [e for e in (classification.get("entities") or []) if isinstance(e, str)]
    needs_backend = stack_id != "nextjs-static"
    expected: list[str] = []
    for e in entities[:8]:
        slug = re.sub(r"[^a-z0-9]+", "-", e.lower()).strip("-") or "item"
        expected.append(f"frontend/app/{slug}/page.tsx")
        if needs_backend:
            expected.append(f"backend/app/routers/{slug}.py")
    return expected


async def _complete_domain_with_ai(
    files: list[dict], classification: dict, stack_id: str, vision: str, project_key: str
) -> tuple[list[dict], list[str]]:
    """Loop dirigido: si faltan archivos de DOMINIO (por entidad), se le pide a la
    IA generarlos con CONTENIDO REAL (no stubs). El análisis de cobertura decide
    qué falta; la IA lo completa. Best-effort: nunca rompe la generación."""
    expected = _expected_domain_files(classification, stack_id)
    have = {(f.get("path") or "").lstrip("/") for f in files}
    missing = [p for p in expected if p not in have]
    if not missing:
        return files, []
    try:
        ents = ", ".join(classification.get("entities") or [])
        prompt = (
            f"Proyecto {project_key} ({classification.get('type')}). Visión: {vision[:300]}\n"
            f"Entidades del dominio: {ents}\n\n"
            "Faltan estos archivos de DOMINIO. Genéralos COMPLETOS y EJECUTABLES "
            "(no placeholders), coherentes con un proyecto Next.js (frontend) + "
            "FastAPI (backend), con CRUD real por entidad, diseño Tailwind "
            "profesional en el frontend y endpoints REST en el backend. El "
            "frontend llama al backend vía process.env.NEXT_PUBLIC_API_URL con "
            "fallback a lib/mock.ts.\n\nArchivos faltantes:\n"
            + "\n".join(f"  - {p}" for p in missing)
            + '\n\nDevuelve SOLO JSON: {"files":[{"path":"...","content":"..."}]}'
        )
        raw = await run_claude_code(prompt, system_prompt=APP_GENERATOR_SYSTEM, max_turns=1)
        data = _extract_json(raw)
        new_files = data.get("files", []) if isinstance(data, dict) else []
        added: list[str] = []
        for nf in new_files:
            p = (nf.get("path") or "").lstrip("/")
            if p in missing and p not in have and nf.get("content"):
                files.append({"path": p, "content": nf["content"]})
                have.add(p)
                added.append(p)
        return files, added
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_completion_failed", project=project_key, error=str(exc))
        return files, []


async def _fetch_blueprint_and_exemplars(classification: dict, vision: str) -> tuple[dict, list[dict], str]:
    """Consulta al Stack Expert (ml_service): elige stack + manifiesto + few-shot.

    Si el ml_service no esta disponible, cae al blueprint local (sin few-shot).
    """
    from shared.config.settings import settings
    from shared.stacks.stack_blueprints import manifest_for, pick_stack

    base = settings.ml_service_url
    blueprint: dict | None = None
    exemplars: list[dict] = []
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{base}/ml/stack/blueprint", json={"classification": classification}
            )
            if r.status_code == 200:
                blueprint = r.json()
            stack_id = (blueprint or {}).get("stack") or pick_stack(classification)
            r2 = await client.post(
                f"{base}/ml/stack/exemplars",
                json={"vision": vision, "stack": stack_id, "top_k": 3},
            )
            if r2.status_code == 200:
                exemplars = r2.json().get("exemplars", [])
    except Exception as exc:
        logger.warning("stack_expert_unavailable", error=str(exc))
    if not blueprint:
        stack_id = pick_stack(classification)
        blueprint = manifest_for(stack_id)
    return blueprint, exemplars, blueprint["stack"]


async def generate_full_app(
    project_key: str,
    vision: str,
    target_users: str | None,
    backlog: list[dict],
    stack_preference: str | None = None,
    brand_kit: dict | None = None,
    assets: list[dict] | None = None,
    nfr: dict | None = None,
) -> dict:
    # FASE A: clasificar el producto ANTES de generar
    classification = await classify_product(vision, nfr)
    # Stack Expert (ML): elige stack + manifiesto + few-shot de builds exitosos
    blueprint, exemplars, stack_id = await _fetch_blueprint_and_exemplars(classification, vision)
    logger.info(
        "product_classified",
        project=project_key,
        type=classification["type"],
        is_static=classification["is_static"],
        stack=stack_id,
        exemplars=len(exemplars),
        entities=classification["entities"],
    )
    software_block = _build_software_block(classification)
    stack_block = _STACK_STATIC if stack_id == "nextjs-static" else _STACK_FULLSTACK
    manifest_block = _manifest_block(blueprint)
    exemplars_block = _exemplars_block(exemplars)

    style_prefix = await build_style_prefix(project_key, vision, top_k=4)
    brand_block = _format_brand_block(brand_kit, assets)

    backlog_block = "\n".join(
        f"- [{b.get('priority','medium')}] {b.get('story_key','S?')}: "
        f"{b.get('title','')} -> {b.get('description','')[:140]}"
        for b in backlog[:15]
    )
    users_block = f"\nUsuarios objetivo: {target_users}" if target_users else ""

    prompt = (
        f"{style_prefix}"
        f"{brand_block}"
        f"Proyecto: **{project_key}**\n"
        f"Vision:\n{vision}\n{users_block}\n\n"
        f"{software_block}\n"
        f"### Backlog priorizado (las historias guian QUE features construir):\n{backlog_block}\n\n"
        f"{exemplars_block}"
        f"{stack_block}\n\n"
        f"{manifest_block}\n\n"
        "**REGLAS GLOBALES OBLIGATORIAS:**\n"
        "1. Disenio profesional: tipografia generosa, espaciado, gradientes sutiles, "
        "rounded-xl/2xl, shadow-lg, dark mode (`dark:` variants), grids responsive. "
        "NO HTML plano. Usa iconos lucide.\n"
        "2. SEPARACION ESTRICTA: todo el frontend bajo `frontend/`, todo el backend "
        "bajo `backend/`. NUNCA dupliques un mismo archivo en raiz y en `frontend/`.\n"
        "3. COHERENCIA TOTAL: `frontend/app/page.tsx` SIEMPRE existe y es la entrada. "
        "TODOS los `<Link href=>` apuntan a paginas que CREES. Cero rutas rotas.\n"
        "4. El frontend habla con el backend SOLO via `process.env.NEXT_PUBLIC_API_URL`. "
        "Si el backend no responde, fallback a `frontend/lib/mock.ts`. NUNCA hardcodees localhost.\n"
        "5. Datos demo REALISTAS coherentes con el dominio del cliente. NO Lorem Ipsum.\n"
        "6. GENERA TODOS los archivos del manifiesto de arriba (son obligatorios) + "
        "1 pagina/router CRUD por entidad. Cada archivo COMPLETO Y EJECUTABLE, max 300 lineas.\n"
        "7. NO uses react-router-dom NI react-helmet. App Router: para navegar usa "
        "`next/navigation` (useRouter, usePathname, useSearchParams) y `next/link`. "
        "NUNCA importes `next/router`. TODO archivo que use hooks o eventos "
        "(useState/useEffect/useRouter/onClick...) DEBE empezar con `\"use client\";` "
        "en la primera línea, o el build falla.\n"
        "8. El backend `backend/main.py` deja `app` (FastAPI) accesible y tiene CORS.\n\n"
        "**Formato JSON exacto (sin texto extra):**\n"
        "{\n"
        f'  "stack": "{stack_id}",\n'
        '  "product_type": "' + classification["type"] + '",\n'
        '  "summary": "1-2 frases del producto",\n'
        '  "routes": ["/", "/<entidad>", ...],\n'
        '  "files": [{"path": "frontend/app/page.tsx", "content": "..."}, ...]\n'
        "}\n"
    )

    raw = await run_claude_code(prompt, system_prompt=APP_GENERATOR_SYSTEM, max_turns=1)
    data = _extract_json(raw)
    if not isinstance(data, dict) or "files" not in data:
        raise ValueError("app generation parse failed")
    files = data.get("files", [])
    if not isinstance(files, list) or not files:
        raise ValueError("files must be a non-empty list")

    # LOOP DIRIGIDO POR EL ML: completar archivos de DOMINIO faltantes (por
    # entidad) pidiéndole a la IA contenido REAL antes del backfill de scaffolding.
    files, domain_added = await _complete_domain_with_ai(
        files, classification, stack_id, vision, project_key)
    if domain_added:
        logger.info("domain_files_completed_by_ai", project=project_key, added=domain_added)

    # GATE DE COMPLETITUD (scaffolding): rellenar archivos obligatorios del
    # blueprint que falten, con defaults válidos (configs, package.json, etc.)
    files, fill_report = _ensure_manifest_complete(files, stack_id, project_key)
    if fill_report:
        logger.info("manifest_backfilled", project=project_key, filled=fill_report)

    data["files"] = files
    data["stack"] = stack_id
    data["classification"] = classification
    data["blueprint"] = blueprint

    logger.info(
        "full_app_generated",
        project=project_key,
        type=classification["type"],
        stack=stack_id,
        files=len(files),
        routes=len(data.get("routes", [])),
    )
    await remember(
        project_key,
        f"APP COMPLETA [{classification['type']}/{stack_id}]: {data.get('summary','')} | "
        f"entidades: {classification['entities']} | routes: {data.get('routes')}",
        kind="app",
    )
    return data

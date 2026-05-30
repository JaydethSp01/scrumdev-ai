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


_STACK_INSTRUCTIONS = """**Stack OBLIGATORIO (deploy target = Vercel fullstack):**

### Frontend Next.js (TODO va en la RAIZ del repo, NO en `frontend/`):
- Next.js 14 App Router + Tailwind + lucide-react.
- Estructura raiz: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/<feature>/page.tsx`.
- Componentes en `components/`: Navbar, Footer, Button, Card, Hero, FeatureGrid.
- `lib/api.ts` con helper `apiGet/apiPost` que apunta a `/api` (mismo dominio, sin CORS). Si responde 404/500, fallback a MOCK DATA de `lib/mock.ts`.
- `lib/mock.ts` con la MISMA forma de datos del backend (mismos campos snake_case), 8-12 items por entidad con imagenes Unsplash.
- `package.json` con deps: next@14.2.13, react@18.3.1, react-dom@18.3.1, lucide-react@0.451.0. DevDeps: typescript@5.5.4, tailwindcss@3.4.13, autoprefixer@10.4.20, postcss@8.4.47, @types/node@20.16.10, @types/react@18.3.11, @types/react-dom@18.3.0.
- `next.config.mjs` con `typescript.ignoreBuildErrors:true` y `eslint.ignoreDuringBuilds:true`.
- `tailwind.config.ts` con content `['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}']` + colors brand/secondary/accent.
- `postcss.config.mjs` con tailwindcss + autoprefixer. `tsconfig.json` con strict:false y paths `@/*`.

### Backend FastAPI Serverless (carpeta `api/` en la raiz):
- Archivo UNICO: `api/index.py` que exporta `handler = Mangum(app)` o directamente `app: FastAPI` (Vercel detecta ASGI).
- TODO el backend en ese archivo (FastAPI + modelos + endpoints) — max 280 lineas. Si necesitas mas, usa `api/_db.py` y `api/_models.py` con prefijo `_` para que Vercel no los exponga como functions.
- Usa **psycopg[binary]** (sync, no asyncpg) — funciona mejor en serverless.
- Connection string desde `os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")` (Vercel Postgres inyecta `POSTGRES_URL` automaticamente).
- Pool: usar `psycopg_pool.ConnectionPool(min_size=0, max_size=1)` o conexion por request (serverless = procesos efimeros).
- Init schema + seed condicional en startup: usar `@app.on_event("startup")` que ejecuta `CREATE TABLE IF NOT EXISTS ...` + chequea `SELECT COUNT(*)` y si vacio inserta 8-12 rows realistas con imagenes Unsplash.
- Si la DB falla (no env, error conexion), endpoints devuelven JSON con datos hardcoded (NO 500). NUNCA estallar.
- Endpoints REST CRUD: GET lista, POST crea, GET por id. Health en GET `/api/health`.
- 2-3 tablas relacionadas con FK reales y validacion via Pydantic v2.

### requirements.txt (en RAIZ, para que Vercel detecte Python builds):
```
fastapi==0.115.0
pydantic==2.9.2
psycopg[binary]==3.2.3
```

### vercel.json (en RAIZ - NO especificar `runtime`, Vercel autodetecta):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index" }
  ]
}
```
IMPORTANTE: NO incluyas "functions" con "runtime", Vercel da error
"Function Runtimes must have a valid version". Solo framework + rewrites.

### Archivos OBLIGATORIOS (lista exacta, NO inventes paths distintos):
1. `package.json`
2. `next.config.mjs`
3. `tailwind.config.ts`
4. `postcss.config.mjs`
5. `tsconfig.json`
6. `app/layout.tsx`
7. `app/page.tsx`
8. `app/globals.css`
9. `app/<feature1>/page.tsx`
10. `app/<feature2>/page.tsx`
11. `app/<feature3>/page.tsx`
12. `components/Navbar.tsx`
13. `components/Footer.tsx`
14. `components/Hero.tsx`
15. `components/Card.tsx`
16. `components/Button.tsx`
17. `components/FeatureGrid.tsx`
18. `lib/api.ts`
19. `lib/mock.ts`
20. `api/index.py`
21. `requirements.txt`
22. `vercel.json`
23. `.env.example` (con `POSTGRES_URL=postgres://...`)
24. `README.md`

### Imagenes Unsplash (usa SOLO estos ids verificados):
1546026423-e4d3a8e1ee62, 1517466787929-bc90951d0974, 1554151228-14d9def656e4,
1438761681033-6461ffad8d80, 1500648767791-00dcc994a43e, 1531123897727-8f129e1688ce,
1488161628813-04466f872be2, 1502823403499-6ccfcf4fb453

URL: `https://images.unsplash.com/photo-{id}?w=800&q=80`. Distribuye ciclicamente."""


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
    logger.info(
        "product_classified",
        project=project_key,
        type=classification["type"],
        is_static=classification["is_static"],
        entities=classification["entities"],
    )
    software_block = _build_software_block(classification)

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
        f"{_STACK_INSTRUCTIONS}\n\n"
        "**REGLAS GLOBALES OBLIGATORIAS:**\n"
        "1. Disenio profesional: tipografia generosa, espaciado, gradientes sutiles, "
        "rounded-xl/2xl, shadow-lg, dark mode (`dark:` variants), grids responsive. "
        "NO HTML plano. Usa iconos lucide.\n"
        "2. Persistencia REAL: backend FastAPI en `api/index.py` con psycopg + "
        "Postgres. Frontend consume via `/api/*`. Si DB falla, fallback a `lib/mock.ts` "
        "y backend devuelve hardcoded (NUNCA 500).\n"
        "3. COHERENCIA TOTAL: `app/page.tsx` SIEMPRE existe y es la entrada. TODOS "
        "los `<Link href=>` apuntan a paginas que CREES. Cero rutas rotas. "
        "Lista exacta en `routes`.\n"
        "4. Mobile responsive (sm/md/lg breakpoints).\n"
        "5. Datos demo REALISTAS y coherentes con el dominio del cliente. NO Lorem Ipsum.\n"
        "6. Genera 18-30 archivos: package/config (8) + app/page.tsx home + 1 pagina "
        "CRUD por entidad + components (Sidebar/Navbar/Table/Form/Card/Button) + "
        "lib/api + lib/mock + api/index.py + requirements + vercel.json + README.\n"
        "7. Cada archivo COMPLETO Y EJECUTABLE, max 300 lineas.\n"
        "8. NO uses react-router-dom NI react-helmet (Next.js usa next/link).\n"
        "9. Todo va a la RAIZ del repo (NO carpetas `frontend/`/`backend/`).\n"
        "10. El backend `api/index.py` EXPORTA `app` (FastAPI) como ultima linea.\n\n"
        "**Formato JSON exacto (sin texto extra):**\n"
        "{\n"
        '  "stack": "vercel-fullstack-fastapi-nextjs-postgres",\n'
        '  "product_type": "' + classification["type"] + '",\n'
        '  "summary": "1-2 frases del producto",\n'
        '  "routes": ["/", "/<entidad>", ...],\n'
        '  "files": [{"path": "app/page.tsx", "content": "..."}, ...]\n'
        "}\n"
    )

    raw = await run_claude_code(prompt, system_prompt=APP_GENERATOR_SYSTEM, max_turns=1)
    data = _extract_json(raw)
    if not isinstance(data, dict) or "files" not in data:
        raise ValueError("app generation parse failed")
    files = data.get("files", [])
    if not isinstance(files, list) or not files:
        raise ValueError("files must be a non-empty list")

    # VALIDACION DE COHERENCIA (FASE A): garantizar app/page.tsx raiz existe
    paths = {(f.get("path") or "") for f in files}
    if "app/page.tsx" not in paths and "app/page.jsx" not in paths:
        logger.warning("missing_root_page_will_be_scaffolded", project=project_key)
        # El scaffold lo genera con links a las features (FASE E lo cubre)

    data["stack"] = "vercel-fullstack-fastapi-nextjs-postgres"
    data["classification"] = classification

    logger.info(
        "full_app_generated",
        project=project_key,
        type=classification["type"],
        files=len(files),
        routes=len(data.get("routes", [])),
    )
    await remember(
        project_key,
        f"APP COMPLETA [{classification['type']}]: {data.get('summary','')} | "
        f"entidades: {classification['entities']} | routes: {data.get('routes')}",
        kind="app",
    )
    return data

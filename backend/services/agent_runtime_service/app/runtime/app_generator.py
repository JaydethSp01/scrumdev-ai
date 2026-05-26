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
from shared.observability import get_logger
from shared.personalization import build_style_prefix, remember

logger = get_logger(__name__)


APP_GENERATOR_SYSTEM = (
    "Eres un Tech Lead y product designer senior. Generas proyectos web "
    "PROFESIONALES, COHERENTES y comercialmente competitivos sobre el stack "
    "OFICIAL ScrumDev AI: FastAPI + Next.js + PostgreSQL + Docker. "
    "Tu trabajo NO es demos academicos: el output debe poder competir con "
    "productos reales en diseno, UX, datos realistas y arquitectura limpia. "
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


async def generate_full_app(
    project_key: str,
    vision: str,
    target_users: str | None,
    backlog: list[dict],
    stack_preference: str | None = None,  # ignorado: stack es fijo
    brand_kit: dict | None = None,
    assets: list[dict] | None = None,
) -> dict:
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
        f"### Backlog priorizado:\n{backlog_block}\n\n"
        f"{_STACK_INSTRUCTIONS}\n\n"
        "**REGLAS GLOBALES OBLIGATORIAS:**\n"
        "1. Disenio profesional: tipografia generosa, espaciado, gradientes sutiles, "
        "rounded-xl/2xl, shadow-lg, dark mode (`dark:` variants), grids responsive. "
        "NO HTML plano, NO bullets con letras sueltas. Usa iconos lucide.\n"
        "2. Persistencia REAL: backend FastAPI en `api/index.py` con psycopg + "
        "Postgres (Vercel Postgres inyecta `POSTGRES_URL`). Frontend consume via "
        "`/api/*` mismo dominio. Si backend o DB fallan, frontend cae a `lib/mock.ts` "
        "y backend devuelve hardcoded (NUNCA 500).\n"
        "3. Rutas coherentes: TODOS los `<Link href=>` apuntan a paginas que CREES. "
        "Lista exacta en `routes`.\n"
        "4. Mobile responsive (sm/md/lg breakpoints).\n"
        "5. Datos demo REALISTAS: nombres hispanos, lugares reales, descripciones "
        "creibles. NO Lorem Ipsum, NO 'User 1, User 2'.\n"
        "6. Genera EXACTAMENTE los 24 archivos listados en STACK_INSTRUCTIONS. NO inventes paths.\n"
        "7. Cada archivo COMPLETO Y EJECUTABLE, max 280 lineas.\n"
        "8. NO uses react-router-dom NI react-helmet (Next.js usa next/link).\n"
        "9. NO crees Dockerfile, docker-compose, seed.py externo, ni carpetas "
        "`frontend/` o `backend/` (todo va a la RAIZ del repo para Vercel).\n"
        "10. El backend `api/index.py` debe EXPORTAR la variable `app` (tipo FastAPI) "
        "como ultima linea para que Vercel la detecte como ASGI handler.\n\n"
        "**Formato JSON exacto (sin texto extra):**\n"
        "{\n"
        '  "stack": "vercel-fullstack-fastapi-nextjs-postgres",\n'
        '  "summary": "1-2 frases del proyecto",\n'
        '  "routes": ["/", "/<feature>", ...],\n'
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
    data["stack"] = "vercel-fullstack-fastapi-nextjs-postgres"

    logger.info(
        "full_app_generated",
        project=project_key,
        files=len(files),
        routes=len(data.get("routes", [])),
    )
    await remember(
        project_key,
        f"APP COMPLETA [vercel-fullstack]: {data.get('summary','')} | "
        f"routes: {data.get('routes')}",
        kind="app",
    )
    return data

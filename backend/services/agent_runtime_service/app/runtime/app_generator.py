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

import asyncio
import json
import os
import re
import time

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from services.agent_runtime_service.app.runtime.gen_progress import GenProgress
from services.agent_runtime_service.app.runtime.product_classifier import classify_product
from shared.observability import get_logger
from shared.personalization import build_style_prefix, remember

logger = get_logger(__name__)

# Presupuesto wall-clock TOTAL de la generación (segundos). Garantiza que la fase
# DEVELOPMENT no se demore "un siglo": la generación principal siempre corre; los
# refinamientos (calidad/diseño/tests) solo se ejecutan mientras quede presupuesto,
# y si no caben se OMITEN y se envía la app ya generada (nunca code=0, nunca colgado).
_APP_GEN_BUDGET_S = float(os.environ.get("APP_GEN_BUDGET_S", "900"))  # 15 min tope


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


# ── BRIEFS DE DISEÑO (calidad agencia). Se elige según el stack: una app con
# datos quiere app-shell con sidebar; un landing quiere hero + secciones. Usar
# el brief equivocado = layout feo. Por eso es consciente del stack. ──────────
_DESIGN_BRIEF_APP = (
    "=================== BRIEF DE DISEÑO (nivel mercado 2026, OBLIGATORIO) ===================\n"
    "Construye una UI de PRODUCTO que compita con Linear/Vercel/Stripe/Pipedrive. NUNCA HTML plano.\n\n"
    "**UI-KIT PREMIUM YA DISPONIBLE en `@/components/ui/*` (impórtalos por nombre, NO los recrees):**\n"
    "El layout YA envuelve todo en el app-shell (sidebar branded + header + auth) — TÚ solo escribes el\n"
    "contenido de cada `app/**/page.tsx`. NO hagas tu propio shell/sidebar/layout.\n"
    "  • `Hero` {title,subtitle,action} — banner gradiente de marca. Úsalo arriba del dashboard (app/page.tsx).\n"
    "  • `StatCard` {label,value,icon,trend:{value,positive}} — KPI con chip de icono y pill de tendencia.\n"
    "  • `ChartCard` {title,subtitle,data:[{label,value}]} — gráfico de barras.\n"
    "  • `Card` {className,children}. `Badge` {tone:success|warning|danger|info|brand|neutral}. `Avatar` {name}.\n"
    "  • `DataTable` {columns:[{key,header,align,render}],rows,empty} — usa render para Avatar/Badge/moneda.\n"
    "  • `PageHeader` {title,subtitle,action}. `Button` {variant:primary|secondary|ghost|danger}. `EmptyState`.\n"
    "  • **MÓDULO ESTRELLA del sector** (impórtalo y dale su PROPIA página, p.ej. app/pipeline o app/pos):\n"
    "      CRM→`KanbanBoard`, restaurante/retail→`POSBoard`, salud→`AppointmentScheduler`,\n"
    "      ecommerce→`CheckoutCart`, logística→`LiveMap`. Funcionan sin props (traen datos demo).\n"
    "  • Iconos SOLO de `lucide-react` (NUNCA emojis). Color de marca = clase `brand` (bg-brand/text-brand/from-brand-dark).\n\n"
    "ESTRUCTURA premium:\n"
    "  • `app/page.tsx` (dashboard): `<Hero>` + grid de 4 `<StatCard>` + fila con `<ChartCard className='lg:col-span-2'>`\n"
    "    y un `<Card>` de desglose (barras `bg-brand`) + un `<Card className='!p-0'>` con lista/`DataTable` reciente.\n"
    "  • Cada entidad: `<PageHeader action={<Button>+ Nuevo</Button>}>` + `<Card className='!p-0'><DataTable/></Card>`\n"
    "    con columna de acciones (Button ghost 'Editar' + danger 'Eliminar'). Botón Nuevo → router.push('/<ent>/create').\n\n"
    "REGLAS DE ESTILO (duras):\n"
    "• **MODO CLARO SIEMPRE. PROHIBIDO usar clases `dark:`** (rompe el diseño con SO en oscuro).\n"
    "  Fondos `bg-white`/`bg-slate-50`, texto `text-slate-900` (títulos) y `text-slate-500` (secundario). Contraste AA.\n"
    "• Color SOLO vía clase `brand` (bg-brand, text-brand, border-brand, from-brand-dark, to-brand). NO hardcodees azul/rosa.\n"
    "• Tarjetas `rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition`. Spacing generoso (space-y-6, gap-4/6).\n"
    "• `cursor-pointer` en todo clickeable; transiciones 150-300ms; títulos text-2xl/3xl font-bold tracking-tight.\n"
    "• Responsive real: grids grid-cols-1 sm:grid-cols-2 lg:grid-cols-4. Sin anchos fijos que desborden.\n"
    "• DATOS inline (useState con MOCK de 4-8 registros reales del dominio); los números de las StatCard cuadran con las listas.\n"
    "  Los botones Editar/Eliminar son <Button> con onClick (no enlaces a rutas inexistentes).\n"
    "====================================================================================="
)

_DESIGN_BRIEF_LANDING = (
    "=================== BRIEF DE DISEÑO (landing nivel agencia, OBLIGATORIO) ===================\n"
    "Construye un SITIO DE MARKETING que compita con Stripe/Linear/Framer. NUNCA HTML plano, "
    "NUNCA sidebar (eso es de apps, no de landings).\n"
    "ESTRUCTURA (en este orden, full-width, secciones con py-20/py-24 y max-w-6xl mx-auto):\n"
    "• NAVBAR sticky (top-0 z-50, backdrop-blur, border-b) con logo a la izquierda, links al "
    "centro/derecha y un botón CTA primario. Colapsa a menú móvil.\n"
    "• HERO impactante: titular text-5xl/6xl font-bold tracking-tight, subtítulo text-neutral-500 "
    "text-lg, 2 botones (CTA primario sólido + secundario outline) y una imagen/mockup o gradiente "
    "de marca. Centrado o split 2 columnas.\n"
    "• FEATURES: grid grid-cols-1 md:grid-cols-3 de tarjetas con icono lucide en círculo de color, "
    "título y descripción. rounded-2xl border shadow-sm hover:shadow-md.\n"
    "• PRUEBA SOCIAL: testimonios (tarjetas con avatar + cita) y/o logos de clientes.\n"
    "• PRECIOS (si aplica al dominio): 3 planes, el del medio resaltado (ring-2 ring-brand, badge).\n"
    "• CTA final de ancho completo (fondo de marca) + FOOTER con columnas de links y redes.\n"
    "SISTEMA: UNA paleta de marca coherente con el dominio (primario fuerte + neutrales), "
    "CONTRASTE AA siempre (nada de gris claro sobre claro), tipografía con jerarquía marcada, "
    "espaciado generoso, micro-interacciones (hover, transition), responsive real (mobile-first). "
    "Imágenes: usa las del cliente si las hay; si no, Unsplash temáticas del dominio.\n"
    "====================================================================================="
)


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


# Paleta por sector: un color de marca con carácter para cada dominio. El UI-kit
# usa `bg-brand`/`text-brand`, así que tailwind DEBE definir `brand` o sale gris.
_SECTOR_BRAND = {
    "retail": "#4f46e5", "inventory": "#4f46e5", "ecommerce": "#db2777",
    "salud": "#0d9488", "health": "#0d9488", "clinic": "#0d9488",
    "saas": "#6366f1", "crm": "#7c3aed", "dashboard": "#2563eb",
    "educacion": "#2563eb", "education": "#2563eb", "lms": "#2563eb",
    "restaurante": "#ea580c", "food": "#ea580c", "logistica": "#0891b2",
    "inmobiliaria": "#0f766e", "fintech": "#059669", "finanzas": "#059669",
    "gimnasio": "#dc2626", "fitness": "#dc2626", "belleza": "#db2777",
    "eventos": "#7c3aed", "rrhh": "#4338ca", "legal": "#1d4ed8",
    "turismo": "#0284c7", "hotel": "#0284c7", "agro": "#16a34a",
    "manufactura": "#475569", "ong": "#16a34a", "landing": "#4f46e5",
}


def _pick_brand_color(classification: dict, vision: str) -> str:
    """Elige un color de marca coherente con el dominio (sector/tipo/visión)."""
    hay = " ".join([
        str(classification.get("type", "")), str(classification.get("sector", "")),
        " ".join(classification.get("key_features", []) or []), vision.lower(),
    ]).lower()
    for key, color in _SECTOR_BRAND.items():
        if key in hay:
            return color
    return "#4f46e5"  # indigo por defecto


def _sector_design_note(classification: dict, vision: str) -> str:
    """Brief de diseño por sector (paleta + tipografía del skill ui-ux-pro-max +
    reglas pro de UX). Da identidad visual coherente al contenido que genera la IA;
    el tema/tipografía YA se inyecta determinista, esto alinea el resto."""
    hay = " ".join([
        str(classification.get("type", "")), str(classification.get("sector", "")),
        " ".join(classification.get("key_features", []) or []), (vision or "").lower(),
    ])
    try:
        from shared.design.sector_themes import pick_theme
        th = pick_theme(hay)
    except Exception:
        th = {"primary": "#4f46e5", "accent": "#06b6d4", "heading": "Plus Jakarta Sans",
              "body": "Inter", "sector": "default"}
    # módulo estrella sugerido por sector (paridad con el producto líder)
    haylow = hay.lower()
    star = ""
    if any(k in haylow for k in ("crm", "venta", "lead", "pipeline", "oportunidad")):
        star = "KanbanBoard (pipeline de deals) en una página /pipeline"
    elif any(k in haylow for k in ("restaurante", "comida", "pedido", "menu", "pos", "retail", "inventario", "tienda física")):
        star = "POSBoard (punto de venta) en una página /pos"
    elif any(k in haylow for k in ("salud", "clinic", "cita", "medic", "paciente", "consultorio")):
        star = "AppointmentScheduler (agendador de citas) en una página /agenda"
    elif any(k in haylow for k in ("ecommerce", "tienda", "carrito", "checkout", "moda", "shop")):
        star = "CheckoutCart (carrito y pago) en una página /checkout"
    elif any(k in haylow for k in ("logist", "flota", "envio", "ruta", "tracking", "entrega")):
        star = "LiveMap (mapa en vivo de flota) en una página /mapa"
    star_line = (f"- MÓDULO ESTRELLA del sector: incluye **{star}** (impórtalo de @/components/ui, "
                 "funciona sin props). Es el diferenciador que iguala al producto líder.\n") if star else ""
    return (
        "### DISEÑO DEL SECTOR (coherencia visual 1A):\n"
        f"- Sector: **{th['sector']}**. Color de marca (clase `brand`): {th['primary']}; "
        f"acento: {th['accent']}. Tipografía: títulos **{th['heading']}**, cuerpo **{th['body']}** "
        "(ya cargadas vía globals.css — NO las re-importes).\n"
        f"{star_line}"
        "- Usa `bg-brand`/`text-brand`/`border-brand` para acciones y realces; badges de estado con "
        "tonos semánticos (success/warning/danger). Tarjetas `rounded-2xl border shadow-sm`.\n"
        "- REGLAS PRO (skill ui-ux-pro-max): NADA de emojis como iconos (usa lucide-react); "
        "`cursor-pointer` en todo clickeable; transiciones 150-300ms; contraste de texto AA "
        "(slate-900 títulos, slate-600 secundario); foco visible. **PROHIBIDO modo oscuro / clases dark:**.\n"
    )


def _ensure_brand_color(files: list[dict], color: str, report: list[str]) -> list[dict]:
    """Garantiza que tailwind.config defina `brand` (y un brand-dark) con el color
    del sector. Si no hay tailwind.config, no hace nada (el manifest lo crea)."""
    import re as _re
    for f in files:
        p = (f.get("path") or "").lstrip("/")
        if not _re.search(r"tailwind\.config\.(ts|js|mjs|cjs)$", p):
            continue
        c = f.get("content") or ""
        if '"brand"' in c or "brand:" in c or "brand :" in c:
            # brand ya definido. Si es PLANO (brand: "#xxx") lo convertimos a
            # objeto {DEFAULT, dark} para que `brand-dark` (gradiente del
            # sidebar) exista. Si ya es objeto, lo dejamos.
            m = _re.search(r'brand\s*:\s*["\']([#0-9a-fA-F]{4,9})["\']', c)
            if m:
                base = m.group(1)
                obj = f'brand: {{ DEFAULT: "{base}", dark: "{_shade(base, -28)}" }}'
                c2 = c[:m.start()] + obj + c[m.end():]
                f["content"] = c2
                report.append(f"brand normalizado a objeto con dark en {p}")
            return files  # ya definido por la IA/brand_kit
        # inyectar `brand` SIN duplicar la clave `colors` (en JS el último gana ->
        # un segundo `colors:{}` borraría brand). Orden: dentro de colors existente
        # -> dentro de extend -> dentro de theme.
        dark = _shade(color, -28)
        brand = f'brand: {{ DEFAULT: "{color}", dark: "{dark}" }},'
        if _re.search(r"colors:\s*\{", c):
            c2 = _re.sub(r"colors:\s*\{", "colors: { " + brand, c, count=1)
        elif "extend:" in c:
            c2 = _re.sub(r"extend:\s*\{", "extend: { colors: { " + brand + " },", c, count=1)
        elif _re.search(r"theme:\s*\{", c):
            c2 = _re.sub(r"theme:\s*\{", "theme: { extend: { colors: { " + brand + " } },", c, count=1)
        else:
            c2 = c
        if c2 != c:
            f["content"] = c2
            report.append(f"color de marca {color} inyectado en {p}")
        return files
    return files


def _shade(hexc: str, pct: int) -> str:
    """Aclara/oscurece un color hex en pct (-100..100)."""
    try:
        h = hexc.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        f = 1 + pct / 100.0
        r, g, b = [max(0, min(255, int(x * f))) for x in (r, g, b)]
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return hexc


def _inject_ui_kit(files: list[dict], report: list[str]) -> list[dict]:
    """Inyecta el UI-kit 1A curado (AppShell/Sidebar/Card/DataTable/Badge/Button/
    PageHeader/EmptyState + cn) en CADA proyecto, bajo frontend/. Es la palanca de
    consistencia: Claude COMPONE con estos componentes pulidos en vez de inventar
    estilos cada vez. Se SOBREESCRIBE siempre (versión canónica garantizada)."""
    import shared
    kit_root = os.path.join(os.path.dirname(shared.__file__), "ui_kit", "frontend")
    if not os.path.isdir(kit_root):
        return files
    by_path = {(f.get("path") or "").lstrip("/"): f for f in files}
    injected = 0
    for dirpath, _dirs, fnames in os.walk(kit_root):
        for fn in fnames:
            if not fn.endswith((".ts", ".tsx")):
                continue
            abs_p = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_p, kit_root).replace(os.sep, "/")
            target = f"frontend/{rel}"
            try:
                with open(abs_p, "r", encoding="utf-8") as fh:
                    content = fh.read()
            except Exception:
                continue
            if target in by_path:
                by_path[target]["content"] = content
            else:
                files.append({"path": target, "content": content})
            injected += 1
    if injected:
        report.append(f"UI-kit 1A inyectado ({injected} componentes)")
    return files


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
        raw = await run_claude_code(prompt, system_prompt=APP_GENERATOR_SYSTEM, max_turns=1, kind="ui")
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


def _module_of(path: str) -> str:
    """Clasifica un archivo en su módulo/componente (Adam E)."""
    p = (path or "").lower()
    if "test" in p or ".spec." in p or "__tests__" in p:
        return "tests"
    if p.startswith("backend/") or p.endswith(".py"):
        return "backend"
    if p.startswith("frontend/") or p.endswith((".tsx", ".ts", ".jsx", ".js", ".css")):
        return "frontend"
    return "servicios"


def _module_summary(files: list[dict]) -> dict:
    out = {"backend": 0, "frontend": 0, "tests": 0, "servicios": 0}
    for f in files:
        if isinstance(f, dict):
            out[_module_of(f.get("path", ""))] += 1
    return out


async def _generate_tests_module(
    files: list[dict], backlog: list[dict], stack_id: str, project_key: str
) -> list[dict]:
    """CICLO del módulo TESTS (Adam E/#12): ciclo de generación PROPIO para las
    pruebas, con el código ya generado como contexto. unit + integración + test
    cases derivados de los criterios de aceptación. Best-effort."""
    code_paths = [f.get("path") for f in files if isinstance(f, dict) and f.get("path")]
    backend_paths = [p for p in code_paths if _module_of(p) == "backend"]
    if not backend_paths:
        return []  # sin backend no hay endpoints que probar (landing estática)
    crit = "\n".join(
        f"- {b.get('story_key','S?')}: {b.get('title','')}" for b in backlog[:12]
    )
    prompt = (
        f"Proyecto **{project_key}**. Genera el MÓDULO DE PRUEBAS para el código "
        "ya generado (ciclo independiente de tests).\n\n"
        f"Archivos backend existentes:\n" + "\n".join(backend_paths[:40]) + "\n\n"
        f"Historias y criterios a cubrir:\n{crit}\n\n"
        "Genera pruebas con pytest para los endpoints FastAPI (httpx/TestClient): "
        "1 archivo `backend/tests/test_<entidad>.py` por entidad con casos de éxito y "
        "validación, derivados de los criterios. Incluye `backend/tests/__init__.py` y "
        "`backend/tests/conftest.py`. Cada archivo completo y ejecutable.\n\n"
        'Responde SOLO JSON: {"files":[{"path":"backend/tests/test_x.py","content":"..."}]}'
    )
    raw = await run_claude_code(prompt, system_prompt=APP_GENERATOR_SYSTEM, max_turns=1, kind="code")
    data = _extract_json(raw)
    new = data.get("files", []) if isinstance(data, dict) else []
    existing = {f.get("path") for f in files if isinstance(f, dict)}
    return [
        f for f in new
        if isinstance(f, dict) and f.get("path") and f["path"] not in existing
        and _module_of(f["path"]) == "tests"
    ]


async def _qg(files, vision, classification, project_key):
    """Wrapper del gate de calidad (import local: evita import circular)."""
    from services.agent_runtime_service.app.runtime.quality_gate import enforce_quality
    return await enforce_quality(files, vision, classification, project_key)


async def _dr(files, vision, project_key):
    """Wrapper del revisor de diseño (import local: evita import circular)."""
    from services.agent_runtime_service.app.runtime.design_reviewer import (
        review_and_fix_design,
    )
    return await review_and_fix_design(files, vision, project_key)


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
    is_landing = stack_id == "nextjs-static"
    stack_block = _STACK_STATIC if is_landing else _STACK_FULLSTACK
    design_brief = _DESIGN_BRIEF_LANDING if is_landing else _DESIGN_BRIEF_APP
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

    # CONTEXTO COMPARTIDO: idéntico para todos los agentes paralelos -> coherencia
    # (mismos nombres de entidades, rutas, stack y diseño en frontend y backend).
    _RULES = (
        "**REGLAS TÉCNICAS OBLIGATORIAS (romperlas = build roto):**\n"
        "1. DATOS (CRÍTICO - la pantalla NUNCA debe verse vacía): el estado inicial DEBE SER "
        "el array de datos, NO vacío. `useState(MOCK)` donde MOCK es un array inline de 4-8 "
        "registros REALES del dominio (o importado de `frontend/lib/mock.ts`). "
        "PROHIBIDO `useState([])`, `useState(null)`. El fetch al backend va en useEffect SOLO "
        "para REFRESCAR (`.then(d => d?.length && setX(d))`). Cero ceros, cero Lorem.\n"
        "2. COMPONENTES: si IMPORTAS un componente (`@/components/X`) DEBES generarlo completo.\n"
        "3. SEPARACIÓN: frontend bajo `frontend/`, backend bajo `backend/`. No dupliques.\n"
        "4. App Router: navega con `next/navigation` y `next/link`. NUNCA `next/router`. TODO "
        "archivo con hooks/eventos empieza con `\"use client\";` en la 1ª línea. `app/layout.tsx` "
        "es server component (sin 'use client').\n"
        "5. El frontend habla con backend SOLO vía `process.env.NEXT_PUBLIC_API_URL` con fallback "
        "a `lib/mock.ts`. El backend `backend/main.py` deja `app` (FastAPI) con CORS.\n"
        "6. Cada archivo COMPLETO Y EJECUTABLE (sin '...', sin placeholders).\n"
    )
    shared_ctx = (
        f"{style_prefix}{brand_block}"
        f"Proyecto: **{project_key}**\nVision:\n{vision}\n{users_block}\n\n"
        f"{software_block}\n### Backlog priorizado:\n{backlog_block}\n\n"
        f"{exemplars_block}{stack_block}\n\n{manifest_block}\n\n{design_brief}\n\n"
        f"{_sector_design_note(classification, vision)}\n{_RULES}\n"
    )
    _entities = classification.get("entities") or []
    _routes_hint = ", ".join(["/"] + [f"/{str(e).lower()}" for e in _entities][:8]) or "/"
    _json_fmt = (
        "\n**Devuelve SOLO este JSON (sin texto extra):**\n"
        '{ "files": [{"path": "...", "content": "..."}, ...] }\n'
    )

    progress = GenProgress(project_key)
    _deadline = time.monotonic() + _APP_GEN_BUDGET_S

    def _budget_left() -> float:
        return _deadline - time.monotonic()

    # ============== GENERACIÓN POR-ARCHIVO (rápida en CPU débil) ==============
    # EVIDENCIA (medida en prod free-tier): una llamada con OUTPUT GRANDE (varios
    # archivos en un JSON) se cuelga >7min y supera el timeout — sin importar la
    # concurrencia. Una llamada con output CHICO (≈backlog) completa en ~30-40s.
    # => Generamos UN archivo por llamada, con output CRUDO (no un JSON gigante) y
    # un prompt COMPACTO. Cada llamada es pequeña -> completa rápido y fiable.
    # El scaffolding (package.json, configs) lo pone el backfill determinista, así
    # Claude solo genera los archivos SUSTANTIVOS (páginas + backend).

    _ent_list = ", ".join(map(str, _entities[:4])) or "del dominio"
    compact_ctx = (
        f"Producto: {vision[:500]}\n"
        f"Usuarios: {target_users or 'generales'}\n"
        f"Stack: Next.js 14 App Router + Tailwind (frontend/) y FastAPI (backend/).\n"
        f"Entidades del dominio: {_ent_list}.\n"
        f"{brand_block[:400]}"
        "REGLAS: TypeScript/React limpio y profesional. Archivos con hooks/eventos empiezan "
        "con \"use client\"; en la 1ª línea (app/layout.tsx NO). Navega con next/link y "
        "next/navigation (NUNCA next/router). Estado inicial = datos mock reales inline "
        "(useState con array de 4-8 registros), NUNCA useState([]) ni null. Importa datos de "
        "@/lib/mock. Diseño Tailwind moderno (cards, tabla, sidebar), nada vacío ni Lorem.\n"
    )

    def _strip_fences(raw: str) -> str:
        """Extrae el código limpio de la respuesta de Claude.

        ROBUSTO contra el fallo #1 de la generación por-archivo: el modelo a veces
        devuelve el código y DESPUÉS una explicación markdown (## …, ---, tablas, "
        Decisiones de diseño…") que, sin cercas ```, se colaba al archivo -> Syntax
        Error en el build (era la causa de deploys rotos). Aquí: (1) si hay cerca ```
        usamos su contenido; (2) si no, cortamos la prosa markdown trailing.
        """
        import re as _re
        s = (raw or "").strip()
        if "```" in s:
            m = _re.search(r"```[a-zA-Z]*\n(.*?)```", s, _re.DOTALL)  # bloque cerrado
            if m:
                return m.group(1).strip()
            m2 = _re.search(r"```[a-zA-Z]*\n(.*)", s, _re.DOTALL)  # cerca sin cierre
            if m2:
                s = m2.group(1).strip()
        # cortar explicación markdown que el modelo añade DESPUÉS del código
        lines = s.split("\n")
        cut = len(lines)
        seen_code = False
        for i, ln in enumerate(lines):
            t = ln.strip()
            if not seen_code and any(ch in t for ch in ("{", "}", ";", "=", "(", "import", "def ", "class ")):
                seen_code = True
            tl = t.lower()
            is_prose = (
                t in ("---", "***", "___")
                or t.startswith(("## ", "### ", "#### ", "> **", "| "))
                or (t.startswith("**") and t.endswith("**") and len(t) > 4)
                or tl.startswith(("decisiones de", "explicación", "explicacion", "nota:",
                                  "notas:", "este archivo", "el componente anterior",
                                  "resumen:", "cómo funciona", "como funciona"))
            )
            if is_prose and seen_code and i > 2:
                cut = i
                break
        return "\n".join(lines[:cut]).strip()

    async def _gen_file(path: str, what: str, label: str) -> dict | None:
        """Genera UN archivo (output chico -> rápido y fiable en el free-tier)."""
        prompt = (
            compact_ctx
            + f"\nGenera el archivo `{path}`.\n{what}\n"
            "IMPORTANTE: responde ÚNICAMENTE con el código del archivo. NADA de "
            "explicaciones, comentarios introductorios, tablas ni texto markdown "
            "(ni '---', ni '## ', ni 'Decisiones de diseño') ni antes ni después del código."
        )
        async with progress.step("Developer Agent", f"Generando {label}", "generate_app") as st:
            # max_turns ALTO: el CLI de Claude Code es AGÉNTICO (razona + genera). Con
            # max_turns=1 los archivos sustantivos (mock con datos reales, páginas CRUD)
            # chocaban con "Reached maximum number of turns (1)" y FALLABAN. Esa era la
            # causa raíz del "se cuelga y no crea código", NO el tamaño ni el free-tier.
            raw = await run_claude_code(
                prompt, system_prompt=APP_GENERATOR_SYSTEM,
                max_turns=int(os.environ.get("GEN_MAX_TURNS", "10")), kind="ui")
            content = _strip_fences(raw)
            st.set(output=f"{path} ({len(content)} chars)",
                   artifacts=[{"type": "file", "path": path}])
            if content and len(content) > 20:
                return {"path": path, "content": content}
            return None

    def _plan_files() -> list[tuple[str, str, str]]:
        """PLANNER: lista de (path, qué contiene, label) — UN archivo por tarea."""
        if is_landing:
            return [
                ("frontend/app/layout.tsx",
                 "Server component con <html><body> y metadata. Sin 'use client'.", "el layout"),
                ("frontend/app/page.tsx",
                 "Landing profesional: hero, features, pricing, CTA y footer. Copy real del producto.",
                 "la landing"),
            ]
        plan: list[tuple[str, str, str]] = [
            ("frontend/app/layout.tsx",
             "Server component <html><body> + un sidebar/nav (componente inline o simple) con "
             f"<Link> a / y a una ruta por entidad ({_ent_list}). Sin 'use client'.", "el layout"),
            ("frontend/lib/mock.ts",
             f"Exporta arrays de datos mock REALES (4-8 registros) por cada entidad: {_ent_list}. "
             "TypeScript con tipos.", "los datos mock"),
            ("frontend/app/page.tsx",
             "DASHBOARD: 3-4 MetricCards con números reales + una tabla resumen. Importa datos "
             "de @/lib/mock. 'use client' arriba.", "el dashboard"),
        ]
        for ent in _entities[:4]:
            e = str(ent).lower()
            plan.append((
                f"frontend/app/{e}/page.tsx",
                f"Página CRUD de '{ent}': tabla con los datos de @/lib/mock + formulario para "
                "crear/editar y botón eliminar (estado local). 'use client' arriba.",
                f"la página de {ent}"))
        plan.append((
            "backend/main.py",
            "FastAPI con CORS abierto + endpoints CRUD GET/POST/PUT/DELETE por cada entidad "
            f"({_ent_list}), con datos seed en memoria (listas Python). Expone `app`. Arranca "
            "SIN base de datos. Incluye if __name__ con uvicorn.", "el backend"))
        return plan

    # EXECUTOR: secuencial por defecto (concurrencia 1) en el free-tier para que cada
    # archivo tenga todo el CPU. Configurable con GEN_MAX_CONCURRENCY. Cada archivo es
    # chico -> aunque sea secuencial, ~30-40s c/u. Respeta el presupuesto wall-clock.
    _conc = int(os.environ.get("GEN_MAX_CONCURRENCY", "1"))
    _sem = asyncio.Semaphore(max(1, _conc))

    async def _run_one(path: str, what: str, label: str) -> dict | None:
        if _budget_left() < 45:  # sin presupuesto -> no arrancar otro archivo
            return None
        async with _sem:
            try:
                return await asyncio.wait_for(_gen_file(path, what, label),
                                              timeout=max(40.0, _budget_left() - 20))
            except Exception as exc:  # noqa: BLE001 — un archivo que falla no rompe el resto
                logger.warning("gen_file_failed", project=project_key, path=path,
                               error=str(exc)[:140])
                return None

    _plan = _plan_files()
    logger.info("perfile_plan", project=project_key, files=len(_plan),
                paths=[p[0] for p in _plan])
    _results = await asyncio.gather(*[_run_one(p, w, l) for p, w, l in _plan])

    # MERGER: dedup por path. Un archivo que falló lo cubre el backfill determinista.
    _merged: dict[str, dict] = {}
    for f in _results:
        if f and f.get("path"):
            _merged[f["path"]] = f
    files = list(_merged.values())

    if not files:
        raise ValueError("app generation produced no files")
    data = {
        "stack": stack_id,
        "product_type": classification["type"],
        "files": files,
    }

    # Helper: corre un refinamiento con IA SOLO si queda presupuesto, time-boxeado al
    # presupuesto restante, registrando el paso (progreso en vivo). Si no cabe o falla,
    # se OMITE y se conservan los archivos actuales -> nunca code=0, nunca un siglo.
    # `summarize(res) -> (output_str, artifacts)` se aplica DENTRO del paso para que el
    # resumen quede persistido antes de cerrar la fila AgentRun. Devuelve el `res` o None.
    async def _refine(agent: str, desc: str, min_needed: float, coro_factory, summarize):
        left = _budget_left()
        if left < min_needed:
            await progress.note(agent, desc,
                                f"Omitido para no demorar más (quedaban {int(left)}s)",
                                status="skipped")
            logger.info("refine_skipped_budget", agent=agent, left=int(left))
            return None
        try:
            async with progress.step(agent, desc) as st:
                # margen de 20s para cerrar/guardar antes del tope duro
                res = await asyncio.wait_for(coro_factory(), timeout=max(30.0, left - 20))
                out, arts = summarize(res)
                st.set(output=out, artifacts=arts)
                return res
        except asyncio.TimeoutError:
            await progress.note(agent, desc, "Cortado por tiempo; se envía lo generado",
                                status="skipped")
            logger.warning("refine_timeout", agent=agent)
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("refine_failed", agent=agent, error=str(exc)[:160])
            return None

    # PASO 2: completar archivos de DOMINIO faltantes con contenido REAL (IA).
    res = await _refine(
        "Developer Agent", "Completando archivos de dominio (datos reales)", 90,
        lambda: _complete_domain_with_ai(files, classification, stack_id, vision, project_key),
        lambda r: (f"{r[1]} archivos de dominio completados", [{"type": "files", "count": r[1]}]))
    if res:
        files = res[0]

    # GATE DE COMPLETITUD (scaffolding): determinista y rápido -> siempre corre.
    files, fill_report = _ensure_manifest_complete(files, stack_id, project_key)
    if fill_report:
        logger.info("manifest_backfilled", project=project_key, filled=fill_report)

    # UI-KIT 1A: inyección determinista de componentes + color de marca (rápido).
    try:
        kit_report: list[str] = []
        files = _inject_ui_kit(files, kit_report)
        brand_color = _pick_brand_color(classification, vision)
        files = _ensure_brand_color(files, brand_color, kit_report)
        if kit_report:
            logger.info("ui_kit_applied", project=project_key, report=kit_report, brand=brand_color)
    except Exception as exc:  # noqa: BLE001
        logger.warning("ui_kit_skipped", project=project_key, error=str(exc)[:160])

    # PASO 3: GATE DE CALIDAD — regenera con Claude las páginas pobres (best-effort).
    res = await _refine(
        "Quality Gate", "Revisando y mejorando la calidad de las páginas", 120,
        lambda: _qg(files, vision, classification, project_key),
        lambda r: (f"{len(r[1] or [])} páginas mejoradas",
                   [{"type": "quality", "fixed": len(r[1] or [])}]))
    if res:
        files = res[0]

    # PASO 4: AGENTE DE DISEÑO — audita 7 principios UX/UI y reescribe (best-effort).
    res = await _refine(
        "Design Reviewer", "Auditando diseño UX/UI y accesibilidad", 120,
        lambda: _dr(files, vision, project_key),
        lambda r: (f"{len(r[1] or [])} archivos rediseñados",
                   [{"type": "design", "fixed": len(r[1] or [])}]))
    if res:
        files = res[0]

    # PASO 5: TESTS — genera el módulo de pruebas (best-effort, último en presupuesto).
    res = await _refine(
        "Test Engineer", "Generando módulo de pruebas", 90,
        lambda: _generate_tests_module(files, backlog, stack_id, project_key),
        lambda r: (f"{len(r or [])} archivos de prueba", [{"type": "tests", "count": len(r or [])}]))
    if res:
        files = files + res

    logger.info("app_gen_budget_done", project=project_key,
                spent_s=int(_APP_GEN_BUDGET_S - _budget_left()), files=len(files))
    data["files"] = files
    data["stack"] = stack_id
    data["classification"] = classification
    data["blueprint"] = blueprint
    # Resumen por módulo/componente (Adam E): backend / frontend / tests / servicios
    data["modules"] = _module_summary(files)
    logger.info("modules_summary", project=project_key, modules=data["modules"])

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

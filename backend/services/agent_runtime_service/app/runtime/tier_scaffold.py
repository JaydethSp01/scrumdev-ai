"""Defaults validos por tier para el gate de completitud.

Si la IA omite un archivo OBLIGATORIO del manifiesto del blueprint, generamos
un default MINIMO PERO VALIDO (que compila) para ese path, de modo que el build
local y el deploy no fallen por archivos faltantes. No reemplaza lo que la IA
genero bien; solo rellena huecos.
"""
from __future__ import annotations

import json


def _pkg_json(name: str) -> str:
    return json.dumps({
        "name": name,
        "version": "0.1.0",
        "private": True,
        "scripts": {"dev": "next dev", "build": "next build", "start": "next start"},
        "dependencies": {
            "next": "14.2.13",
            "react": "18.3.1",
            "react-dom": "18.3.1",
            "lucide-react": "0.451.0",
        },
        "devDependencies": {
            "typescript": "5.5.4",
            "tailwindcss": "3.4.13",
            "autoprefixer": "10.4.20",
            "postcss": "8.4.47",
            "@types/node": "20.16.10",
            "@types/react": "18.3.11",
            "@types/react-dom": "18.3.0",
        },
    }, indent=2)


_NEXT_CONFIG = (
    "/** @type {import('next').NextConfig} */\n"
    "const nextConfig = {\n"
    "  typescript: { ignoreBuildErrors: true },\n"
    "  eslint: { ignoreDuringBuilds: true },\n"
    "};\n"
    "export default nextConfig;\n"
)

_TAILWIND_CONFIG = (
    "import type { Config } from 'tailwindcss';\n"
    "const config: Config = {\n"
    "  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],\n"
    "  theme: { extend: {} },\n"
    "  plugins: [],\n"
    "};\n"
    "export default config;\n"
)

_POSTCSS = (
    "export default {\n"
    "  plugins: { tailwindcss: {}, autoprefixer: {} },\n"
    "};\n"
)

_TSCONFIG = json.dumps({
    "compilerOptions": {
        "target": "ES2020", "lib": ["dom", "dom.iterable", "esnext"],
        "allowJs": True, "skipLibCheck": True, "strict": False,
        "noEmit": True, "esModuleInterop": True, "module": "esnext",
        "moduleResolution": "bundler", "resolveJsonModule": True,
        "isolatedModules": True, "jsx": "preserve", "incremental": True,
        "plugins": [{"name": "next"}], "paths": {"@/*": ["./*"]},
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"],
}, indent=2)

_GLOBALS_CSS = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"

_LAYOUT = (
    "import './globals.css';\n"
    "export const metadata = { title: 'App', description: 'Generado por ScrumDev AI' };\n"
    "export default function RootLayout({ children }: { children: React.ReactNode }) {\n"
    "  return (<html lang=\"es\"><body>{children}</body></html>);\n"
    "}\n"
)

_PAGE = (
    "export default function Home() {\n"
    "  return (<main className=\"min-h-screen flex items-center justify-center p-8\">\n"
    "    <div className=\"text-center\"><h1 className=\"text-3xl font-bold\">App lista</h1>\n"
    "    <p className=\"text-gray-500 mt-2\">Frontend desplegado.</p></div></main>);\n"
    "}\n"
)

_LIB_API = (
    "const API = process.env.NEXT_PUBLIC_API_URL || '';\n"
    "export async function apiGet<T>(path: string, fallback: T): Promise<T> {\n"
    "  try {\n"
    "    const r = await fetch(`${API}${path}`, { cache: 'no-store' });\n"
    "    if (!r.ok) return fallback;\n"
    "    return (await r.json()) as T;\n"
    "  } catch { return fallback; }\n"
    "}\n"
    "export async function apiPost<T>(path: string, body: unknown, fallback: T): Promise<T> {\n"
    "  try {\n"
    "    const r = await fetch(`${API}${path}`, { method: 'POST',\n"
    "      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });\n"
    "    if (!r.ok) return fallback;\n"
    "    return (await r.json()) as T;\n"
    "  } catch { return fallback; }\n"
    "}\n"
)


def _backend_main() -> str:
    # main.py que AUTO-DESCUBRE los routers que la IA haya generado bajo app/
    # (cualquier modulo que exponga `router = APIRouter()`). Asi un backend con
    # routers pero sin main.py queda funcional con TODOS sus endpoints, no solo
    # /health. Robusto: si un modulo falla al importar, lo salta (no tumba el boot).
    return (
        "import os\n"
        "import importlib\n"
        "import pkgutil\n"
        "from fastapi import FastAPI, APIRouter\n"
        "from fastapi.middleware.cors import CORSMiddleware\n\n"
        "app = FastAPI(title='API')\n"
        "origins = os.environ.get('CORS_ORIGINS', '*').split(',')\n"
        "app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,\n"
        "                   allow_methods=['*'], allow_headers=['*'])\n\n"
        "@app.get('/health')\n"
        "def health():\n"
        "    return {'status': 'ok'}\n\n"
        "@app.get('/')\n"
        "def root():\n"
        "    return {'service': 'api', 'status': 'ok'}\n\n"
        "# Auto-incluir todos los routers definidos bajo el paquete 'app'.\n"
        "def _autoload_routers():\n"
        "    try:\n"
        "        import app as app_pkg\n"
        "    except Exception:\n"
        "        return\n"
        "    for mod in pkgutil.walk_packages(app_pkg.__path__, 'app.'):\n"
        "        try:\n"
        "            m = importlib.import_module(mod.name)\n"
        "        except Exception:\n"
        "            continue\n"
        "        r = getattr(m, 'router', None)\n"
        "        if isinstance(r, APIRouter):\n"
        "            try:\n"
        "                app.include_router(r)\n"
        "            except Exception:\n"
        "                pass\n\n"
        "_autoload_routers()\n"
    )


_BACKEND_DB = (
    "import os\n"
    "DATABASE_URL = os.environ.get('DATABASE_URL')\n\n"
    "def get_conn():\n"
    "    \"\"\"Devuelve conexion psycopg o None (modo memoria/mock si no hay DB).\"\"\"\n"
    "    if not DATABASE_URL:\n"
    "        return None\n"
    "    try:\n"
    "        import psycopg\n"
    "        return psycopg.connect(DATABASE_URL)\n"
    "    except Exception:\n"
    "        return None\n"
)

_BACKEND_MODELS = (
    "from pydantic import BaseModel\n\n"
    "class Item(BaseModel):\n"
    "    id: int | None = None\n"
    "    name: str\n"
)

_REQUIREMENTS = (
    "fastapi==0.115.0\n"
    "uvicorn[standard]==0.30.6\n"
    "psycopg[binary]==3.2.3\n"
    "pydantic==2.9.2\n"
)

_DOCKERFILE = (
    "FROM python:3.12-slim\n"
    "WORKDIR /app\n"
    "COPY requirements.txt .\n"
    "RUN pip install --no-cache-dir -r requirements.txt\n"
    "COPY . .\n"
    "CMD [\"sh\", \"-c\", \"uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}\"]\n"
)


def default_for(rel_path: str, framework: str, project_key: str) -> str | None:
    """Contenido default valido para un archivo obligatorio faltante.

    rel_path es RELATIVO al prefijo del tier (ej 'app/page.tsx', 'main.py').
    Devuelve None si no hay default conocido (entonces se omite).
    """
    name = project_key.lower().replace("_", "-")
    fe = {
        "package.json": _pkg_json(name),
        "next.config.mjs": _NEXT_CONFIG,
        "tailwind.config.ts": _TAILWIND_CONFIG,
        "postcss.config.mjs": _POSTCSS,
        "tsconfig.json": _TSCONFIG,
        "app/globals.css": _GLOBALS_CSS,
        "app/layout.tsx": _LAYOUT,
        "app/page.tsx": _PAGE,
        "lib/api.ts": _LIB_API,
        ".env.example": "NEXT_PUBLIC_API_URL=https://tu-backend.onrender.com\n",
        "README.md": f"# {project_key} - Frontend\n\nNext.js desplegado en Vercel.\n",
    }
    be = {
        "main.py": _backend_main(),
        "requirements.txt": _REQUIREMENTS,
        "runtime.txt": "python-3.12.6\n",
        ".python-version": "3.12.6\n",
        "Dockerfile": _DOCKERFILE,
        "app/__init__.py": "",
        "app/db.py": _BACKEND_DB,
        "app/models.py": _BACKEND_MODELS,
        ".env.example": "DATABASE_URL=postgres://user:pass@host/db\nCORS_ORIGINS=https://tu-front.vercel.app\n",
        "README.md": f"# {project_key} - Backend\n\nFastAPI desplegado en Render.\n",
    }
    if framework in ("nextjs", "static"):
        return fe.get(rel_path)
    if framework == "fastapi":
        return be.get(rel_path)
    return None

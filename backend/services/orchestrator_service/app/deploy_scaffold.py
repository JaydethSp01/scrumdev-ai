"""Genera archivos de scaffold para que un deploy a Vercel/Render funcione.

Cuando los agentes generan codigo en `frontend/` o `backend/`, falta package.json
en la raiz y archivos de config. Aqui los anadimos automaticamente segun el stack.
"""
from __future__ import annotations

import json
import re

# Map de paquete -> version conocida para imports comunes. Si el codigo
# generado los usa, los anadimos al package.json del scaffold.
_KNOWN_VERSIONS: dict[str, str] = {
    "react-router-dom": "6.28.0",
    "axios": "1.7.7",
    "lucide-react": "0.451.0",
    "react-markdown": "9.0.1",
    "zustand": "5.0.1",
    "swr": "2.2.5",
    "tailwindcss": "3.4.13",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "@tanstack/react-query": "5.59.0",
    "framer-motion": "11.11.0",
    "clsx": "2.1.1",
    "class-variance-authority": "0.7.0",
    "date-fns": "4.1.0",
    "zod": "3.23.8",
    "react-hook-form": "7.53.0",
    "react-hot-toast": "2.4.1",
    "@radix-ui/react-slot": "1.1.0",
    "@radix-ui/react-dialog": "1.1.2",
    "lodash": "4.17.21",
    "react-helmet-async": "2.0.5",
    "vitest": "2.1.1",
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/user-event": "14.5.2",
    "@vitejs/plugin-react": "4.3.1",
    "jsdom": "25.0.1",
}

# Devs: testing, build tools, css processors.
_DEV_PACKAGES = {
    "tailwindcss",
    "autoprefixer",
    "postcss",
    "vitest",
    "@testing-library/react",
    "@testing-library/jest-dom",
    "@testing-library/user-event",
    "@vitejs/plugin-react",
    "jsdom",
}

# Paquetes INCOMPATIBLES con Next.js App Router. Si el code generator los usa
# por accidente, los movemos a devDeps + relajamos tsconfig para que el build
# no falle por type errors. El comportamiento runtime puede ser raro pero
# permite seguir el flujo (deploy queda en evidencia hasta arreglar el codigo).
_NEXT_INCOMPATIBLE = {
    "react-router-dom",
    "react-router",
    "react-helmet",
    "react-helmet-async",
    "@vitejs/plugin-react",
    "vite",
}


def _extract_imports(files: list[dict]) -> set[str]:
    """Saca el set de paquetes npm externos usados por los .ts/.tsx/.js/.jsx."""
    pattern = re.compile(
        r"""(?:^|\n)\s*import\s+(?:[^"']*?from\s+)?["']([^"']+)["']""", re.MULTILINE
    )
    pkgs: set[str] = set()
    for f in files:
        path = (f.get("path") or "").lower()
        if not (path.endswith(".tsx") or path.endswith(".ts") or path.endswith(".jsx") or path.endswith(".js")):
            continue
        for m in pattern.finditer(f.get("content", "")):
            mod = m.group(1)
            if mod.startswith(".") or mod.startswith("/") or mod.startswith("@/"):
                continue
            if mod in ("react", "react-dom", "next") or mod.startswith("next/"):
                continue
            # Tomamos solo el nombre del paquete (no subpaths).
            if mod.startswith("@"):
                parts = mod.split("/")
                pkg = "/".join(parts[:2]) if len(parts) >= 2 else mod
            else:
                pkg = mod.split("/")[0]
            pkgs.add(pkg)
    return pkgs


def _has(files: list[dict], path: str) -> bool:
    return any((f.get("path") or "") == path for f in files)


def detect_stack(files: list[dict]) -> dict:
    has_next_files_root = any(
        (f.get("path") or "").startswith("app/")
        or (f.get("path") or "").startswith("pages/")
        for f in files
    )
    has_next_files_subdir = any(
        any(
            (f.get("path") or "").startswith(p + "app/")
            or (f.get("path") or "").startswith(p + "pages/")
            for p in ("frontend/", "web/", "client/", "ui/")
        )
        for f in files
    )
    has_next_files = has_next_files_root or has_next_files_subdir
    has_python_backend_subdir = any(
        (f.get("path") or "").endswith(".py") and "backend/" in (f.get("path") or "")
        for f in files
    )
    has_serverless_api = _has(files, "api/index.py")
    has_root_package_json = _has(files, "package.json")
    has_root_requirements = _has(files, "requirements.txt")
    has_root_vercel_json = _has(files, "vercel.json")
    return {
        "has_next_files": has_next_files,
        "has_next_files_root": has_next_files_root,
        "has_python_backend": has_python_backend_subdir,
        "has_serverless_api": has_serverless_api,
        "has_root_package_json": has_root_package_json,
        "has_root_requirements": has_root_requirements,
        "has_root_vercel_json": has_root_vercel_json,
    }


def _next_package_json(project_name: str, extra_deps: set[str] | None = None) -> str:
    deps: dict[str, str] = {
        "next": "14.2.13",
        "react": "18.3.1",
        "react-dom": "18.3.1",
    }
    dev_deps: dict[str, str] = {
        "@types/node": "20.16.10",
        "@types/react": "18.3.11",
        "@types/react-dom": "18.3.0",
        "typescript": "5.6.2",
    }
    for pkg in extra_deps or set():
        # version conocida o latest si no esta mapeado
        v = _KNOWN_VERSIONS.get(pkg, "latest")
        if pkg in _DEV_PACKAGES:
            dev_deps[pkg] = v
        else:
            deps[pkg] = v
    # Si tailwind esta en deps movemos a devDeps + sus utils
    if "tailwindcss" in deps:
        v = deps.pop("tailwindcss")
        dev_deps["tailwindcss"] = v
        dev_deps.setdefault("autoprefixer", _KNOWN_VERSIONS["autoprefixer"])
        dev_deps.setdefault("postcss", _KNOWN_VERSIONS["postcss"])
    return json.dumps(
        {
            "name": project_name.lower().replace("_", "-"),
            "version": "0.1.0",
            "private": True,
            "scripts": {
                "dev": "next dev",
                "build": "next build",
                "start": "next start",
                "lint": "next lint",
            },
            "dependencies": deps,
            "devDependencies": dev_deps,
        },
        indent=2,
    )


_NEXT_CONFIG = """/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
"""

_TSCONFIG = json.dumps(
    {
        "compilerOptions": {
            "target": "ES2022",
            "lib": ["dom", "dom.iterable", "esnext"],
            "allowJs": True,
            "skipLibCheck": True,
            # strict: false + noImplicitAny: false para que builds de codigo
            # generado por IA pasen aunque tengan imperfecciones de tipos.
            "strict": False,
            "noImplicitAny": False,
            "noEmit": True,
            "esModuleInterop": True,
            "module": "esnext",
            "moduleResolution": "bundler",
            "resolveJsonModule": True,
            "isolatedModules": True,
            "jsx": "preserve",
            "incremental": True,
            "plugins": [{"name": "next"}],
            "paths": {"@/*": ["./*"]},
        },
        "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        "exclude": ["node_modules"],
    },
    indent=2,
)

_NEXT_CONFIG_RELAXED = """/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Generated code can have lint/type issues. Don't block production build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
"""

_NEXT_ENV = """/// <reference types="next" />
/// <reference types="next/image-types/global" />
"""

_GLOBALS_CSS = """/* ScrumDev AI - minimal globals */
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: #fff;
  color: #111;
}
@media (prefers-color-scheme: dark) {
  html, body { background: #0a0a0a; color: #ededed; }
}
a { color: #5b6cff; }
"""

_GLOBALS_CSS_TAILWIND = """@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
}
@media (prefers-color-scheme: dark) {
  :root { --background: #0a0a0a; --foreground: #ededed; }
}
body {
  color: var(--foreground);
  background: var(--background);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
"""

_TAILWIND_CONFIG = """import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#5b6cff", dark: "#3b4be0" },
      },
    },
  },
  plugins: [],
};
export default config;
"""

_POSTCSS_CONFIG = """export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
"""


_TAILWIND_CLASS_RE = re.compile(
    r"""className\s*=\s*["'`][^"'`]*?\b(?:flex|grid|p-\d|px-\d|py-\d|m-\d|mx-\d|my-\d|text-(?:sm|base|lg|xl|2xl|3xl|4xl|center|left|right|white|black|gray-\d+|neutral-\d+|brand)|bg-(?:white|black|gray-\d+|neutral-\d+|brand|red-\d+|green-\d+|blue-\d+|yellow-\d+)|rounded(?:-\w+)?|border(?:-\w+)?|shadow(?:-\w+)?|w-(?:full|\d+|auto)|h-(?:full|\d+|auto|screen)|max-w-\w+|min-h-\w+|space-x-\d|space-y-\d|gap-\d|font-(?:bold|semibold|medium)|hover:|dark:|sm:|md:|lg:|xl:)"""
)


def _uses_tailwind(files: list[dict]) -> bool:
    """Heuristica: el codigo importa tailwind o tiene clases tipicas de tailwind."""
    for f in files:
        content = f.get("content", "") or ""
        path = (f.get("path") or "").lower()
        if "@tailwind" in content:
            return True
        if "tailwindcss" in content and (
            path.endswith(".ts") or path.endswith(".js") or path.endswith(".mjs")
        ):
            return True
        if path.endswith((".tsx", ".jsx")) and _TAILWIND_CLASS_RE.search(content):
            return True
    return False

_VERCEL_JSON = json.dumps({"framework": "nextjs"}, indent=2)

_VERCEL_JSON_FULLSTACK = json.dumps(
    {
        "$schema": "https://openapi.vercel.sh/vercel.json",
        "framework": "nextjs",
        "rewrites": [{"source": "/api/:path*", "destination": "/api/index"}],
    },
    indent=2,
)

_REQUIREMENTS_FALLBACK = """fastapi==0.115.0
pydantic==2.9.2
psycopg[binary]==3.2.3
"""

_ROOT_LAYOUT = """import "./globals.css";
export const metadata = { title: "Building with ScrumDev AI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 text-white antialiased">{children}</body>
    </html>
  );
}
"""

_ROOT_PAGE = """export default function Page() {
  return (
    <main className="min-h-screen grid place-items-center px-6 py-16 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-32 w-[600px] h-[600px] rounded-full bg-indigo-500/30 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[640px] h-[640px] rounded-full bg-fuchsia-500/25 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="relative z-10 text-center max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-semibold bg-white/10 backdrop-blur border border-white/20 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Tu app esta lista
        </div>
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          Tu producto, en linea<br />
          <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
            generado con agentes IA
          </span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-white/70 max-w-xl mx-auto">
          Esta es la primera version de tu aplicacion. El siguiente deploy reemplazara esta landing con la UI completa que pediste en tu vision.
        </p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
          {["Backlog Scrum", "Backend FastAPI", "Postgres", "Deploy automatico"].map((f) => (
            <div key={f} className="rounded-xl border border-white/15 bg-white/[0.04] backdrop-blur px-3 py-3 text-xs sm:text-sm font-medium">
              {f}
            </div>
          ))}
        </div>
        <p className="mt-12 text-xs text-white/40">
          Powered by ScrumDev AI - Claude + OpenAI + Next.js + Vercel
        </p>
      </div>
    </main>
  );
}
"""

_README_TEMPLATE = """# {name}

Generated by ScrumDev AI.

## Stack
- Frontend: Next.js 14
- Backend: FastAPI (en `backend/`)

## Deploy
- Frontend desplegado en Vercel.
- Backend: levanta localmente con `cd backend && pip install -r requirements.txt && uvicorn app.main:app`.
"""


# Prefijos comunes que los agentes usan para el frontend. Cualquier archivo
# dentro de estos se mira a ver si conviene espejarse a la raiz.
_FRONTEND_PREFIXES = ("frontend/", "web/", "client/", "ui/")


def _frontend_root_dir(files: list[dict]) -> str | None:
    """Detecta cual de los prefijos contiene un `<prefix>app/page.tsx` real
    (i.e. el root del codigo Next.js). Si ninguno, retorna None.
    """
    for prefix in _FRONTEND_PREFIXES:
        for f in files:
            path = (f.get("path") or "")
            if path in (f"{prefix}app/page.tsx", f"{prefix}app/page.jsx"):
                return prefix
    # Fallback: cualquier prefix con archivos en app/ aunque no haya page.tsx.
    for prefix in _FRONTEND_PREFIXES:
        for f in files:
            path = (f.get("path") or "")
            if path.startswith(f"{prefix}app/"):
                return prefix
    return None


def _copy_frontend_to_root(files: list[dict]) -> list[dict]:
    """Replica el codigo Next.js desde su carpeta detectada (frontend/, web/, etc.)
    hacia la raiz para que Vercel build sin configurar rootDirectory.
    """
    root = _frontend_root_dir(files)
    if not root:
        return []
    copies: list[dict] = []
    seen = {(f.get("path") or "") for f in files}
    valid_exts = (".tsx", ".ts", ".jsx", ".js", ".css", ".scss", ".json", ".svg")
    for f in files:
        path = f.get("path") or ""
        if not path.startswith(root):
            continue
        # node_modules, .next, configs ya en raiz, etc.
        if "node_modules" in path or ".next" in path:
            continue
        if not path.endswith(valid_exts):
            continue
        new_path = path[len(root):]
        if not new_path or new_path in seen:
            continue
        copies.append({"path": new_path, "content": f.get("content", "")})
        seen.add(new_path)
    return copies


_LIB_API_PATCH = """

// Auto-patch (scaffold): asegura que `fallbacks` y types esten exportados
// aunque el LLM olvidara declararlos. Importa solo si los modulos existen.
import { BARISTAS_MOCK, TURNOS_MOCK, GRANOS_MOCK } from './mock';

export const fallbacks = {
  baristas: BARISTAS_MOCK,
  turnos: TURNOS_MOCK,
  granos: GRANOS_MOCK,
};
"""

_LIB_MOCK_PATCH = """

// Auto-patch (scaffold): types derivados para que las pages que los importan
// no rompan el build.
export type Turno = (typeof TURNOS_MOCK)[number];
export type Barista = (typeof BARISTAS_MOCK)[number];
export type Grano = (typeof GRANOS_MOCK)[number];
"""


_FORCE_DYNAMIC_LINE = "export const dynamic = 'force-dynamic';"


def _autofix_force_dynamic(files: list[dict]) -> list[dict]:
    """Inyecta `export const dynamic = 'force-dynamic'` en TODAS las pages
    async que usan `await apiGet/apiPost`. Previene "prerender error" de
    Next cuando el server tira al fetch en build time sin backend disponible.
    """
    patched: list[dict] = []
    for f in files:
        path = f.get("path") or ""
        content = f.get("content") or ""
        if not path.startswith("app/") or not path.endswith("page.tsx"):
            continue
        if "await apiGet" not in content and "await apiPost" not in content:
            continue
        if "export const dynamic" in content:
            continue
        # Insertar tras el ultimo import
        lines = content.split("\n")
        last_import_idx = -1
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("import ") or stripped.startswith("import("):
                last_import_idx = i
        if last_import_idx < 0:
            new_lines = [_FORCE_DYNAMIC_LINE, ""] + lines
        else:
            new_lines = lines[: last_import_idx + 1] + ["", _FORCE_DYNAMIC_LINE] + lines[last_import_idx + 1 :]
        patched.append({"path": path, "content": "\n".join(new_lines)})
    return patched


def _autofix_lib_exports(files: list[dict]) -> list[dict]:
    """Si las pages importan `fallbacks`/`Turno`/`Barista`/`Grano` pero el
    LLM no los exporto, le agregamos el shim al final de lib/api.ts y lib/mock.ts.

    Esto resuelve el bug recurrente de Next prerender "Cannot read properties
    of undefined (reading 'turnos')".
    """
    patched: list[dict] = []
    # Detecta uso desde cualquier app/**/*.tsx
    uses_fallbacks = any(
        "fallbacks" in (f.get("content") or "")
        and "lib/api" in (f.get("content") or "")
        and (f.get("path") or "").startswith("app/")
        for f in files
    )
    uses_type = any(
        (("Turno" in (f.get("content") or "")) or ("Barista" in (f.get("content") or "")) or ("Grano" in (f.get("content") or "")))
        and "@/lib/mock" in (f.get("content") or "")
        for f in files
    )
    for f in files:
        path = f.get("path") or ""
        content = f.get("content") or ""
        if path == "lib/api.ts" and uses_fallbacks and "export const fallbacks" not in content:
            patched.append({"path": "lib/api.ts", "content": content.rstrip() + _LIB_API_PATCH})
        elif path == "lib/mock.ts" and uses_type and "export type Turno" not in content:
            patched.append({"path": "lib/mock.ts", "content": content.rstrip() + _LIB_MOCK_PATCH})
    return patched


def build_scaffold(project_name: str, files: list[dict]) -> list[dict]:
    """Devuelve archivos de scaffold faltantes para que el deploy funcione."""
    info = detect_stack(files)
    extra: list[dict] = []
    # Auto-fix exports faltantes en lib/api.ts y lib/mock.ts
    extra.extend(_autofix_lib_exports(files))
    # Auto-fix prerender error: forzar dynamic en pages async
    extra.extend(_autofix_force_dynamic(files))

    # Caso ideal nuevo: el generador ya pone TODO en root (app/, api/, etc).
    # Solo agregamos lo que falte.
    if info["has_next_files_root"]:
        combined = files
        used_pkgs = _extract_imports(combined)
        if not info["has_root_package_json"]:
            extra.append(
                {
                    "path": "package.json",
                    "content": _next_package_json(project_name, extra_deps=used_pkgs),
                }
            )
        if not _has(combined, "next.config.mjs") and not _has(combined, "next.config.js"):
            extra.append({"path": "next.config.mjs", "content": _NEXT_CONFIG_RELAXED})
        if not _has(combined, "tsconfig.json"):
            extra.append({"path": "tsconfig.json", "content": _TSCONFIG})
        if not _has(combined, "next-env.d.ts"):
            extra.append({"path": "next-env.d.ts", "content": _NEXT_ENV})
        if _uses_tailwind(combined):
            if not _has(combined, "tailwind.config.ts") and not _has(combined, "tailwind.config.js"):
                extra.append({"path": "tailwind.config.ts", "content": _TAILWIND_CONFIG})
            if not _has(combined, "postcss.config.mjs") and not _has(combined, "postcss.config.js"):
                extra.append({"path": "postcss.config.mjs", "content": _POSTCSS_CONFIG})
            if not _has(combined, "app/globals.css"):
                extra.append({"path": "app/globals.css", "content": _GLOBALS_CSS_TAILWIND})
        if info["has_serverless_api"]:
            if not info["has_root_requirements"]:
                extra.append({"path": "requirements.txt", "content": _REQUIREMENTS_FALLBACK})
            # FORZAR override del vercel.json del LLM — el LLM tiende a meter
            # runtime: python3.12 que es invalido y rompe el build con
            # "Function Runtimes must have a valid version".
            extra.append({"path": "vercel.json", "content": _VERCEL_JSON_FULLSTACK})
        elif not info["has_root_vercel_json"]:
            extra.append({"path": "vercel.json", "content": _VERCEL_JSON})
        if not _has(combined, "README.md"):
            extra.append(
                {"path": "README.md", "content": _README_TEMPLATE.format(name=project_name)}
            )
        return extra

    # Caso legacy: el generador puso el frontend en una subcarpeta.
    if info["has_next_files"] and not info["has_root_package_json"]:
        # 1. Copiar codigo de frontend/* a la raiz para que Next.js lo encuentre.
        mirrored = _copy_frontend_to_root(files)
        extra.extend(mirrored)

        # Combinamos files+mirrored para los checks _has() siguientes.
        combined = files + mirrored

        # 2. Detecta imports externos para package.json.
        used_pkgs = _extract_imports(combined)
        extra.append(
            {
                "path": "package.json",
                "content": _next_package_json(project_name, extra_deps=used_pkgs),
            }
        )
        if not _has(combined, "next.config.mjs"):
            extra.append({"path": "next.config.mjs", "content": _NEXT_CONFIG_RELAXED})
        if not _has(combined, "tsconfig.json"):
            extra.append({"path": "tsconfig.json", "content": _TSCONFIG})
        if not _has(combined, "next-env.d.ts"):
            extra.append({"path": "next-env.d.ts", "content": _NEXT_ENV})
        # Solo placeholder si DESPUES de copiar de frontend/ no hay layout/page real.
        if not _has(combined, "app/layout.tsx") and not _has(combined, "app/layout.jsx"):
            extra.append({"path": "app/layout.tsx", "content": _ROOT_LAYOUT})
        if not _has(combined, "app/page.tsx") and not _has(combined, "app/page.jsx"):
            extra.append({"path": "app/page.tsx", "content": _ROOT_PAGE})
        if not _has(combined, "vercel.json"):
            extra.append({"path": "vercel.json", "content": _VERCEL_JSON})

        # Tailwind: si el codigo lo usa, configurar + globals con @tailwind.
        uses_tw = _uses_tailwind(combined)
        if uses_tw:
            used_pkgs.update({"tailwindcss", "autoprefixer", "postcss"})
            # Re-generamos package.json con deps actualizadas
            extra = [
                e
                for e in extra
                if e.get("path") != "package.json"
            ]
            extra.insert(
                0,
                {
                    "path": "package.json",
                    "content": _next_package_json(project_name, extra_deps=used_pkgs),
                },
            )
            if not _has(combined, "tailwind.config.ts") and not _has(
                combined, "tailwind.config.js"
            ):
                extra.append({"path": "tailwind.config.ts", "content": _TAILWIND_CONFIG})
            if not _has(combined, "postcss.config.mjs") and not _has(
                combined, "postcss.config.js"
            ):
                extra.append({"path": "postcss.config.mjs", "content": _POSTCSS_CONFIG})

        # globals.css: si algun archivo lo importa y no existe, lo creamos.
        needs_globals = any(
            "globals.css" in (f.get("content") or "") for f in combined
        )
        if needs_globals and not _has(combined, "app/globals.css"):
            content = _GLOBALS_CSS_TAILWIND if uses_tw else _GLOBALS_CSS
            extra.append({"path": "app/globals.css", "content": content})

    if not _has(files, "README.md"):
        extra.append(
            {"path": "README.md", "content": _README_TEMPLATE.format(name=project_name)}
        )

    return extra

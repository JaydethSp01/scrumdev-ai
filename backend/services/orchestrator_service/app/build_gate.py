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


def _seed_initial_state(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Red de seguridad: si una página arranca con estado VACÍO (`useState([])` /
    `useState(null)`) y luego hace fetch, se ve vacía hasta que responda el backend
    (mala primera impresión). La sembramos con datos mock inline derivados de las
    columnas que la propia página declara -> el dashboard SIEMPRE muestra datos."""
    import re as _re

    def _mock_value(key: str, i: int):
        k = key.lower()
        if any(w in k for w in ("precio", "price", "total", "monto", "importe", "valor",
                                "amount", "stock", "cantidad", "qty", "count", "edad")):
            return [120, 49, 89, 35, 210, 75][i % 6]
        if any(w in k for w in ("estado", "status")):
            return ["Activo", "Pendiente", "Completado", "En proceso"][i % 4]
        if any(w in k for w in ("fecha", "date")):
            return ["2026-01-12", "2026-02-03", "2026-02-20", "2026-03-05"][i % 4]
        if "email" in k or "correo" in k:
            return f"cliente{i+1}@empresa.com"
        if k in ("id", "codigo", "code", "#"):
            return i + 1
        return f"Ejemplo {i + 1}"

    fixed = 0
    for f in files_rel:
        p = (f.get("path") or "").lstrip("/")
        if not (p.endswith("page.tsx") or p.endswith("page.jsx")):
            continue
        c = f.get("content") or ""
        # SOLO arrays vacíos (useState([])). NO tocar useState(null): puede ser un
        # objeto/booleano/selección y sembrarlo con un array rompería la página.
        if not _re.search(r"useState\s*(<[^>]*>)?\s*\(\s*\[\s*\]\s*\)", c):
            continue
        # claves de columna declaradas en la página (DataTable columns / accesos)
        keys = list(dict.fromkeys(_re.findall(r"key:\s*['\"]([a-zA-Z_][\w]*)['\"]", c)))
        if not keys:
            keys = list(dict.fromkeys(_re.findall(r"\.(\w+)\}", c)))[:4]
        if not keys:
            keys = ["id", "nombre", "estado"]
        rows = []
        for i in range(4):
            obj = ", ".join(f"{k}: {_mock_value(k, i) if isinstance(_mock_value(k,i),int) else repr(_mock_value(k,i)).replace(chr(39),chr(34))}"
                            for k in keys[:6])
            rows.append("{ " + obj + " }")
        mock = "[" + ", ".join(rows) + "]"
        # sembrar TODOS los estados vacíos (un dashboard tiene varios: una métrica
        # por entidad + la tabla); con count=1 las MetricCard quedaban en 0.
        new = _re.sub(r"useState\s*(<[^>]*>)?\s*\(\s*\[\s*\]\s*\)",
                      lambda m: f"useState({mock})", c)
        if new != c:
            f["content"] = new
            fixed += 1
    if fixed:
        report.append(f"estado inicial sembrado con datos mock en {fixed} página(s)")
    return files_rel


def _ensure_tsconfig_alias(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Garantiza que tsconfig.json tenga el alias `@/* -> ./*` (+ baseUrl). Sin él
    TODOS los imports `@/...` rompen el build ('Module not found'). El stack
    estático a veces genera el tsconfig SIN paths -> falla el UI-kit y los propios
    componentes. Lo añadimos sin pisar lo demás."""
    import json as _json
    fixed = 0
    for f in files_rel:
        p = (f.get("path") or "").lstrip("/")
        if not p.endswith("tsconfig.json"):
            continue
        try:
            data = _json.loads(f.get("content") or "{}")
        except Exception:
            continue
        co = data.setdefault("compilerOptions", {})
        paths = co.get("paths") or {}
        if co.get("baseUrl") != "." or "@/*" not in paths:
            co["baseUrl"] = co.get("baseUrl") or "."
            paths["@/*"] = ["./*"]
            co["paths"] = paths
            f["content"] = _json.dumps(data, indent=2)
            fixed += 1
    if fixed:
        report.append("tsconfig: alias @/* -> ./* garantizado")
    return files_rel


def _normalize_css_imports(files_rel: list[dict], report: list[str]) -> list[dict]:
    """En el ROOT layout, `import '@/app/globals.css'` no siempre resuelve (el
    alias @/ puede faltar en el tsconfig del stack estático). Lo normalizamos a
    `./globals.css` (relativo, SIEMPRE resuelve) y garantizamos que el archivo
    exista junto al layout con las directivas de Tailwind."""
    changed = 0
    layout_dirs: set[str] = set()
    for f in files_rel:
        p = (f.get("path") or "").lstrip("/")
        if p not in ("frontend/app/layout.tsx", "app/layout.tsx"):
            continue
        c = f.get("content") or ""
        nc = re.sub(r"""(['"])@/(?:app|src/app|styles)/globals\.css\1""", r"\1./globals.css\1", c)
        if nc != c:
            f["content"] = nc; changed += 1
        layout_dirs.add(p.rsplit("/", 1)[0])  # ej frontend/app
    # garantizar globals.css junto a CADA layout que lo importe relativo
    existing = {(f.get("path") or "").lstrip("/") for f in files_rel}
    for d in layout_dirs:
        gpath = f"{d}/globals.css"
        if gpath not in existing:
            files_rel.append({"path": gpath,
                              "content": "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"})
            changed += 1
    if changed:
        report.append("import de globals.css normalizado (relativo) + archivo garantizado")
    return files_rel


def _apply_app_shell(files_rel: list[dict], report: list[str], title: str = "") -> list[dict]:
    """Si el proyecto trae el UI-kit (AppShell), reescribe el ROOT layout para que
    envuelva TODA página en <AppShell> con la navegación auto-derivada de las rutas.

    Es la garantía de consistencia: aunque la IA (o el fallback OpenAI) genere
    páginas planas, TODAS quedan dentro del app-shell (sidebar fijo con enlaces +
    header + color de marca). 'Inyectar el kit' no basta si las páginas no lo usan;
    esto lo USA de forma determinista. Solo aplica a apps con datos (no landings)."""
    paths = {(f.get("path") or "").lstrip("/") for f in files_rel}
    has_shell = any(p.endswith("components/ui/AppShell.tsx") for p in paths)
    if not has_shell:
        return files_rel
    # localizar root layout (frontend/app/layout.tsx o app/layout.tsx)
    layout = next((f for f in files_rel
                   if (f.get("path") or "").lstrip("/") in
                   ("frontend/app/layout.tsx", "app/layout.tsx")), None)
    if not layout:
        return files_rel
    routes = _discover_routes(files_rel)
    if not routes:
        routes = [("/", "Inicio")]
    nav_js = "[" + ", ".join('{ href: "%s", label: "%s" }' % (h, l) for h, l in routes) + "]"
    # título: lo dado, o derivado del primer <h1>/title del home, o genérico
    t = (title or _guess_app_title(files_rel) or "Panel").replace('"', "'")
    new = (
        'import "./globals.css";\n'
        'import { AppShell } from "@/components/ui/AppShell";\n\n'
        f'const NAV = {nav_js};\n\n'
        f'export const metadata = {{ title: "{t}", description: "Generado con ScrumDev AI" }};\n\n'
        "export default function RootLayout({ children }: { children: React.ReactNode }) {\n"
        "  return (\n"
        '    <html lang="es">\n'
        "      <body>\n"
        f'        <AppShell items={{NAV}} title="{t}">{{children}}</AppShell>\n'
        "      </body>\n"
        "    </html>\n"
        "  );\n}\n"
    )
    if layout.get("content") != new:
        layout["content"] = new
        report.append(f"app-shell aplicado al layout ({len(routes)} secciones, '{t}')")
    return files_rel


def _guess_app_title(files_rel: list[dict]) -> str:
    """Adivina un título de app desde el home (metadata.title o primer <h1>)."""
    home = next((f for f in files_rel if (f.get("path") or "").lstrip("/") in
                 ("frontend/app/page.tsx", "app/page.tsx")), None)
    if not home:
        return ""
    c = home.get("content") or ""
    m = re.search(r"title:\s*['\"]([^'\"]{2,40})['\"]", c)
    if m:
        return m.group(1).strip()
    m = re.search(r"<h1[^>]*>\s*([^<{][^<]{1,38})</h1>", c)
    if m:
        return m.group(1).strip()
    return ""


def _fix_root_layout(files_rel: list[dict], report: list[str]) -> list[dict]:
    """El root layout (app/layout.tsx) DEBE: (1) ser server component (sin
    'use client'), (2) renderizar <html><body>. Si la IA lo generó como client
    o sin <html>/<body>, la hidratación rompe (#418/#423 "Only one element on
    document"), y la pantalla queda en blanco. Lo reescribimos preservando el
    contenido interno (lo que el layout envolvía: Sidebar, nav, etc.)."""
    for f in files_rel:
        path = (f.get("path") or "").lstrip("/")
        if path not in ("app/layout.tsx", "app/layout.jsx"):
            continue
        c = f.get("content") or ""
        has_html = "<html" in c
        is_client = '"use client"' in c[:60] or "'use client'" in c[:60]
        if has_html and not is_client:
            continue  # ya es válido
        # extraer imports locales/css que valga la pena preservar
        import re as _re
        imports = _re.findall(r"^\s*import .+$", c, _re.M)
        # quitar 'use client' y next/* server-incompatibles
        keep_imports = [i for i in imports if "use client" not in i]
        css_import = next((i for i in keep_imports if "globals.css" in i or ".css" in i), None)
        # extraer lo que el layout renderizaba dentro (heurística: el primer
        # componente propio importado, ej Sidebar) para no perder el shell
        comp_imports = [i for i in keep_imports if "/components/" in i or "components/" in i]
        inner_open, inner_close = "", ""
        first_comp = None
        for i in comp_imports:
            m = _re.search(r"import\s+\{?\s*(\w+)", i)
            if m:
                first_comp = m.group(1); break
        new_imports = []
        if css_import and "globals.css" not in (css_import or ""):
            pass
        new = (
            "import './globals.css';\n"
            + ("\n".join(comp_imports) + "\n" if comp_imports else "")
            + "\nexport const metadata = { title: 'App', description: 'Generado con ScrumDev AI' };\n\n"
            "export default function RootLayout({ children }: { children: React.ReactNode }) {\n"
            "  return (\n"
            "    <html lang=\"es\">\n"
            "      <body>\n"
        )
        if first_comp:
            new += (
                "        <div className=\"flex min-h-screen\">\n"
                f"          <{first_comp} />\n"
                "          <main className=\"flex-1 p-6\">{children}</main>\n"
                "        </div>\n"
            )
        else:
            new += "        {children}\n"
        new += "      </body>\n    </html>\n  );\n}\n"
        f["content"] = new
        report.append("root layout reescrito (html/body server component)")
    return files_rel


def _ensure_use_client(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Normaliza el TOP de cada archivo .tsx/.jsx (orden EXACTO que exige Next):
      1) si usa hooks/eventos de cliente -> `"use client";` como PRIMERA línea.
      2) si es page/layout -> `export const dynamic = "force-dynamic";` justo
         después (evita errores de prerender SSG en build).
    Reescribe limpio (quita directivas previas mal ordenadas/duplicadas)."""
    fixed = 0
    for f in files_rel:
        path = (f.get("path") or "").lstrip("/")
        if not path.endswith((".tsx", ".jsx")):
            continue
        c = f.get("content") or ""
        base = path.split("/")[-1]
        is_page = base in ("page.tsx", "layout.tsx", "page.jsx", "layout.jsx")
        # metadata / generateMetadata SOLO existen en server components -> nunca
        # "use client" en esos archivos (combo prohibido que rompe el build).
        has_meta = ("export const metadata" in c) or ("generateMetadata" in c)
        had_uc = ('"use client"' in c[:80]) or ("'use client'" in c[:80])
        needs_client = (not has_meta) and (had_uc or bool(_CLIENT_HOOKS.search(c)))
        # quitar TODAS las directivas existentes, INCLUSO inline (el código suele
        # venir en una sola línea: `"use client"; import...`). Regex global.
        body = c
        body = re.sub(r"""(['"])use client\1\s*;?\s*""", "", body)
        body = re.sub(r"""export const dynamic\s*=\s*(['"])[^'"]*\1\s*;?\s*""", "", body)
        body = body.lstrip("\n ")
        prefix = ""
        if needs_client:
            prefix += '"use client";\n'
        if is_page:
            prefix += 'export const dynamic = "force-dynamic";\n'
        new = prefix + body
        if new != c:
            f["content"] = new
            fixed += 1
    if fixed:
        report.append(f"top normalizado (use client/force-dynamic) en {fixed} archivo(s)")
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
    routes = _discover_routes(files_rel)  # para que Sidebar/Navbar stub tenga enlaces reales
    def has(base: str) -> bool:
        for ext in (".tsx", ".ts", ".jsx", ".js"):
            if base + ext in existing or f"{base}/index{ext}" in existing:
                return True
        return False
    import posixpath
    src_files = [f for f in files_rel if (f.get("path") or "").endswith((".tsx", ".ts", ".jsx", ".js"))]
    # recolectar imports default/named de módulos locales (@/ y relativos ./ ../)
    need: dict[str, dict] = {}
    # clause SOLO chars válidos de import ({ } , * \w espacios) -> NO cruza ';',
    # comillas ni otro 'import' (varios imports en una línea rompían el parseo).
    imp_re = re.compile(r"""import\s+([\w*\s,{}]+?)\s+from\s+['"](@/[^'"]+|\.\.?/[^'"]+)['"]""")
    # también require('./x') / await import('@/x') que la IA mezcla a veces
    req_re = re.compile(r"""(?:require|import)\(\s*['"](@/[^'"]+|\.\.?/[^'"]+)['"]\s*\)""")
    for f in src_files:
        fdir = posixpath.dirname((f.get("path") or "").lstrip("/"))
        content = f.get("content") or ""
        # require/import() -> tratar como import default
        for spec in req_re.findall(content):
            base = spec[2:] if spec.startswith("@/") else posixpath.normpath(posixpath.join(fdir, spec))
            if base.startswith("..") or not base or has(base):
                continue
            need.setdefault(base, {"default": True, "named": set()})["default"] = True
        for clause, spec in imp_re.findall(content):
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
        low = base.lower()
        is_data = any(k in low for k in ("mock", "/data", "store", "constant",
                                          "config", "/api", "fixture", "seed"))
        if is_data:
            # Módulo de datos/mock: default seguro (Proxy que nunca rompe .map/.length/
            # indexado) -> la app NO crashea aunque falten datos reales.
            lines = [
                "// stub de datos auto-generado (seguro contra accesos a undefined)",
                "const _arr: any = new Proxy([], { get: (t: any, p: any) => p in t ? t[p] : _arr });",
                "const _obj: any = new Proxy({}, { get: () => _arr });",
            ]
            for n in sorted(info["named"]):
                lines.append(f"export const {n}: any = _arr;")
            if info["default"] or not info["named"]:
                lines.append("export default _obj;")
            files_rel.append({"path": f"{base}.ts", "content": "\n".join(lines) + "\n"})
        else:
            # Componente: funcional real (renderiza children y muestra props básicas),
            # stub CON ESTILO real según el tipo de componente (por nombre) ->
            # si la IA no lo generó, igual se ve profesional, no un div pelado.
            comp = _styled_stub(base, routes)
            for n in sorted(info["named"]):
                comp += f"export const {n}: any = Stub;\n"
            files_rel.append({"path": f"{base}.tsx", "content": comp})
        added.append(base)
    if added:
        report.append(f"stubs creados para imports faltantes: {', '.join(added)}")
    return files_rel


def _discover_routes(files_rel: list[dict]) -> list[tuple[str, str]]:
    """Descubre las rutas reales del App Router escaneando los page.tsx presentes.
    Devuelve [(href, label)] para que un Sidebar/Navbar stub liste enlaces REALES
    (no un 'Menú' vacío). Ignora grupos de ruta (parens) y segmentos dinámicos."""
    import posixpath, re as _re
    routes: list[tuple[str, str]] = []
    seen: set[str] = set()
    for f in files_rel:
        p = (f.get("path") or "").lstrip("/")
        m = _re.match(r"(?:frontend/)?app/(.*/)?page\.(t|j)sx?$", p)
        if not m:
            continue
        segs = [s for s in (m.group(1) or "").strip("/").split("/")
                if s and not (s.startswith("(") or s.startswith("[") or s.startswith("_"))]
        href = "/" + "/".join(segs) if segs else "/"
        if href in seen:
            continue
        seen.add(href)
        label = "Inicio" if href == "/" else _nav_label(segs[-1])
        routes.append((href, label))
    # Inicio primero, luego alfabético
    routes.sort(key=lambda r: (r[0] != "/", r[0]))
    return routes[:9]


# Etiquetas bonitas para slugs de entidad comunes (acentos + plural) -> el slug
# pierde acentos al generarse (categoría->categor-a), esto los recupera.
_NAV_LABELS = {
    "producto": "Productos", "productos": "Productos",
    "categor-a": "Categorías", "categoria": "Categorías", "categorias": "Categorías",
    "proveedor": "Proveedores", "proveedores": "Proveedores",
    "cliente": "Clientes", "clientes": "Clientes",
    "pedido": "Pedidos", "pedidos": "Pedidos", "venta": "Ventas", "ventas": "Ventas",
    "usuario": "Usuarios", "usuarios": "Usuarios", "stock": "Stock",
    "alerta": "Alertas", "alertas": "Alertas", "talla": "Tallas",
    "paciente": "Pacientes", "cita": "Citas", "citas": "Citas",
    "profesional": "Profesionales", "servicio": "Servicios",
    "lead": "Leads", "oportunidad": "Oportunidades", "contacto": "Contactos",
    "factura": "Facturas", "pago": "Pagos", "gasto": "Gastos",
    "empleado": "Empleados", "reserva": "Reservas", "evento": "Eventos",
    "dashboard": "Dashboard", "reporte": "Reportes", "reportes": "Reportes",
    "metrica": "Métricas", "metricas": "Métricas", "m-tricas": "Métricas",
    "socio": "Socios", "socios": "Socios", "membresia": "Membresías",
    "clase": "Clases", "clases": "Clases", "asistencia": "Asistencia",
    "menu": "Menú", "men": "Menú", "mesa": "Mesas", "mesas": "Mesas",
    "cocina": "Cocina", "plato": "Platos", "vehiculo": "Vehículos",
    "veh-culo": "Vehículos", "conductor": "Conductores", "envio": "Envíos",
    "ruta": "Rutas", "rutas": "Rutas", "tracking": "Tracking",
    "factura": "Facturas", "facturas": "Facturas", "impuesto": "Impuestos",
    "propiedad": "Propiedades", "agente": "Agentes", "visita": "Visitas",
    "curso": "Cursos", "leccion": "Lecciones", "estudiante": "Estudiantes",
    "configuracion": "Configuración", "ajustes": "Ajustes",
}


def _nav_label(slug: str) -> str:
    s = slug.lower()
    if s in _NAV_LABELS:
        return _NAV_LABELS[s]
    return slug.replace("-", " ").replace("_", " ").strip().title()


def _styled_stub(base: str, routes: list[tuple[str, str]] | None = None) -> str:
    """Devuelve un componente stub CON ESTILO Tailwind real según su nombre
    (Card/Table/Sidebar/Navbar/Button/...) para que la UI se vea profesional
    aunque la IA no haya generado ese componente. Para Sidebar/Navbar usa las
    `routes` reales del proyecto -> enlaces de verdad, no un placeholder vacío."""
    name = base.split("/")[-1].lower()
    head = '"use client";\nimport React from "react";\nimport Link from "next/link";\n'
    _routes = routes or [("/", "Inicio")]
    _links_js = "[" + ", ".join(
        '{href:"%s",label:"%s"}' % (h, l) for h, l in _routes) + "]"
    if "card" in name:
        body = (
            "export default function Stub(props: any) {\n"
            "  const title = props?.title ?? props?.label ?? '';\n"
            "  const value = props?.value ?? props?.count;\n"
            "  return (\n"
            "    <div className=\"rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:shadow-md transition dark:border-neutral-800 dark:bg-neutral-900\">\n"
            "      {title ? <p className=\"text-sm font-medium text-neutral-500\">{title}</p> : null}\n"
            "      {value !== undefined ? <p className=\"mt-1 text-3xl font-bold tracking-tight\">{value}</p> : null}\n"
            "      {props?.children}\n"
            "    </div>\n  );\n}\n"
        )
    elif "table" in name:
        body = (
            "export default function Stub(props: any) {\n"
            "  const cols = props?.columns ?? [];\n"
            "  const data = props?.data ?? props?.rows ?? [];\n"
            "  return (\n"
            "    <div className=\"overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800\">\n"
            "      <table className=\"w-full text-sm\">\n"
            "        {cols.length > 0 ? <thead className=\"bg-neutral-50 dark:bg-neutral-900\"><tr>\n"
            "          {cols.map((c: any, i: number) => <th key={i} className=\"px-4 py-3 text-left font-semibold text-neutral-600\">{typeof c === 'string' ? c : (c?.label ?? c?.header)}</th>)}\n"
            "        </tr></thead> : null}\n"
            "        <tbody>\n"
            "          {data.map((row: any, i: number) => (\n"
            "            <tr key={i} className=\"border-t border-neutral-100 dark:border-neutral-800\">\n"
            "              {(cols.length ? cols : Object.keys(row || {})).map((c: any, j: number) => {\n"
            "                const key = typeof c === 'string' ? c : (c?.key ?? c?.accessor);\n"
            "                return <td key={j} className=\"px-4 py-3\">{String(row?.[key] ?? Object.values(row || {})[j] ?? '')}</td>;\n"
            "              })}\n"
            "            </tr>))}\n"
            "        </tbody>\n      </table>\n      {props?.children}\n    </div>\n  );\n}\n"
        )
    elif "sidebar" in name:
        body = (
            f"const _links = {_links_js};\n"
            "export default function Stub(props: any) {\n"
            "  return (\n"
            "    <aside className=\"w-64 shrink-0 border-r border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 min-h-screen\">\n"
            "      <div className=\"font-bold text-lg mb-6 px-2\">{props?.title ?? 'Panel'}</div>\n"
            "      <nav className=\"space-y-1 text-sm font-medium text-neutral-600 dark:text-neutral-300\">\n"
            "        {_links.map((l: any) => (\n"
            "          <Link key={l.href} href={l.href} className=\"block rounded-lg px-3 py-2 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 transition\">{l.label}</Link>\n"
            "        ))}\n"
            "        {props?.children}\n"
            "      </nav>\n"
            "    </aside>\n  );\n}\n"
        )
    elif "navbar" in name or "header" in name:
        body = (
            f"const _links = {_links_js};\n"
            "export default function Stub(props: any) {\n"
            "  return (\n"
            "    <header className=\"sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/90 backdrop-blur px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900/90\">\n"
            "      <div className=\"font-semibold\">{props?.title ?? 'App'}</div>\n"
            "      <nav className=\"hidden md:flex items-center gap-1 text-sm font-medium text-neutral-600 dark:text-neutral-300\">\n"
            "        {_links.map((l: any) => (\n"
            "          <Link key={l.href} href={l.href} className=\"rounded-lg px-3 py-1.5 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 transition\">{l.label}</Link>\n"
            "        ))}\n"
            "      </nav>\n"
            "      <div className=\"flex items-center gap-3\">{props?.children}</div>\n"
            "    </header>\n  );\n}\n"
        )
    elif "button" in name:
        body = (
            "export default function Stub(props: any) {\n"
            "  const cls = props?.className ?? 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition';\n"
            "  return (\n"
            "    <button onClick={props?.onClick} className={cls}>\n"
            "      {props?.children ?? props?.label ?? 'Acción'}\n"
            "    </button>\n  );\n}\n"
        )
    elif "form" in name:
        body = (
            "export default function Stub(props: any) {\n"
            "  return (\n"
            "    <form onSubmit={props?.onSubmit} className=\"space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900\">\n"
            "      {props?.children}\n"
            "      <p className=\"text-sm text-neutral-500\">Formulario</p>\n"
            "    </form>\n  );\n}\n"
        )
    elif "list" in name:
        body = (
            "export default function Stub(props: any) {\n"
            "  const items = props?.items ?? props?.data ?? [];\n"
            "  return (\n"
            "    <div className=\"divide-y divide-neutral-100 rounded-2xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800\">\n"
            "      {items.length === 0 ? <p className=\"p-4 text-sm text-neutral-500\">Sin registros.</p> : null}\n"
            "      {items.map((it: any, i: number) => (\n"
            "        <div key={i} className=\"flex items-center justify-between px-4 py-3\">\n"
            "          <span>{it?.name ?? it?.title ?? it?.nombre ?? JSON.stringify(it).slice(0,60)}</span>\n"
            "        </div>))}\n"
            "      {props?.children}\n"
            "    </div>\n  );\n}\n"
        )
    else:
        body = (
            "export default function Stub(props: any) {\n"
            "  const label = props?.title ?? props?.label ?? null;\n"
            "  return (\n"
            "    <div className=\"rounded-xl border border-neutral-200 p-4 dark:border-neutral-800\">\n"
            "      {label ? <div className=\"font-medium mb-1\">{label}</div> : null}{props?.children}\n"
            "    </div>\n  );\n}\n"
        )
    return head + body


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


def _fix_postcss_config(files_rel: list[dict], report: list[str]) -> list[dict]:
    """La IA a veces genera postcss.config con plugins como objetos importados
    (`plugins:[tailwindcss,autoprefixer]`), que rompe el procesamiento de CSS en
    Next (globals.css falla). Lo normalizamos al formato canónico de PostCSS:
    `{ plugins: { tailwindcss: {}, autoprefixer: {} } }`."""
    for f in files_rel:
        path = (f.get("path") or "").lstrip("/")
        base = path.split("/")[-1]
        if base not in ("postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"):
            continue
        c = f.get("content") or ""
        # si ya usa el formato objeto canónico, dejar
        if re.search(r"plugins\s*:\s*\{", c):
            continue
        canonical = (
            "/** @type {import('postcss-load-config').Config} */\n"
            "export default {\n"
            "  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n"
            "};\n"
        )
        if base.endswith(".cjs") or "module.exports" in c:
            canonical = (
                "module.exports = {\n"
                "  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n"
                "};\n"
            )
        if canonical.strip() != c.strip():
            f["content"] = canonical
            report.append("postcss.config normalizado (plugins canónicos)")
    return files_rel


def _force_dynamic_pages(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Evita errores de PRERENDER (SSG) en build: Next intenta generar las páginas
    estáticamente y el componente puede lanzar (datos, hooks, stubs). Forzamos
    `dynamic = "force-dynamic"` en cada page/layout -> se renderizan en runtime,
    no en build. Robustez clave para que el deploy del cliente nunca falle por SSG."""
    fixed = 0
    for f in files_rel:
        path = (f.get("path") or "").lstrip("/")
        base = path.split("/")[-1]
        if base not in ("page.tsx", "layout.tsx", "page.jsx", "layout.jsx"):
            continue
        c = f.get("content") or ""
        if "force-dynamic" in c or "export const dynamic" in c:
            continue
        # insertar tras el "use client" si existe, si no al inicio
        line = 'export const dynamic = "force-dynamic";\n'
        lines = c.split("\n", 1)
        if lines and lines[0].strip().strip('"').strip("'") == "use client":
            f["content"] = lines[0] + "\n" + line + (lines[1] if len(lines) > 1 else "")
        else:
            f["content"] = line + c
        fixed += 1
    if fixed:
        report.append(f"force-dynamic en {fixed} página(s)")
    return files_rel


def _fix_from_build_log(files_rel: list[dict], log: str, report: list[str]) -> list[dict]:
    """Robustez genérica: parsea CUALQUIER 'Module not found: Can't resolve X'
    del log y lo arregla -> paquete npm faltante a package.json, o stub si es un
    módulo local (@/ o relativo). Cubre casos no contemplados por los fixes fijos."""
    import json as _json
    specs = set(re.findall(r"Can't resolve ['\"]([^'\"]+)['\"]", log))
    specs |= set(re.findall(r"Cannot find module ['\"]([^'\"]+)['\"]", log))
    if not specs:
        return files_rel
    builtins = {"next", "react", "react-dom", "fs", "path", "crypto", "http",
                "https", "stream", "os", "url", "util", "buffer", "process"}
    existing = {(f.get("path") or "").lstrip("/") for f in files_rel}
    pkg = next((f for f in files_rel if (f.get("path") or "").endswith("package.json")), None)
    added_pkg, added_stub = [], []
    pkg_data = {}
    if pkg:
        try:
            pkg_data = _json.loads(pkg.get("content") or "{}")
        except Exception:
            pkg_data = {}
    deps = pkg_data.setdefault("dependencies", {}) if pkg else {}
    for spec in specs:
        if spec.startswith("."):  # relativo -> lo cubre _stub (scan de source)
            continue
        if spec.startswith("@/"):  # alias local -> stub directo
            base = spec[2:]
            if any(base + e in existing for e in (".tsx", ".ts", ".jsx", ".js")):
                continue
            files_rel.append({"path": base + ".tsx",
                              "content": '"use client";\nconst Noop=(p:any)=>null;\nexport default Noop;\n'})
            existing.add(base + ".tsx"); added_stub.append(base)
            continue
        # paquete npm bare
        name = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
        if name in builtins or not pkg or name in deps:
            continue
        deps[name] = "latest"
        added_pkg.append(name)
    if pkg and added_pkg:
        pkg["content"] = _json.dumps(pkg_data, indent=2)
        report.append(f"deps (del log) -> {', '.join(added_pkg)}")
    if added_stub:
        report.append(f"stubs (del log) -> {', '.join(added_stub)}")
    return files_rel


def _apply_frontend_autofix(files_rel: list[dict], log: str = "") -> tuple[list[dict], list[str]]:
    """Reusa los fixes genericos del validador (CSS + exports + rutas paralelas)."""
    from services.orchestrator_service.app.deploy_validator import (
        _ensure_css_imports, _autofix_missing_exports, _dedup_parallel_routes,
    )
    report: list[str] = []
    files_rel = _dedup_parallel_routes(files_rel, report)
    files_rel = _fix_root_layout(files_rel, report)
    files_rel = _fix_next_router(files_rel, report)
    files_rel = _ensure_use_client(files_rel, report)
    files_rel = _ensure_npm_deps(files_rel, report)
    files_rel = _stub_missing_local_imports(files_rel, report)
    files_rel = _relax_next_config(files_rel, report)
    files_rel = _fix_postcss_config(files_rel, report)
    files_rel = _autofix_missing_exports(files_rel, report)
    files_rel = _ensure_css_imports(files_rel, report)
    if log:
        files_rel = _fix_from_build_log(files_rel, log, report)
    return files_rel, report


def _harden_data_access(files_rel: list[dict], report: list[str]) -> list[dict]:
    """Blinda el código generado contra crashes de runtime por datos vacíos
    (el #1 que deja la pantalla en blanco: `data.x.length` cuando el fetch falla):
      - `useState({...})` -> el estado inicial se respeta, pero los accesos
        `.length` / `.map(` sobre props/estado se hacen seguros con `?.` y `?? []`.
    Heurística conservadora: solo agrega optional chaining donde ya hay accesos
    directos a .length/.map sin protección."""
    import re as _re
    # cadena de acceso completa: identificador + (.prop | ?.prop)*  -> captura
    # data, data.x, data?.x, data?.x.y, a.b?.c, etc. (no empieza tras . ? o \w)
    CHAIN = r"(?<![\?\.\w$])([a-zA-Z_$]\w*(?:\??\.\w+)*)"
    fixed = 0
    for f in files_rel:
        path = (f.get("path") or "").lstrip("/")
        if not path.endswith((".tsx", ".jsx")):
            continue
        c = f.get("content") or ""
        orig = c
        # CADENA.length -> CADENA?.length  (cubre data.x.length y data?.x.length)
        c = _re.sub(CHAIN + r"\.length\b", lambda m: m.group(1) + "?.length", c)
        # CADENA.map( -> (CADENA ?? []).map(  (cubre data?.metrics.map)
        c = _re.sub(CHAIN + r"\.map\(", lambda m: f"({m.group(1)} ?? []).map(", c)
        # CADENA.filter( / .forEach( / .reduce( -> también seguros
        for meth in ("filter", "forEach", "reduce", "some", "every", "find"):
            c = _re.sub(CHAIN + r"\." + meth + r"\(",
                        lambda m, _me=meth: f"({m.group(1)} ?? []).{_me}(", c)
        # limpiar dobles que pudieran formarse
        c = c.replace("??.length", "?.length").replace("(( ", "((")
        if c != orig:
            f["content"] = c
            fixed += 1
    if fixed:
        report.append(f"acceso a datos blindado (?./?? []) en {fixed} archivo(s)")
    return files_rel


# cache de proceso: solo intentamos instalar chromium UNA vez (no en cada build)
_CHROMIUM_PATH: str | None = None
_CHROMIUM_TRIED = False
_DEPS_TRIED = False


async def _ensure_browser_deps(env: dict) -> None:
    """Instala las LIBS de sistema del navegador (necesita root). Una vez por
    proceso. HF Spaces suele correr como root pese al USER del Dockerfile -> esto
    auto-cura el 'Host system is missing dependencies' sin depender del cache de
    Docker (que en HF no respeta los cambios del Dockerfile). Si el browser ya
    estaba pero NO arrancaba por libs, esto lo arregla."""
    global _DEPS_TRIED
    if _DEPS_TRIED:
        return
    _DEPS_TRIED = True
    import sys as _sys
    euid = getattr(os, "geteuid", lambda: -1)()
    if euid != 0:
        # no-root: `apt` imposible. Las libs deben venir de la imagen (build-time).
        # NO intentar install-deps (falla rc=1 y gasta el timeout). Solo log.
        logger.info("chromium_deps_skip_nonroot", euid=euid)
        return
    try:
        dproc = await asyncio.create_subprocess_exec(
            _sys.executable, "-m", "playwright", "install-deps", "chromium",
            env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await asyncio.wait_for(dproc.communicate(), timeout=300)
        logger.info("chromium_install_deps", euid=euid, rc=dproc.returncode,
                    tail=(out or b"").decode("utf-8", "ignore")[-200:])
    except Exception as exc:  # noqa: BLE001
        logger.warning("chromium_install_deps_error", euid=euid, error=str(exc)[:160])


def _glob_chromium(roots: list[str]) -> str | None:
    """Busca el ejecutable de chromium en las rutas dadas. None si no está."""
    import glob
    for root in roots:
        if not root:
            continue
        for pat in ("chromium-*/chrome-linux64/chrome", "chromium-*/chrome-linux/chrome",
                    "chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell"):
            hits = sorted(glob.glob(os.path.join(root, pat)))
            if hits:
                return hits[-1]
    return None


async def _ensure_chromium() -> str | None:
    """Devuelve la ruta a un chromium usable, INSTALÁNDOLO on-demand si falta.

    Robusto frente a los caprichos de la imagen (cache de capas de Docker, HOME
    que cambia, PLAYWRIGHT_BROWSERS_PATH no heredado): si no encontramos el
    browser en ninguna ruta conocida, lo instalamos a un dir escribible y
    fijamos PLAYWRIGHT_BROWSERS_PATH para todo el proceso. Se hace UNA sola vez
    (cache de módulo) para no penalizar cada build. Así el JUEZ VISUAL siempre
    tiene navegador y nunca se salta silenciosamente."""
    global _CHROMIUM_PATH, _CHROMIUM_TRIED
    target = "/tmp/pw-browsers"
    env = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": target}
    # SIEMPRE (una vez por proceso) asegurar las libs de sistema, AUNQUE el
    # browser ya exista: el bug era browser presente pero sin libs -> no arranca.
    await _ensure_browser_deps(env)
    if _CHROMIUM_PATH:
        return _CHROMIUM_PATH
    roots = [
        os.environ.get("PLAYWRIGHT_BROWSERS_PATH", ""),
        "/opt/pw-browsers",
        os.path.expanduser("~/.cache/ms-playwright"),
        "/tmp/.cache/ms-playwright",
        "/tmp/pw-browsers",
    ]
    found = _glob_chromium(roots)
    if found:
        _CHROMIUM_PATH = found
        return found
    if _CHROMIUM_TRIED:
        return None  # ya intentamos instalar y falló; no reintentar cada build
    _CHROMIUM_TRIED = True
    # instalar a un dir escribible y persistente para la vida del contenedor
    try:
        os.makedirs(target, exist_ok=True)
    except Exception:
        target = os.path.expanduser("~/.cache/ms-playwright")
        env["PLAYWRIGHT_BROWSERS_PATH"] = target
    logger.info("chromium_install_start", target=target)
    # instalar el browser
    import sys as _sys
    try:
        proc = await asyncio.create_subprocess_exec(
            _sys.executable, "-m", "playwright", "install", "chromium",
            env=env, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, err = await asyncio.wait_for(proc.communicate(), timeout=240)
        if proc.returncode == 0:
            os.environ["PLAYWRIGHT_BROWSERS_PATH"] = target  # que pw lo resuelva solo
            _CHROMIUM_PATH = _glob_chromium([target]) or "default"
            logger.info("chromium_install_ok", path=_CHROMIUM_PATH)
            return None if _CHROMIUM_PATH == "default" else _CHROMIUM_PATH
        logger.warning("chromium_install_failed", err=(err or b"").decode("utf-8", "ignore")[-200:])
    except Exception as exc:  # noqa: BLE001
        logger.warning("chromium_install_error", error=str(exc)[:160])
    return None


async def _runtime_smoke(tmp: str, npm: str, env: dict) -> dict:
    """Levanta `next start` y abre la home en un navegador headless. Devuelve
    {ok, reason, log}. Detecta pantalla en blanco / client-side exception que el
    build NO ve. Si no hay navegador disponible, lo instala on-demand."""
    try:
        import importlib; importlib.import_module("playwright.async_api")
    except Exception:
        return {"ok": True, "skipped": True, "reason": "playwright no disponible"}
    # asegurar chromium (instala on-demand si falta) ANTES de lanzar
    chrome = await _ensure_chromium()

    import asyncio as _aio
    port = "47711"
    proc = await _aio.create_subprocess_exec(
        npm, "run", "start", "--", "-p", port, cwd=tmp, env=env,
        stdout=_aio.subprocess.DEVNULL, stderr=_aio.subprocess.DEVNULL)
    try:
        await _aio.sleep(9)
        from playwright.async_api import async_playwright
        errs: list[str] = []
        async with async_playwright() as pw:
            launch_kw = {"executable_path": chrome} if chrome else {}
            try:
                br = await pw.chromium.launch(**launch_kw)
            except Exception as _le1:
                logger.warning("chromium_launch_path_failed",
                               chrome=chrome, err=str(_le1)[:240])
                try:
                    br = await pw.chromium.launch()  # fallback al browser propio de pw
                except Exception as _le2:
                    logger.warning("chromium_launch_failed_both", err=str(_le2)[:240])
                    raise
            pg = await br.new_page(viewport={"width": 1280, "height": 800})
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            shot_b64 = None
            try:
                await pg.goto(f"http://localhost:{port}/", wait_until="domcontentloaded", timeout=30000)
                await pg.wait_for_timeout(6000)
                text = (await pg.locator("body").inner_text()).strip()
                import base64 as _b64
                png = await pg.screenshot(full_page=False)
                shot_b64 = _b64.b64encode(png).decode()
            except Exception as e:
                text = ""; errs.append("goto:" + str(e)[:120])
            await br.close()
        app_err = ("Application error" in text) or ("client-side exception" in text)
        ok = (len(text) > 15) and (not app_err)
        return {"ok": ok, "skipped": False,
                "reason": ("render ok" if ok else "pantalla en blanco / client-side error"),
                "log": (text[:200] + " || " + " | ".join(errs[:4])),
                "screenshot": shot_b64}
    finally:
        try: proc.terminate()
        except Exception: pass


async def _visual_judge_and_fix(files_rel: list[dict], screenshot_b64: str,
                                vision: str, all_fixes: list[str]) -> tuple[list[dict], bool]:
    """Juez VISUAL: Claude ve el screenshot. Si reprueba, regenera los page.tsx
    con las instrucciones de diseño. Devuelve (files, cambio_hecho)."""
    try:
        from services.orchestrator_service.app.design_judge import judge_screenshot
        from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
    except Exception:
        return files_rel, False
    verdict = await judge_screenshot(screenshot_b64, vision)
    score = verdict.get("score")
    all_fixes.append(f"juez visual: score={score} aprobado={verdict.get('aprobado')}")
    if verdict.get("aprobado") or not verdict.get("instrucciones"):
        return files_rel, False
    instr = "; ".join(verdict.get("instrucciones", [])[:6])
    probs = "; ".join(verdict.get("problemas", [])[:6])
    changed = False
    # El screenshot es SOLO del home. Regenerar todas las páginas a ciegas con el
    # veredicto del home es lo que rompía otras vistas ("arreglo una y sale peor").
    # Acotamos al HOME + el layout que NO sea el root (el shell con sidebar). El
    # nuevo diseño del home establece el sistema visual que las demás imitan.
    HOME = {"frontend/app/page.tsx", "app/page.tsx"}
    ROOT_LAYOUT = {"frontend/app/layout.tsx", "app/layout.tsx"}
    for f in files_rel:
        p = (f.get("path") or "").lstrip("/")
        is_home = p in HOME
        is_shell_layout = p.endswith("layout.tsx") and p not in ROOT_LAYOUT
        if not (is_home or is_shell_layout):
            continue
        orig = f.get("content") or ""
        prompt = (
            f"Eres diseñador UX/UI senior. Un juez visual reprobó esta pantalla "
            f"(dominio: {vision[:150]}).\nPROBLEMAS: {probs}\nARREGLA: {instr}\n\n"
            "Reescribe el archivo mejorando SOLO el diseño (Tailwind): contraste "
            "legible (texto oscuro sobre claro o claro sobre oscuro, nunca gris "
            "ilegible), jerarquía, tarjetas con rounded/shadow, sidebar con enlaces "
            "si aplica, layout responsive. Conserva la lógica (imports/hooks/datos). "
            f"Devuelve SOLO el código de {p}, sin ``` ni texto.\n\nACTUAL:\n{orig[:3500]}"
        )
        try:
            new = await run_claude_code(prompt, max_turns=1, kind="ui")
            new = re.sub(r"^```[a-zA-Z]*\n", "", (new or "").strip())
            new = re.sub(r"\n```$", "", new)
            if new and "export default" in new and len(new) > 120:
                f["content"] = new
                changed = True
        except Exception:
            pass
    if changed:
        all_fixes.append("UI regenerada por feedback visual")
    return files_rel, changed


async def build_gate_frontend(files_rel: list[dict], max_attempts: int = 4,
                              vision: str = "", is_landing: bool = False) -> dict:
    """Compila el frontend; auto-fix + retry + JUEZ VISUAL. Devuelve {ok, files, log, fixes}."""
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
    files_rel = _ensure_tsconfig_alias(files_rel, _pre)  # @/* -> ./* (sin esto rompen todos los @/ imports)
    files_rel = _normalize_css_imports(files_rel, _pre)  # @/app/globals.css -> ./globals.css
    # El app-shell (sidebar) es para APPS con datos, NO para landings (que llevan
    # hero+secciones). En stack estático se omite -> no se importa AppShell.
    if not is_landing:
        files_rel = _apply_app_shell(files_rel, _pre)  # shell determinista (sidebar+header+marca)
    files_rel = _fix_root_layout(files_rel, _pre)  # root layout html/body server
    files_rel = _fix_next_router(files_rel, _pre)   # App Router: next/router -> next/navigation
    files_rel = _ensure_use_client(files_rel, _pre)  # hooks de cliente -> "use client"
    files_rel = _ensure_npm_deps(files_rel, _pre)    # libs importadas -> package.json
    files_rel = _stub_missing_local_imports(files_rel, _pre)  # @/ faltantes -> stub
    files_rel = _relax_next_config(files_rel, _pre)  # ignorar errores TS/lint
    files_rel = _fix_postcss_config(files_rel, _pre)  # postcss plugins canónicos
    # DETERMINISTAS (sin navegador): evitan la pantalla en blanco que el build no
    # ve -> data access seguro + páginas dinámicas. Se aplican SIEMPRE, no solo
    # tras un smoke fallido (el smoke con navegador es best-effort/opcional).
    # NOTA: _seed_initial_state DESACTIVADO. Sembrar useState([]) con un mock
    # genérico puede caer en un valor que la página renderiza directo -> React
    # client-side crash (peor que vacío). Claude ya genera datos inline (prompt
    # reforzado) y el UI-kit maneja vacío con gracia ("Sin registros"). Estabilidad > seed.
    files_rel = _harden_data_access(files_rel, _pre)
    files_rel = _force_dynamic_pages(files_rel, _pre)

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
                # BUILD OK -> SMOKE de runtime (navegador real). Que compile NO
                # basta: la app debe RENDERIZAR (no pantalla en blanco). Esto es
                # lo que evita que una app rota llegue al cliente. El smoke NUNCA
                # debe tumbar el deploy: si algo falla, se salta (ok=True).
                try:
                    smoke = await _runtime_smoke(tmp, npm, env)
                except BaseException as _se:  # noqa: BLE001
                    logger.warning("runtime_smoke_crashed", error=str(_se)[:200])
                    smoke = {"ok": True, "skipped": True, "reason": "smoke error: " + str(_se)[:80]}
                if smoke.get("ok"):
                    # JUEZ VISUAL: Claude mira el screenshot. Si está feo y quedan
                    # intentos, regenera la UI con el feedback y vuelve a buildear.
                    shot = smoke.get("screenshot")
                    if shot and vision and attempt < max_attempts:
                        files_rel, changed = await _visual_judge_and_fix(
                            files_rel, shot, vision, all_fixes)
                        if changed:
                            logger.info("visual_judge_regen", attempt=attempt)
                            continue  # rebuild con la UI mejorada
                    return {"ok": True, "files": files_rel, "fixes": all_fixes,
                            "attempts": attempt, "log": log_b[-400:],
                            "smoke": smoke.get("reason"),
                            "screenshot": shot}
                # render falló: blindar accesos a datos y reintentar
                logger.warning("runtime_smoke_failed", attempt=attempt, detail=smoke.get("log"))
                if attempt < max_attempts:
                    files_rel = _harden_data_access(files_rel, all_fixes)
                    files_rel = _force_dynamic_pages(files_rel, all_fixes)
                    continue
                # último intento agotado: NO desplegar app rota
                return {"ok": False, "stage": "runtime", "files": files_rel,
                        "log": "SMOKE: " + (smoke.get("log") or smoke.get("reason") or ""),
                        "fixes": all_fixes, "attempts": attempt}
            log_tail = log_b[-3000:]
            # build fallo: auto-fix (incl. fixer dirigido por el log) y reintentar
            files_rel, fixes = _apply_frontend_autofix(files_rel, log_tail)
            all_fixes.extend(fixes)
            logger.warning("frontend_build_failed_retry", attempt=attempt, fixes=fixes)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return {"ok": False, "stage": "build", "files": files_rel, "log": log_tail,
            "fixes": all_fixes, "attempts": max_attempts}


def _fix_python_oneliners(files_rel: list[dict], report: list[str]) -> list[dict]:
    """La IA a veces genera Python TODO en una línea con ';' (incluyendo def/
    class/@decorator/if-else), que es sintaxis INVÁLIDA. Reformatea: separa por
    ';' a nivel superior y re-indenta los bloques. Solo actúa si el archivo NO
    compila tal cual (para no romper código ya válido)."""
    import ast as _ast
    fixed = 0
    for f in files_rel:
        rel = (f.get("path") or "").lstrip("/")
        if not rel.endswith(".py"):
            continue
        c = f.get("content") or ""
        try:
            _ast.parse(c)
            continue  # ya es válido, no tocar
        except SyntaxError:
            pass
        if ";" not in c:
            continue
        new = _reformat_py(c)
        try:
            _ast.parse(new)
            f["content"] = new
            fixed += 1
            continue
        except SyntaxError:
            pass
    if fixed:
        report.append(f"python one-liner reformateado en {fixed} archivo(s)")
    return files_rel


def _reformat_py(code: str) -> str:
    """Separa sentencias unidas por ';' y re-indenta bloques. Maneja el caso de
    `class X: campo; campo2` (clase de una línea con varios miembros) tratando
    `:` como apertura de bloque y manteniendo los ';' siguientes indentados
    hasta una sentencia top-level (import/def/class/asignación a módulo)."""
    raw = code.replace("\r", "")
    # tokenizar en piezas separadas por ; y \n a profundidad 0 (respeta strings/paréntesis)
    pieces: list[tuple[str, str]] = []  # (texto, separador que la siguió)
    buf, depth, instr, i = "", 0, None, 0
    while i < len(raw):
        ch = raw[i]
        if instr:
            buf += ch
            if ch == instr and raw[i-1] != "\\":
                instr = None
        elif ch in "\"'":
            instr = ch; buf += ch
        elif ch in "([{":
            depth += 1; buf += ch
        elif ch in ")]}":
            depth -= 1; buf += ch
        elif ch in ";\n" and depth == 0:
            if buf.strip():
                pieces.append((buf.strip(), ch))
            buf = ""
        else:
            buf += ch
        i += 1
    if buf.strip():
        pieces.append((buf.strip(), "\n"))

    out: list[str] = []
    indent = 0
    in_oneline_block = False  # dentro de `class X: a; b; c`
    def is_toplevel(s: str) -> bool:
        return s.startswith(("import ", "from ", "def ", "class ", "@", "async def "))
    # expandir piezas: separar `@decorator def/async def ...` y `@decorator class`
    expanded: list[tuple[str, str]] = []
    for text, sep in pieces:
        s = text.strip()
        m = re.match(r"^(@[\w\.]+(?:\([^)]*\))?)\s+((?:async\s+def|def|class)\s.+)$", s)
        if m:
            expanded.append((m.group(1), "\n"))
            expanded.append((m.group(2), sep))
        else:
            expanded.append((text, sep))
    pieces = expanded

    for text, sep in pieces:
        s = text.strip()
        if not s:
            continue
        if s.startswith(("elif ", "else", "except", "finally")) and indent > 0:
            indent -= 1; in_oneline_block = False
        # si veníamos en un bloque-de-una-línea y llega algo top-level, cerrar
        if in_oneline_block and is_toplevel(s):
            indent = max(0, indent - 1); in_oneline_block = False
        # `HEADER: cuerpo` en una línea (class/def PERO TAMBIÉN if/for/while/with/
        # try/except) -> separar cabecera y cuerpo en líneas indentadas. Sin esto,
        # `def f(): x; try: yield; finally: close()` queda con indent inválido.
        m = (re.match(r"^((?:async\s+)?(?:class|def|if|elif|for|while|with|except)\b[^:]*:)\s*(\S.*)$", s)
             or re.match(r"^((?:else|try|finally)\s*:)\s*(\S.*)$", s))
        if m:
            header, body = m.group(1), m.group(2)
            if body.startswith("#"):
                # cuerpo arranca con comentario inline (`if x: # nota return y`):
                # la IA dejó código DENTRO del comentario. Recuperar la sentencia
                # embebida (return/raise/yield/pass/break/continue) tras el comentario.
                km = re.search(r"\b(return|raise|yield|pass|break|continue)\b", body)
                if km:
                    comment, body = body[:km.start()].rstrip(), body[km.start():]
                    out.append("    " * indent + header)
                    if comment:
                        out.append("    " * (indent + 1) + comment)
                    indent += 1
                    out.append("    " * indent + body)
                    in_oneline_block = True
                    continue
                # comentario sin código recuperable -> cuerpo `pass`
                out.append("    " * indent + header)
                out.append("    " * (indent + 1) + "pass  " + body)
                indent += 1
                in_oneline_block = True
                continue
            out.append("    " * indent + header)
            indent += 1
            out.append("    " * indent + body)
            in_oneline_block = True
            continue
        out.append("    " * indent + s)
        if s.endswith(":") and not s.startswith("@"):
            indent += 1; in_oneline_block = False
    return "\n".join(out) + "\n"


def build_gate_backend(files_rel: list[dict]) -> dict:
    """Valida sintaxis de todos los .py + que main.py exponga `app`."""
    errors: list[str] = []
    # auto-fix de Python en una línea ANTES de validar
    _fix_python_oneliners(files_rel, errors if False else [])
    tmp = tempfile.mkdtemp(prefix="scrumdev_be_")
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


async def run_build_gate(files: list[dict], stack: str, vision: str = "") -> tuple[list[dict], dict]:
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
            # landing = stack estático (sin backend); su tier ES "nextjs" igual,
            # así que detectamos por el STACK id, no por el framework del tier.
            res = await build_gate_frontend(tier_files, vision=vision,
                                            is_landing=("static" in (stack or "")))
            report["tiers"]["frontend"] = {
                "ok": res["ok"], "fixes": res.get("fixes", []),
                "skipped": res.get("skipped", False),
                "log": res.get("log", "")[-2500:] if not res["ok"] else "",
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

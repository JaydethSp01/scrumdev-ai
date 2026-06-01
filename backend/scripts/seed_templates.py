"""Seed del repo de PLANTILLAS 1A.

Para cada plantilla del catálogo (o un subconjunto), usa el MISMO pipeline de
generación de la plataforma (que ya aplica el UI-kit + app-shell determinista),
despliega, toma un screenshot real de la app en vivo y guarda en el repo de
plantillas:

    templates/<id>/
        template.json     # metadata (del catálogo)
        preview.png       # screenshot real de la app desplegada
        files/<path>      # los archivos generados (para extraer y adaptar)

Uso (desde backend/, con el Space en vivo y chromium local para el screenshot):

    python scripts/seed_templates.py --ids retail-inventory-pro salud-citas
    python scripts/seed_templates.py --all
    python scripts/seed_templates.py --ids landing-startup --no-push   # sin subir

Requiere variables: SCRUMDEV_GIT_TOKEN (para crear/empujar el repo), credenciales
del Space (login adam). El screenshot usa playwright local (chromium).

NOTA: este script NO corre en el Space; se ejecuta localmente/CI para CURAR el
repo de plantillas. La plataforma luego solo LEE ese repo.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from shared.templates.catalog import CATALOG, get_template, TEMPLATES_REPO  # noqa: E402

BASE = os.environ.get("SCRUMDEV_API", "https://jaydethsp01-scrumdevai-api.hf.space")
ADMIN_EMAIL = os.environ.get("SCRUMDEV_ADMIN_EMAIL", "adam@scrumdev.ai")
ADMIN_PASS = os.environ.get("SCRUMDEV_ADMIN_PASS", "adam-demo-2026")


# Visión por plantilla para alimentar la generación (rica, en el dominio).
SEED_VISION = {
    "retail-inventory-pro": "Sistema de inventario para tienda de ropa: productos con precio, categorías, stock por talla, proveedores, alertas de bajo stock y dashboard con métricas.",
    "salud-citas": "Sistema de agenda de citas para una clínica: pacientes, profesionales, especialidades, horarios disponibles, estado de cita y recordatorios, con dashboard de citas del día.",
    "ecommerce-fashion": "Tienda online de moda: catálogo de productos con imágenes y precio, categorías, carrito, pedidos con estado, clientes y dashboard de ventas.",
    "saas-crm": "CRM de ventas: leads, oportunidades en un embudo por etapa, contactos, actividades y dashboard con métricas de conversión.",
    "landing-startup": "Landing page para lanzar una startup de software B2B: hero con propuesta de valor, features, testimonios, planes de precios y llamados a la acción.",
}


def _req(method: str, path: str, body=None, token=None, timeout=1800):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as x:
            return x.status, json.loads(x.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"err": e.read().decode()[:300]}
    except Exception as e:  # noqa: BLE001
        return 0, {"err": str(e)[:200]}


def login() -> tuple[str, str]:
    s, d = _req("POST", "/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    return d["access_token"], d["user"]["id"]


def generate_template(tid: str, token: str, uid: str) -> dict:
    """Genera + despliega la plantilla. Devuelve {files, url}."""
    tpl = get_template(tid)
    vision = SEED_VISION.get(tid) or tpl.description
    key = "TPL" + tid.replace("-", "")[:9].upper()
    _req("POST", "/projects", {"key": key, "name": tpl.name, "description": tpl.description, "owner_id": uid}, token)
    _req("POST", f"/projects/{key}/vision", {"project_key": key, "vision": vision,
         "target_users": tpl.sector_label, "stack_preference": "fastapi-next"}, token)
    _req("POST", f"/projects/{key}/smart-build", {"triggered_by": uid}, token)
    for _ in range(40):
        s, d = _req("GET", f"/projects/{key}/backlog", None, token)
        if len(d.get("items") or d.get("stories") or []) > 0:
            break
        time.sleep(8)
    _req("POST", f"/projects/{key}/generate-app", {"triggered_by": uid}, token)
    files = []
    for _ in range(100):
        s, d = _req("GET", f"/projects/{key}/code", None, token)
        if d.get("files"):
            files = d["files"]
            break
        time.sleep(15)
    s, d = _req("POST", f"/projects/{key}/deploy",
                {"triggered_by": uid, "create_vercel_project": True, "framework": "nextjs"}, token)
    return {"key": key, "files": files, "deploy": d}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*", help="ids de plantilla a seedear")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    args = ap.parse_args()

    ids = list(SEED_VISION) if not args.ids and not args.all else (
        [t.id for t in CATALOG] if args.all else args.ids)
    token, uid = login()
    print(f"seedeando {len(ids)} plantillas -> repo {TEMPLATES_REPO}")
    out_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "_templates_out"))
    for tid in ids:
        tpl = get_template(tid)
        if not tpl:
            print("  ! id desconocido:", tid)
            continue
        print(f"\n== {tid} ({tpl.name}) ==")
        res = generate_template(tid, token, uid)
        dep = res["deploy"] or {}
        print("  archivos:", len(res["files"]), "| deployed:", dep.get("deployed"))
        tdir = os.path.join(out_root, tid)
        os.makedirs(os.path.join(tdir, "files"), exist_ok=True)
        for f in res["files"]:
            p = (f.get("file_path") or f.get("path") or "").lstrip("/")
            if not p:
                continue
            fp = os.path.join(tdir, "files", p)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(f.get("content") or "")
        meta = tpl.to_public()
        meta["seeded_at"] = int(time.time())
        meta["deploy_url"] = dep.get("url")
        with open(os.path.join(tdir, "template.json"), "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
        print("  guardado en", tdir, "(falta preview.png: screenshot del deploy)")
    print("\nListo. Para previews: screenshot de cada deploy_url -> templates/<id>/preview.png")
    print("Para publicar: crear repo", TEMPLATES_REPO, "y subir templates/ (usar --push o gh).")


if __name__ == "__main__":
    main()

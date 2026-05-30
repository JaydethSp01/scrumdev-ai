"""E2E del FLUJO COMPLETO desde cero (empresario real).

Valida, de punta a punta y con asserts duros:

  1. Intake por industria: industrias -> form dinamico -> vision rica.
  2. Crear proyecto + setear vision.
  3. Generar backlog (PO Agent, smart-build).
  4. Generar la app DEPLOYABLE per-tier (/generate-app -> generate_full_app):
     artifacts con estructura frontend/ + backend/ separada.
  5. Completitud: el Stack Expert puntua deploy_ready.
  6. BUILD GATE LOCAL (la prueba real): next build del frontend + py_compile
     del backend. Si compila, el deploy NO fallara por carpeta/imports.
  7. (opcional, RUN_CLOUD=1) deploy split real.

Uso:
  PYTHONPATH=backend python backend/scripts/e2e_full_flow.py
  RUN_CLOUD=1 ... para incluir el deploy real a Vercel/Render/Neon.

No usa pytest para poder correrse suelto y mostrar progreso en vivo.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

import httpx

GW = os.environ.get("SCRUMDEV_GATEWAY_URL", "http://localhost:8080")
ORQ = os.environ.get("SCRUMDEV_ORCH_URL", "http://localhost:8200/orchestrator")
KEY = os.environ.get("E2E_PROJECT_KEY", "E2EFLOW")
RUN_CLOUD = os.environ.get("RUN_CLOUD") == "1"

_passed: list[str] = []
_failed: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    (_passed if ok else _failed).append(name)
    print(f"  [{mark}] {name}" + (f" -> {detail}" if detail else ""), flush=True)
    return ok


async def main() -> int:
    async with httpx.AsyncClient(timeout=120.0) as c:
        # --- 1. INTAKE POR INDUSTRIA ---
        print("\n=== 1. Intake por industria ===", flush=True)
        r = await c.get(f"{GW}/intake/industries")
        inds = r.json()
        inds = inds.get("industries", inds) if isinstance(inds, dict) else inds
        check("industrias disponibles", r.status_code == 200 and len(inds) >= 5,
              f"{len(inds)} industrias")

        r = await c.post(f"{GW}/intake/form",
                         json={"industry": "retail", "product_hint": "software de inventario y pedidos"})
        form = r.json()
        check("form dinamico por industria", r.status_code == 200 and len(form.get("fields", [])) >= 3,
              f"{len(form.get('fields', []))} campos")

        r = await c.post(f"{GW}/intake/vision", json={
            "industry": "retail", "project_name": KEY,
            "answers": {
                "inventory_management": "Control de stock en tiempo real, alertas de bajo inventario por bodega",
                "order_processing": "Recepcion de pedidos, seguimiento de estado, orden de reposicion a proveedores",
                "reports": "Productos mas vendidos, rotacion, valor de inventario",
            },
        })
        vision = r.json().get("vision", "")
        check("vision generada desde intake", r.status_code == 200 and len(vision) > 200,
              f"{len(vision)} chars")

        # --- 2. CREAR PROYECTO + VISION ---
        print("\n=== 2. Crear proyecto + vision ===", flush=True)
        await c.post(f"{GW}/projects", json={"key": KEY, "name": KEY,
                                             "description": "E2E full flow", "owner_id": "po"})
        r = await c.get(f"{GW}/projects/{KEY}")
        check("proyecto creado", r.status_code == 200, KEY)
        r = await c.post(f"{GW}/projects/{KEY}/vision",
                         json={"project_key": KEY, "vision": vision,
                               "target_users": "Gerente de inventario y bodegueros",
                               "stack_preference": "Next.js + FastAPI"})
        check("vision seteada", r.status_code == 200)

        # --- 3. GENERAR BACKLOG (PO Agent) ---
        print("\n=== 3. Generar backlog (PO Agent) ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/smart-build",
                         json={"triggered_by": "po", "force_regenerate": False})
        check("smart-build disparado", r.status_code == 200, r.json().get("action_executed", ""))
        # poll backlog
        backlog = []
        for _ in range(40):
            await asyncio.sleep(10)
            rb = await c.get(f"{GW}/projects/{KEY}/backlog")
            items = rb.json()
            items = items.get("items", items) if isinstance(items, dict) else items
            if items:
                backlog = items
                break
        check("backlog generado", len(backlog) >= 4, f"{len(backlog)} historias")

        # --- 3.5 PLANIFICAR SPRINTS (PO Agent) + PO ACTIVA SPRINT 1 ---
        print("\n=== 3.5 Sprints: PO planifica y decide orden ===", flush=True)
        r = await c.post(f"{ORQ}/projects/{KEY}/sprints/plan", timeout=120.0)
        plan = r.json()
        sprints = plan.get("sprints", [])
        check("PO Agent planifico sprints", r.status_code == 200 and len(sprints) >= 2,
              f"{len(sprints)} sprints")
        # distribucion de historias por sprint (entrega incremental)
        dist = ", ".join(f"S{s.get('number')}:{len(s.get('story_keys', []))}" for s in sprints)
        check("historias repartidas por sprint", all(s.get("story_keys") for s in sprints), dist)
        # el PO decide: activar el sprint 1 (primero en orden)
        sprints_sorted = sorted(sprints, key=lambda s: s.get("number", 0))
        first = sprints_sorted[0]
        ra = await c.post(f"{ORQ}/projects/{KEY}/sprints/{first['id']}/status",
                          json={"status": "active"})
        check("PO activa Sprint 1", ra.status_code == 200, first.get("name", ""))
        active_story_count = len(first.get("story_keys", []))

        # --- 4. GENERAR APP DEPLOYABLE PER-TIER (DEL SPRINT ACTIVO) ---
        print(f"\n=== 4. Generar app del sprint activo ({active_story_count} historias) ===", flush=True)
        r = await c.post(f"{ORQ}/projects/{KEY}/generate-app",
                         json={"triggered_by": "po", "replace_existing": True}, timeout=60.0)
        check("generate-app disparado", r.status_code == 200, r.json().get("stage", ""))
        # poll build hasta completed
        stage = ""
        for _ in range(45):
            await asyncio.sleep(10)
            rb = await c.get(f"{ORQ}/projects/{KEY}/builds?limit=1")
            builds = rb.json().get("builds", [])
            if builds:
                b = builds[0]
                stage = f"{b.get('stage')}|{b.get('progress_percent')}"
                if str(b.get("stage", "")).startswith("completed") or b.get("progress_percent") == 100:
                    break
                if "fail" in str(b.get("stage", "")).lower():
                    break
        check("generate-app completado", "completed" in stage or "100" in stage, stage)

        # --- 5. ARTIFACTS PER-TIER + COMPLETITUD ---
        print("\n=== 5. Estructura per-tier + completitud ===", flush=True)
        r = await c.get(f"{ORQ}/projects/{KEY}/code")
        data = r.json()
        arts = data.get("files", data) if isinstance(data, dict) else data
        paths = [a.get("file_path") or a.get("path") for a in arts]
        files = [{"path": p, "content": next((a.get("content", "") for a in arts
                  if (a.get("file_path") or a.get("path")) == p), "")} for p in paths]
        has_fe = any((p or "").startswith("frontend/") for p in paths)
        has_be = any((p or "").startswith("backend/") for p in paths)
        check("frontend/ separado", has_fe, f"{sum(1 for p in paths if (p or '').startswith('frontend/'))} archivos")
        check("backend/ separado", has_be, f"{sum(1 for p in paths if (p or '').startswith('backend/'))} archivos")
        no_dup = not (any(p == "app/page.tsx" for p in paths) and any(p == "frontend/app/page.tsx" for p in paths))
        check("sin duplicar raiz vs frontend/", no_dup)

        from services.ml_service.app.pipelines.stack_expert import score_completeness
        from services.orchestrator_service.app.deploy_split import detect_stack_from_files
        stack = detect_stack_from_files(files)
        sc = score_completeness(files, stack)
        check("completitud deploy_ready", sc["deploy_ready"],
              f"stack={stack} global={sc['global_score']}")

        # --- 6. BUILD GATE LOCAL (PRUEBA REAL DE COMPILACION) ---
        print("\n=== 6. Build gate local (next build real + py_compile) ===", flush=True)
        from services.orchestrator_service.app.build_gate import run_build_gate
        t0 = time.time()
        gated, report = await run_build_gate(files, stack)
        dt = int(time.time() - t0)
        fe_ok = report["tiers"].get("frontend", {}).get("ok", False)
        be_ok = report["tiers"].get("backend", {}).get("ok", True)
        fe_skipped = report["tiers"].get("frontend", {}).get("skipped", False)
        check("frontend compila (next build)", fe_ok,
              f"{'SKIP(npm)' if fe_skipped else 'compilado'} en {dt}s; fixes={report['tiers'].get('frontend',{}).get('fixes')}")
        check("backend valido (py_compile)", be_ok,
              str(report["tiers"].get("backend", {}).get("errors", [])))
        check("build gate global OK", report.get("ok", False))
        if not fe_ok and not fe_skipped:
            print("  --- log frontend ---\n", report["tiers"]["frontend"].get("log", ""), flush=True)

        # --- 7. DEPLOY REAL (opcional) ---
        if RUN_CLOUD:
            print("\n=== 7. Deploy split real (Vercel+Render+Neon) ===", flush=True)
            r = await c.post(f"{ORQ}/projects/{KEY}/deploy",
                             json={"triggered_by": "po", "create_vercel_project": True,
                                   "framework": "nextjs"}, timeout=300.0)
            dep = r.json()
            check("deploy split ejecutado", r.status_code == 200 and not dep.get("build_gate_failed"),
                  f"front={dep.get('vercel_url')} back={dep.get('render_url')}")
        else:
            print("\n=== 7. Deploy real OMITIDO (RUN_CLOUD!=1) ===", flush=True)

    print("\n" + "=" * 50, flush=True)
    print(f"RESULTADO: {len(_passed)} PASS, {len(_failed)} FAIL", flush=True)
    if _failed:
        print("Fallaron:", ", ".join(_failed), flush=True)
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

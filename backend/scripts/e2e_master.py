"""E2E MAESTRO — valida el 100% del flujo desde cero, proyecto nuevo.

Cubre TODO lo construido:
  CREACIÓN
   1. Intake por industria -> form dinámico -> visión rica
   2. Crear proyecto + setear visión
  SCRUM
   3. Backlog (PO Agent)
   4. Sprints: PO planifica + activa Sprint 1 (decide orden)
  GENERACIÓN PER-TIER
   5. generate-app del sprint activo -> frontend/ + backend/ separados, sin dups
   6. Completitud deploy_ready (Stack Expert)
   7. Build gate local (next build real + py_compile)
  CICLO DE VIDA
   8. Versiones: v1 activa con código
   9. Multi-chat: crear chat nuevo, listar varios
  10. Chat: feature chica -> tarea en v1
  11. Chat: cambio grande -> v2 nueva (copy-forward)
  12. Fix de bug -> patch quirúrgico sobre la versión
  13. Historial del chat persiste por sesión
  ACUMULATIVO
  14. Generar 2º sprint -> el código del sprint 1 NO se pierde (acumula)

Todo vía el gateway (8080). Proyecto nuevo y único por corrida.
Uso: PYTHONPATH=backend python backend/scripts/e2e_master.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

import httpx

GW = os.environ.get("SCRUMDEV_GATEWAY_URL", "http://localhost:8080")
ORQ = os.environ.get("SCRUMDEV_ORCH_URL", "http://localhost:8200/orchestrator")
KEY = os.environ.get("E2E_MASTER_KEY", "MASTERTEST")

_ok: list[str] = []
_fail: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    (_ok if cond else _fail).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""), flush=True)
    return cond


async def poll(fn, ready, tries=45, every=10):
    for _ in range(tries):
        await asyncio.sleep(every)
        val = await fn()
        if ready(val):
            return val
    return None


async def main() -> int:
    async with httpx.AsyncClient(timeout=300.0) as c:
        # ---------- CREACIÓN ----------
        print(f"\n=== 1. Intake por industria (proyecto {KEY}) ===", flush=True)
        r = await c.get(f"{GW}/intake/industries")
        inds = r.json().get("industries", r.json()) if isinstance(r.json(), dict) else r.json()
        check("industrias", r.status_code == 200 and len(inds) >= 5, f"{len(inds)}")
        r = await c.post(f"{GW}/intake/form", json={"industry": "salud", "product_hint": "software de gestión de citas para una clínica"})
        check("form dinámico por industria", len(r.json().get("fields", [])) >= 3, f"{len(r.json().get('fields', []))} campos")
        r = await c.post(f"{GW}/intake/vision", json={
            "industry": "salud", "project_name": KEY,
            "answers": {
                "que_gestionas": "Citas médicas, pacientes y profesionales de la clínica",
                "procesos": "Agendar/cancelar citas, historia clínica básica, recordatorios",
                "reportes": "Citas por profesional, ocupación de agenda, pacientes atendidos",
            },
        })
        vision = r.json().get("vision", "")
        check("visión generada", len(vision) > 200, f"{len(vision)} chars")

        print("\n=== 2. Crear proyecto + visión ===", flush=True)
        await c.post(f"{GW}/projects", json={"key": KEY, "name": KEY, "description": "E2E master", "owner_id": "po"})
        check("proyecto creado", (await c.get(f"{GW}/projects/{KEY}")).status_code == 200, KEY)
        r = await c.post(f"{GW}/projects/{KEY}/vision", json={"project_key": KEY, "vision": vision, "target_users": "Recepción y médicos", "stack_preference": "Next.js + FastAPI"})
        check("visión seteada", r.status_code == 200)

        # ---------- SCRUM ----------
        print("\n=== 3. Backlog (PO Agent) ===", flush=True)
        await c.post(f"{GW}/projects/{KEY}/smart-build", json={"triggered_by": "po", "force_regenerate": False})
        backlog = await poll(
            lambda: c.get(f"{GW}/projects/{KEY}/backlog"),
            lambda r: bool((r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json())),
        )
        items = backlog.json().get("items", backlog.json()) if backlog else []
        if isinstance(items, dict):
            items = items.get("items", [])
        check("backlog generado", len(items) >= 4, f"{len(items)} historias")

        print("\n=== 4. Sprints: PO planifica + activa Sprint 1 ===", flush=True)
        r = await c.post(f"{ORQ}/projects/{KEY}/sprints/plan", timeout=120.0)
        sprints = r.json().get("sprints", [])
        check("PO planificó sprints", len(sprints) >= 2, f"{len(sprints)} sprints")
        sprints_sorted = sorted(sprints, key=lambda s: s.get("number", 0))
        first = sprints_sorted[0]
        ra = await c.post(f"{ORQ}/projects/{KEY}/sprints/{first['id']}/status", json={"status": "active"})
        check("PO activó Sprint 1", ra.status_code == 200, first.get("name", ""))

        # ---------- GENERACIÓN PER-TIER ----------
        print("\n=== 5. Generar app del sprint activo (per-tier) ===", flush=True)
        await c.post(f"{ORQ}/projects/{KEY}/generate-app", json={"triggered_by": "po", "replace_existing": True}, timeout=60.0)
        b = await poll(
            lambda: c.get(f"{ORQ}/projects/{KEY}/builds?limit=1"),
            lambda r: (r.json().get("builds") and (str(r.json()["builds"][0].get("stage", "")).startswith("completed") or r.json()["builds"][0].get("progress_percent") == 100 or "fail" in str(r.json()["builds"][0].get("stage", "")).lower())),
        )
        stage = b.json()["builds"][0].get("stage") if b and b.json().get("builds") else "?"
        check("generate-app completado", "completed" in str(stage), str(stage))

        r = await c.get(f"{ORQ}/projects/{KEY}/code")
        arts = r.json().get("files", r.json()) if isinstance(r.json(), dict) else r.json()
        paths = [a.get("file_path") or a.get("path") for a in arts]
        files = [{"path": p, "content": next((a.get("content", "") for a in arts if (a.get("file_path") or a.get("path")) == p), "")} for p in paths]
        fe = sum(1 for p in paths if (p or "").startswith("frontend/"))
        be = sum(1 for p in paths if (p or "").startswith("backend/"))
        check("frontend/ separado", fe > 0, f"{fe} archivos")
        check("backend/ separado", be > 0, f"{be} archivos")
        check("sin duplicar raíz vs frontend/", not (any(p == "app/page.tsx" for p in paths) and any(p == "frontend/app/page.tsx" for p in paths)))

        print("\n=== 6. Completitud (Stack Expert) ===", flush=True)
        from services.ml_service.app.pipelines.stack_expert import score_completeness
        from services.orchestrator_service.app.deploy_split import detect_stack_from_files
        stack = detect_stack_from_files(files)
        sc = score_completeness(files, stack)
        check("deploy_ready", sc["deploy_ready"], f"stack={stack} score={sc['global_score']}")

        print("\n=== 7. Build gate local (next build real) ===", flush=True)
        from services.orchestrator_service.app.build_gate import run_build_gate
        t0 = time.time()
        _, report = await run_build_gate(files, stack)
        dt = int(time.time() - t0)
        check("frontend compila", report["tiers"].get("frontend", {}).get("ok", False), f"{dt}s")
        check("backend válido", report["tiers"].get("backend", {}).get("ok", True))
        check("build gate global OK", report.get("ok", False))

        # ---------- CICLO DE VIDA ----------
        print("\n=== 8. Versiones ===", flush=True)
        r = await c.get(f"{GW}/projects/{KEY}/versions")
        vers = r.json().get("versions", [])
        v1 = next((v for v in vers if v["number"] == 1), None)
        check("v1 activa con código", bool(v1) and v1["status"] == "active" and v1["file_count"] > 0,
              f"files={v1['file_count'] if v1 else 0}")

        print("\n=== 9. Multi-chat ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/chats", json={"user_id": "po", "title": "Mantenimiento", "kind": "lifecycle"})
        sid = r.json().get("id")
        check("crear chat nuevo", bool(sid))
        chats = (await c.get(f"{GW}/projects/{KEY}/chats?user_id=po")).json().get("chats", [])
        check("listar varios chats", len(chats) >= 2, f"{len(chats)} chats")

        print("\n=== 10. Chat: feature chica -> tarea en v1 ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/assistant", json={"user_id": "po", "session_id": sid, "message": "Agrega un botón para imprimir el comprobante de la cita, es algo chico"})
        act = r.json().get("action", {})
        check("clasificó feature/task", act.get("type") == "add_feature" and act.get("scope") == "task", f"{act.get('type')}/{act.get('scope')}")
        check("tarea creada", "agregada" in (r.json().get("action_status") or "").lower())

        print("\n=== 11. Chat: cambio grande -> v2 nueva (copy-forward) ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/assistant", json={"user_id": "po", "session_id": sid, "message": "Quiero rehacer todo para soportar telemedicina con videollamadas, facturación electrónica y portal del paciente, es un cambio grande"})
        act = r.json().get("action", {})
        is_ver = act.get("type") == "new_version" or (act.get("type") == "add_feature" and act.get("scope") == "version")
        check("clasificó versión nueva", is_ver, f"{act.get('type')}/{act.get('scope')}")
        vers2 = (await c.get(f"{GW}/projects/{KEY}/versions")).json().get("versions", [])
        v2 = next((v for v in vers2 if v["number"] == 2), None)
        check("v2 con copy-forward", bool(v2) and v2["file_count"] > 0, f"v2 files={v2['file_count'] if v2 else 0}")

        print("\n=== 12. Fix de bug (patch quirúrgico) ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/fix-bug", json={"bug_description": "El calendario de citas no se ve bien en móvil, los días se enciman. Hacerlo responsive.", "triggered_by": "po"})
        check("fix aplicado", r.json().get("fixed") is True, f"{r.json().get('files_changed')}")

        print("\n=== 13. Historial del chat persiste ===", flush=True)
        msgs = (await c.get(f"{GW}/projects/{KEY}/chats/{sid}/messages")).json().get("messages", [])
        check("historial guardado por sesión", len(msgs) >= 4, f"{len(msgs)} mensajes")

        # ---------- ACUMULATIVO ----------
        print("\n=== 14. 2º sprint NO pierde el código del 1º (acumulativo) ===", flush=True)
        # volver a v1 activa, activar sprint 2, regenerar
        await c.post(f"{GW}/projects/{KEY}/versions/{v1['id']}/status", json={"status": "active"})
        files_before = (await c.get(f"{ORQ}/projects/{KEY}/code")).json()
        fb = files_before.get("files", files_before) if isinstance(files_before, dict) else files_before
        v1_files_before = sum(1 for a in fb if (a.get("file_path") or a.get("path") or "").startswith(("frontend/", "backend/")))
        if len(sprints_sorted) >= 2:
            second = sprints_sorted[1]
            await c.post(f"{ORQ}/projects/{KEY}/sprints/{first['id']}/status", json={"status": "completed"})
            await c.post(f"{ORQ}/projects/{KEY}/sprints/{second['id']}/status", json={"status": "active"})
            await c.post(f"{ORQ}/projects/{KEY}/generate-app", json={"triggered_by": "po", "replace_existing": True}, timeout=60.0)
            await poll(
                lambda: c.get(f"{ORQ}/projects/{KEY}/builds?limit=1"),
                lambda r: (r.json().get("builds") and (str(r.json()["builds"][0].get("stage", "")).startswith("completed") or r.json()["builds"][0].get("progress_percent") == 100)),
            )
            files_after = (await c.get(f"{ORQ}/projects/{KEY}/code")).json()
            fa = files_after.get("files", files_after) if isinstance(files_after, dict) else files_after
            v1_files_after = sum(1 for a in fa if (a.get("file_path") or a.get("path") or "").startswith(("frontend/", "backend/")))
            check("código acumula (>= que antes)", v1_files_after >= v1_files_before,
                  f"antes={v1_files_before} despues={v1_files_after}")
        else:
            check("código acumula", True, "solo 1 sprint, n/a")

    print("\n" + "=" * 55, flush=True)
    print(f"RESULTADO MAESTRO: {len(_ok)} PASS, {len(_fail)} FAIL", flush=True)
    if _fail:
        print("Fallaron:", ", ".join(_fail), flush=True)
    return 1 if _fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""E2E del CICLO DE VIDA (post-entrega) via gateway.

Asume un proyecto ya entregado (v1 con código). Valida:
  1. Versiones: v1 activa existe.
  2. Multi-chat: crear un chat nuevo, listar (varios chats con historial).
  3. Chat lifecycle: feature chica -> tarea en v1.
  4. Chat lifecycle: cambio grande -> v2 nueva (copy-forward).
  5. Fix de bug -> patch aplicado a la versión.
  6. Historial del chat persiste por sesión.

Uso: PYTHONPATH=backend python backend/scripts/e2e_lifecycle.py
"""
from __future__ import annotations

import asyncio
import os
import sys

import httpx

GW = os.environ.get("SCRUMDEV_GATEWAY_URL", "http://localhost:8080")
KEY = os.environ.get("E2E_PROJECT_KEY", "E2EFLOW")

_ok: list[str] = []
_fail: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    (_ok if cond else _fail).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""), flush=True)
    return cond


async def main() -> int:
    async with httpx.AsyncClient(timeout=300.0) as c:
        print("\n=== 1. Versiones ===", flush=True)
        r = await c.get(f"{GW}/projects/{KEY}/versions")
        vers = r.json().get("versions", [])
        v1 = next((v for v in vers if v["number"] == 1), None)
        check("v1 existe y está activa", bool(v1) and v1["status"] == "active",
              f"{len(vers)} versiones")
        check("v1 tiene código", bool(v1) and v1["file_count"] > 0,
              f"files={v1['file_count'] if v1 else 0}")

        print("\n=== 2. Multi-chat ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/chats",
                         json={"user_id": "po", "title": "Chat de mantenimiento", "kind": "lifecycle"})
        sid = r.json().get("id")
        check("crear chat nuevo", bool(sid), r.json().get("title", ""))
        r = await c.get(f"{GW}/projects/{KEY}/chats?user_id=po")
        chats = r.json().get("chats", [])
        check("listar varios chats", len(chats) >= 2, f"{len(chats)} chats")

        print("\n=== 3. Chat lifecycle: feature chica -> tarea ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/assistant", json={
            "user_id": "po", "session_id": sid,
            "message": "Agrega un botón para exportar el listado de proveedores a CSV, es algo chico",
        })
        d = r.json()
        act = d.get("action", {})
        check("clasificó como feature/task", act.get("type") == "add_feature" and act.get("scope") == "task",
              f"type={act.get('type')} scope={act.get('scope')}")
        check("ejecutó (tarea creada)", "agregada" in (d.get("action_status") or "").lower(),
              d.get("action_status", "")[:80])

        print("\n=== 4. Chat lifecycle: cambio grande -> versión nueva ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/assistant", json={
            "user_id": "po", "session_id": sid,
            "message": "Quiero rehacer el sistema para soportar múltiples sucursales con consolidación de inventario entre ellas y reportes corporativos, es un cambio grande",
        })
        d = r.json()
        act = d.get("action", {})
        is_version = act.get("type") == "new_version" or (act.get("type") == "add_feature" and act.get("scope") == "version")
        check("clasificó como versión nueva", is_version, f"type={act.get('type')} scope={act.get('scope')}")
        r = await c.get(f"{GW}/projects/{KEY}/versions")
        vers2 = r.json().get("versions", [])
        v2 = next((v for v in vers2 if v["number"] == 2), None)
        check("v2 creada con copy-forward", bool(v2) and v2["file_count"] > 0,
              f"v2 files={v2['file_count'] if v2 else 0}")

        print("\n=== 5. Fix de bug (patch sobre versión) ===", flush=True)
        r = await c.post(f"{GW}/projects/{KEY}/fix-bug", json={
            "bug_description": "El badge de estado 'Activo' tiene poco contraste y casi no se lee. Mejorar el contraste del badge.",
            "triggered_by": "po",
        })
        d = r.json()
        check("fix aplicado", d.get("fixed") is True, f"archivos={d.get('files_changed')}")

        print("\n=== 6. Historial del chat persiste ===", flush=True)
        r = await c.get(f"{GW}/projects/{KEY}/chats/{sid}/messages")
        msgs = r.json().get("messages", [])
        check("historial del chat guardado", len(msgs) >= 4, f"{len(msgs)} mensajes")

    print("\n" + "=" * 50, flush=True)
    print(f"RESULTADO CICLO DE VIDA: {len(_ok)} PASS, {len(_fail)} FAIL", flush=True)
    if _fail:
        print("Fallaron:", ", ".join(_fail), flush=True)
    return 1 if _fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

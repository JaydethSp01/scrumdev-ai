"""Siembra el corpus BuildMemory con exemplars EXITOSOS por stack.

El Stack Expert recupera estos exemplars (few-shot) para guiar a la IA a generar
proyectos COMPLETOS. Cuantos más exemplars buenos haya, mejor la guía. Aquí
sembramos a lo grande, anclando los manifiestos al blueprint REAL del stack
(required_files + entrypoints) + archivos específicos por dominio, de modo que
cada exemplar representa un build que compiló y desplegó OK.

Idempotente: borra los exemplars sembrados (project_key 'seed-*') y reinserta.

Uso:
  python -m scripts.seed_build_memory
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.ml_service.app.data.seeds import SEED_BUILDS  # noqa: E402
from shared.stacks.stack_blueprints import get_blueprint, BLUEPRINTS  # noqa: E402

# (vision, [entidades de dominio]) -> usadas para crear archivos realistas
DOMAINS = [
    ("Gestión de inventario para un minorista con productos, stock por bodega y proveedores", ["product", "inventory", "supplier"]),
    ("E-commerce de moda con catálogo, carrito, checkout y pedidos", ["product", "cart", "order"]),
    ("SaaS de agendamiento de citas para clínicas con calendario y profesionales", ["appointment", "professional", "patient"]),
    ("Plataforma de facturación electrónica con facturas, pagos y reportes fiscales", ["invoice", "payment", "report"]),
    ("Marketplace de servicios locales con proveedores, reservas y reseñas", ["provider", "booking", "review"]),
    ("CRM para inmobiliaria con propiedades, clientes y oportunidades", ["property", "client", "deal"]),
    ("Plataforma educativa con cursos, lecciones y matrículas", ["course", "lesson", "enrollment"]),
    ("Panel de logística con envíos, rutas y rastreo", ["shipment", "route", "tracking"]),
    ("App de delivery de comida con restaurantes, menús y órdenes", ["restaurant", "menu", "order"]),
    ("Sistema de tickets de soporte con tickets, agentes y SLA", ["ticket", "agent", "sla"]),
]

STATIC_DOMAINS = [
    ("Landing corporativa de una agencia con servicios, portafolio y contacto", ["service", "project", "contact"]),
    ("Portafolio personal de desarrollador con proyectos y blog", ["project", "post", "about"]),
    ("Landing de producto SaaS con pricing, features y testimonios", ["feature", "pricing", "testimonial"]),
    ("Sitio de evento/conferencia con agenda, ponentes y registro", ["agenda", "speaker", "register"]),
]


def build_exemplars() -> list[dict]:
    from services.ml_service.app.nn.features import blueprint_full_manifest
    exemplars: list[dict] = []
    # 1) semillas curadas (visión + manifiesto rico) — ya alineadas al blueprint
    for i, b in enumerate(SEED_BUILDS):
        exemplars.append({
            "project_key": f"seed-curated-{i}",
            "stack": b["stack"], "vision": b["vision"], "manifest": b["manifest"],
        })
    # 2) variaciones por dominio ancladas al contrato real del blueprint
    for i, (vision, entities) in enumerate(DOMAINS):
        stack = "nextjs-fastapi-postgres"
        exemplars.append({
            "project_key": f"seed-fs-{i}", "stack": stack, "vision": vision,
            "manifest": blueprint_full_manifest(stack, entities),
        })
    for i, (vision, entities) in enumerate(STATIC_DOMAINS):
        stack = "nextjs-static"
        exemplars.append({
            "project_key": f"seed-static-{i}", "stack": stack, "vision": vision,
            "manifest": blueprint_full_manifest(stack, entities),
        })
    return exemplars


async def main() -> None:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    from sqlalchemy import delete, select, func
    from shared.db.session import get_session, init_db
    from shared.db.models import BuildMemory
    from services.ml_service.app.models.embedder import embed_one

    await init_db()
    exemplars = build_exemplars()
    print(f"Sembrando {len(exemplars)} exemplars…")

    async for session in get_session():
        # idempotente: borrar seeds previos
        await session.execute(delete(BuildMemory).where(BuildMemory.project_key.like("seed-%")))
        await session.commit()
        for ex in exemplars:
            try:
                emb = embed_one(ex["vision"])
            except Exception:
                emb = []
            session.add(BuildMemory(
                project_key=ex["project_key"], stack=ex["stack"], vision=ex["vision"],
                embedding=emb, manifest=ex["manifest"], success=True,
                outcome={"seeded": True, "build_ok": True, "deploy_ok": True},
            ))
        await session.commit()

        # resumen por stack
        for stack in BLUEPRINTS:
            n = await session.scalar(
                select(func.count()).select_from(BuildMemory).where(
                    BuildMemory.stack == stack, BuildMemory.success.is_(True))
            )
            print(f"  {stack}: {n} exemplars exitosos")
        total = await session.scalar(select(func.count()).select_from(BuildMemory))
        print(f"TOTAL build_memory: {total}")
        break


if __name__ == "__main__":
    asyncio.run(main())

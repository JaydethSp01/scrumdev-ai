"""Clasificador de tipo de producto — FASE A.

Antes de generar, clasifica QUE tipo de producto pide el cliente. Esto decide
si construimos software real (CRUD + backend + DB + auth) o algo estatico.

La guia Delfin (§3.3, §15.2) exige software real cuando se pide un sistema;
estatico solo si el NFR.deployment.target = "Web estatica".
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.openai_client import chat_fast, is_enabled
from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)


# Tipos de producto soportados
PRODUCT_TYPES = {
    "saas_crud": {
        "label": "SaaS / Sistema con CRUD",
        "needs_backend": True,
        "needs_db": True,
        "needs_auth": True,
        "examples": "inventario, CRM, gestion de pedidos, ERP, marketplace, agenda",
    },
    "dashboard": {
        "label": "Dashboard / Analytics",
        "needs_backend": True,
        "needs_db": True,
        "needs_auth": True,
        "examples": "panel de metricas, BI, reportes, monitoreo",
    },
    "marketplace": {
        "label": "Marketplace / Two-sided",
        "needs_backend": True,
        "needs_db": True,
        "needs_auth": True,
        "examples": "marketplace de servicios, e-commerce multi-vendor",
    },
    "social_app": {
        "label": "App social / Comunidad",
        "needs_backend": True,
        "needs_db": True,
        "needs_auth": True,
        "examples": "red social, foro, comunidad, chat",
    },
    "booking": {
        "label": "Reservas / Citas",
        "needs_backend": True,
        "needs_db": True,
        "needs_auth": True,
        "examples": "reservas de turnos, citas medicas, eventos",
    },
    "landing": {
        "label": "Landing / Sitio estatico",
        "needs_backend": False,
        "needs_db": False,
        "needs_auth": False,
        "examples": "landing page, portfolio, sitio corporativo informativo",
    },
}


_CLASSIFY_SYSTEM = (
    "Eres un analista de producto. Clasificas la idea del cliente en UN tipo. "
    "Respondes SOLO JSON valido sin markdown."
)


def _extract_json(raw: str) -> dict:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


async def classify_product(vision: str, nfr: dict | None = None) -> dict:
    """Clasifica el producto. Retorna {type, needs_backend, needs_db, needs_auth,
    entities[], roles[], rationale, is_static}.
    """
    nfr_block = ""
    if nfr:
        target = (nfr.get("deployment", {}) or {}).get("target", "")
        if target:
            nfr_block = f"\nNFR deployment.target: {target}"

    types_desc = "\n".join(
        f"- {k}: {v['label']} (ej: {v['examples']})" for k, v in PRODUCT_TYPES.items()
    )

    prompt = (
        f"Vision del cliente:\n{vision}\n{nfr_block}\n\n"
        f"Tipos posibles:\n{types_desc}\n\n"
        "Clasifica y devuelve JSON EXACTO:\n"
        "{\n"
        '  "type": "saas_crud|dashboard|marketplace|social_app|booking|landing",\n'
        '  "rationale": "1 frase de por que",\n'
        '  "entities": ["Entidad1","Entidad2",...],  // modelos de datos principales (3-8)\n'
        '  "roles": ["admin","usuario",...],  // roles de usuario\n'
        '  "key_features": ["feature1","feature2",...]  // 4-8 funcionalidades core\n'
        "}\n\n"
        "REGLA: si el cliente pide un SISTEMA, GESTION, ADMINISTRAR, CRUD, "
        "INVENTARIO, PEDIDOS, USUARIOS, etc -> NUNCA es landing, es software real. "
        "Solo clasifica como 'landing' si pide explicitamente sitio informativo/portfolio/landing."
    )

    raw = ""
    try:
        if is_enabled():
            raw = await chat_fast(prompt, system=_CLASSIFY_SYSTEM, max_tokens=500, temperature=0.2)
        else:
            raw = await run_claude_code(prompt, system_prompt=_CLASSIFY_SYSTEM, max_turns=1)
        data = _extract_json(raw)
    except Exception as exc:
        logger.warning("classify_failed_default_saas", error=str(exc))
        data = {
            "type": "saas_crud",
            "rationale": "fallback por error de clasificacion",
            "entities": [],
            "roles": ["admin", "usuario"],
            "key_features": [],
        }

    ptype = data.get("type", "saas_crud")
    if ptype not in PRODUCT_TYPES:
        ptype = "saas_crud"
    meta = PRODUCT_TYPES[ptype]

    return {
        "type": ptype,
        "label": meta["label"],
        "needs_backend": meta["needs_backend"],
        "needs_db": meta["needs_db"],
        "needs_auth": meta["needs_auth"],
        "is_static": ptype == "landing",
        "rationale": data.get("rationale", ""),
        "entities": data.get("entities", []) or [],
        "roles": data.get("roles", []) or ["admin", "usuario"],
        "key_features": data.get("key_features", []) or [],
    }

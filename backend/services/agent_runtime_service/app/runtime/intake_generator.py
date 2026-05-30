"""Generador de formularios de recoleccion (intake) por industria.

Cuando el empresario crea un proyecto, elige su INDUSTRIA y la IA genera un
formulario dinamico con las preguntas RELEVANTES de esa industria para
recolectar el contexto. Luego con las respuestas arma una vision rica.

Ej: industria "restaurante" -> pregunta tipo de cocina, # mesas, delivery,
reservas, menu digital, metodos de pago, etc.
"""
from __future__ import annotations

import json
import re

from services.agent_runtime_service.app.runtime.openai_client import chat_fast, is_enabled
from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)


# Industrias comunes (el user puede escribir otra)
INDUSTRIES = [
    {"id": "restaurante", "label": "Restaurante / Food", "icon": "utensils"},
    {"id": "retail", "label": "Retail / Tienda", "icon": "shopping-bag"},
    {"id": "salud", "label": "Salud / Clinica", "icon": "heart-pulse"},
    {"id": "educacion", "label": "Educacion", "icon": "graduation-cap"},
    {"id": "logistica", "label": "Logistica / Envios", "icon": "truck"},
    {"id": "inmobiliaria", "label": "Inmobiliaria", "icon": "building"},
    {"id": "fitness", "label": "Fitness / Gimnasio", "icon": "dumbbell"},
    {"id": "servicios", "label": "Servicios profesionales", "icon": "briefcase"},
    {"id": "manufactura", "label": "Manufactura / Inventario", "icon": "package"},
    {"id": "turismo", "label": "Turismo / Hoteleria", "icon": "plane"},
    {"id": "finanzas", "label": "Finanzas / Fintech", "icon": "landmark"},
    {"id": "agro", "label": "Agro / Campo", "icon": "wheat"},
    {"id": "otro", "label": "Otra industria", "icon": "sparkles"},
]

_INTAKE_SYSTEM = (
    "Eres un analista de negocio senior. Generas formularios de recoleccion de "
    "requisitos especificos por industria. Respondes SOLO JSON valido sin markdown."
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


async def generate_intake_form(industry: str, product_hint: str = "") -> dict:
    """Genera un formulario dinamico de recoleccion para la industria dada.

    Retorna {industry, title, intro, fields: [{id, label, type, options?,
    placeholder?, help?, required}]}.
    """
    hint = f"\nPista del producto: {product_hint}" if product_hint else ""
    prompt = (
        f"Industria: {industry}{hint}\n\n"
        "Genera un formulario de recoleccion de requisitos ESPECIFICO de esta "
        "industria. 6-10 preguntas relevantes que ayuden a entender QUE software "
        "necesita el cliente. Mezcla tipos de campo.\n\n"
        "Devuelve JSON EXACTO:\n"
        "{\n"
        '  "title": "Cuentanos sobre tu <industria>",\n'
        '  "intro": "1 frase de contexto",\n'
        '  "fields": [\n'
        '    {"id": "snake_case", "label": "Pregunta clara", "type": "text|textarea|select|multiselect|number|boolean", '
        '"options": ["a","b"] (solo select/multiselect), "placeholder": "ej...", "help": "ayuda corta", "required": true},\n'
        "    ...\n"
        "  ]\n"
        "}\n\n"
        "Las preguntas deben capturar: que gestiona el negocio, que entidades "
        "maneja, que procesos quiere automatizar, roles de usuario, integraciones. "
        "Concreto y accionable, NO generico."
    )

    raw = ""
    try:
        if is_enabled():
            raw = await chat_fast(prompt, system=_INTAKE_SYSTEM, max_tokens=1200, temperature=0.4)
        else:
            raw = await run_claude_code(prompt, system_prompt=_INTAKE_SYSTEM, max_turns=1)
        data = _extract_json(raw)
    except Exception as exc:
        logger.warning("intake_gen_failed_fallback", error=str(exc))
        data = {
            "title": f"Cuentanos sobre tu negocio de {industry}",
            "intro": "Responde para que la IA entienda mejor tu producto.",
            "fields": [
                {"id": "que_gestiona", "label": "Que gestiona tu negocio?",
                 "type": "textarea", "required": True,
                 "placeholder": "ej: productos, clientes, pedidos..."},
                {"id": "procesos", "label": "Que procesos quieres automatizar?",
                 "type": "textarea", "required": True},
                {"id": "roles", "label": "Quienes usaran el sistema?",
                 "type": "text", "required": False, "placeholder": "ej: admin, vendedor, cliente"},
            ],
        }
    data["industry"] = industry
    # normalizar fields
    fields = data.get("fields", [])
    for f in fields:
        f.setdefault("type", "text")
        f.setdefault("required", False)
        if f["type"] in ("select", "multiselect"):
            f.setdefault("options", [])
    return data


async def vision_from_intake(industry: str, answers: dict, project_name: str = "") -> str:
    """Convierte las respuestas del intake en una vision rica para los agentes."""
    answers_block = "\n".join(
        f"- {k}: {v}" for k, v in answers.items() if v not in (None, "", [])
    )
    prompt = (
        f"Industria: {industry}\n"
        f"Producto: {project_name}\n\n"
        f"Respuestas del cliente:\n{answers_block}\n\n"
        "Redacta una VISION DE PRODUCTO clara y completa (1 parrafo, 4-6 frases) "
        "que un equipo de software usaria para construir el sistema. Incluye: que "
        "hace el producto, para quien, que entidades/datos maneja, que procesos "
        "automatiza. Escribe en espanol, concreto, sin relleno. Solo el parrafo."
    )
    try:
        if is_enabled():
            return (await chat_fast(prompt, max_tokens=400, temperature=0.5)).strip()
        return (await run_claude_code(prompt, max_turns=1)).strip()
    except Exception as exc:
        logger.warning("vision_from_intake_failed", error=str(exc))
        return f"Sistema de {industry} para {project_name}. " + answers_block

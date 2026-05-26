"""Asistente conversacional del proyecto.

Recibe un mensaje libre del usuario + contexto del proyecto (vision, backlog,
ultimo build, decisiones pendientes) y responde como un Product Manager IA:
- responde preguntas sobre el estado
- explica decisiones / historias
- detecta intents accionables (generar codigo de historia X, avanzar Y) y los
  ejecuta llamando los endpoints internos del agent_runtime
"""
from __future__ import annotations

import json
import re
from typing import Any

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code

ASSISTANT_SYSTEM = (
    "Eres un asistente Product Manager para una plataforma multiagente de "
    "generacion de software. Conoces el contexto completo del proyecto del "
    "usuario y le respondes preguntas operacionales en lenguaje natural, "
    "claro, conciso y SIN markdown pesado (usa parrafos cortos y bullets "
    "simples con '-'). NUNCA inventes datos: si no sabes algo, dilo. "
    "Si el usuario pide una accion (generar codigo de una historia, refinar, "
    "avanzar workflow), explica brevemente que harias y devuelve al FINAL "
    "del mensaje una linea separada con formato:\n"
    "ACTION: {\"type\":\"generate_code\"|\"refine\"|\"advance\"|\"none\",\"story_key\":\"S-XXX\"|null,\"target_state\":\"...\"|null}\n"
    "Si no hay accion clara, ACTION: {\"type\":\"none\"}."
)


def _build_context(
    project_key: str,
    vision: dict | None,
    backlog: list[dict],
    last_build: dict | None,
    pending_decisions: list[dict],
) -> str:
    lines: list[str] = [f"### Proyecto: {project_key}"]
    if vision:
        lines.append(f"### Vision\n{vision.get('vision','(sin vision)')}")
        if vision.get("target_users"):
            lines.append(f"Usuarios objetivo: {vision['target_users']}")
        if vision.get("stack_preference"):
            lines.append(f"Stack: {vision['stack_preference']}")
    if last_build:
        lines.append(
            f"### Ultimo build\nstage={last_build.get('stage')} "
            f"progress={last_build.get('progress_percent')}% "
            f"error={last_build.get('error') or 'ninguno'}"
        )
    if backlog:
        lines.append(f"### Backlog ({len(backlog)} historias):")
        for s in backlog[:20]:
            lines.append(
                f"- {s.get('story_key')} [{s.get('status')}, {s.get('priority')}, "
                f"{s.get('story_points')} pts] {s.get('title')}"
            )
    if pending_decisions:
        lines.append(f"### Decisiones pendientes: {len(pending_decisions)}")
        for d in pending_decisions[:5]:
            lines.append(f"- {d.get('decision_type')}: {d.get('title')}")
    return "\n".join(lines)


def _extract_action(text: str) -> dict:
    match = re.search(r"ACTION:\s*(\{.*?\})\s*$", text, re.DOTALL | re.MULTILINE)
    if not match:
        return {"type": "none"}
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return {"type": "none"}


def _strip_action_line(text: str) -> str:
    return re.sub(r"\s*ACTION:\s*\{.*?\}\s*$", "", text, flags=re.DOTALL | re.MULTILINE).strip()


async def ask_assistant(
    project_key: str,
    user_message: str,
    vision: dict | None,
    backlog: list[dict],
    last_build: dict | None,
    pending_decisions: list[dict],
    image_paths: list[str] | None = None,
) -> dict[str, Any]:
    context = _build_context(project_key, vision, backlog, last_build, pending_decisions)
    image_block = ""
    if image_paths:
        lines = [
            "",
            "### Imagenes adjuntas por el usuario:",
            "El usuario adjunto las siguientes imagenes como referencia visual "
            "(capturas de pantalla, mockups, ejemplos de lo que quiere). "
            "USA tu tool Read para verlas y analizarlas ANTES de responder. "
            "Comenta lo que ves y conectalo con su pregunta.",
        ]
        for p in image_paths:
            lines.append(f"- {p}")
        image_block = "\n".join(lines) + "\n"
    prompt = (
        f"{context}\n{image_block}\n---\n\nMensaje del usuario:\n{user_message}\n\n"
        "Responde brevemente y al final agrega la linea ACTION: como instruido."
    )
    raw = await run_claude_code(
        prompt,
        system_prompt=ASSISTANT_SYSTEM,
        max_turns=4 if image_paths else 1,
        image_paths=image_paths or None,
    )
    action = _extract_action(raw)
    reply = _strip_action_line(raw)
    return {"reply": reply, "action": action}

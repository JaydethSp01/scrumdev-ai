"""Runtime alternativo que usa Claude Code via claude-agent-sdk.

Permite ejecutar prompts contra Claude usando la sesion autenticada del binario
`claude` instalado en la maquina (plan Pro/Max), sin consumir Anthropic API.

Requisitos:
  - Tener Claude Code instalado y autenticado en la maquina que corre el backend.
  - Variable opcional `CLAUDE_CODE_BIN` para apuntar a un binario especifico.
"""
from __future__ import annotations

import os
from typing import Optional

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


def _ensure_bin_in_env() -> None:
    """Si el usuario especifico CLAUDE_CODE_BIN, anade su directorio al PATH."""
    if not settings.claude_code_bin:
        return
    bin_path = settings.claude_code_bin
    bin_dir = os.path.dirname(bin_path) or "."
    current_path = os.environ.get("PATH", "")
    if bin_dir not in current_path.split(os.pathsep):
        os.environ["PATH"] = bin_dir + os.pathsep + current_path


async def run_claude_code(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_turns: int = 1,
    image_paths: Optional[list[str]] = None,
) -> str:
    """Invoca Claude Code con un prompt y devuelve el texto del ResultMessage final.

    Por defecto allowed_tools=[] (solo razona). Cuando se pasan image_paths,
    habilita la tool `Read` para que Claude pueda abrir las imagenes adjuntas
    (Claude Code es multimodal y lee imagenes con la tool Read).
    """
    try:
        from claude_agent_sdk import (
            AssistantMessage,
            ClaudeAgentOptions,
            ResultMessage,
            TextBlock,
            query,
        )
    except ImportError as exc:
        raise RuntimeError(
            "claude-agent-sdk no esta instalado. Ejecuta: poetry add claude-agent-sdk"
        ) from exc

    _ensure_bin_in_env()

    allowed_tools: list[str] = []
    if image_paths:
        allowed_tools = ["Read"]

    options_kwargs: dict = {
        "max_turns": max_turns,
        "permission_mode": "bypassPermissions",
        "allowed_tools": allowed_tools,
    }
    if system_prompt:
        options_kwargs["system_prompt"] = system_prompt

    options = ClaudeAgentOptions(**options_kwargs)

    collected: list[str] = []
    final_text: str | None = None

    try:
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text:
                        collected.append(block.text)
            elif isinstance(message, ResultMessage):
                if getattr(message, "result", None):
                    final_text = message.result
    except Exception as exc:
        logger.exception("claude_code_query_failed")
        raise RuntimeError(f"Claude Code SDK error: {exc}") from exc

    if final_text:
        return final_text
    if collected:
        return "\n".join(collected)
    return "(sin respuesta de Claude Code)"

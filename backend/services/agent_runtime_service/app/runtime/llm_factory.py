"""Factory + Strategy para proveedores LLM.

En vez de `if provider == 'claude_code' ... elif 'openai'` esparcido, el
factory resuelve el provider por config y devuelve una estrategia con
interfaz uniforme `complete(prompt, system, ...)`.

Permite agregar nuevos providers (Gemini, etc) sin tocar los callers.
"""
from __future__ import annotations

from typing import Protocol

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


class LLMProvider(Protocol):
    name: str

    async def complete(self, prompt: str, system: str | None = None,
                       max_turns: int = 1, image_paths: list[str] | None = None) -> str:
        ...


class ClaudeCodeProvider:
    """Razonamiento profundo + generacion grande via Claude Code SDK (plan Pro)."""
    name = "claude_code"

    async def complete(self, prompt, system=None, max_turns=1, image_paths=None):
        from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
        return await run_claude_code(prompt, system_prompt=system,
                                     max_turns=max_turns, image_paths=image_paths)


class OpenAIProvider:
    """Respuestas rapidas/baratas + embeddings + vision via OpenAI."""
    name = "openai"

    async def complete(self, prompt, system=None, max_turns=1, image_paths=None):
        from services.agent_runtime_service.app.runtime.openai_client import (
            chat_fast, vision_describe, is_enabled,
        )
        if not is_enabled():
            raise RuntimeError("openai_disabled")
        if image_paths:
            # usar vision para el primero
            return await vision_describe(image_paths[0], prompt)
        return await chat_fast(prompt, system=system, max_tokens=2000)


_REGISTRY: dict[str, LLMProvider] = {
    "claude_code": ClaudeCodeProvider(),
    "openai": OpenAIProvider(),
}


def get_llm(provider: str | None = None) -> LLMProvider:
    """Factory: resuelve el provider por nombre o por settings default."""
    name = (provider or settings.scrumdev_ai_provider or "claude_code").lower()
    return _REGISTRY.get(name, _REGISTRY["claude_code"])


def register_provider(name: str, provider: LLMProvider) -> None:
    """Permite registrar nuevos providers (Gemini, etc) sin tocar callers."""
    _REGISTRY[name] = provider

"""Configuracion del LLM para los agentes CrewAI.

Por defecto usa Anthropic Claude. El proveedor y modelo se controlan con:
  SCRUMDEV_AI_PROVIDER=anthropic
  SCRUMDEV_AI_MODEL=claude-sonnet-4-6
  SCRUMDEV_AI_API_KEY=...

CrewAI usa litellm internamente. Para Anthropic, el id de modelo debe llevar
el prefijo "anthropic/". Aqui se normaliza si el usuario solo pone "claude-...".
"""
from __future__ import annotations

import os
from functools import lru_cache

from crewai import LLM

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


def _normalize_model_id(provider: str, model: str) -> str:
    provider = provider.lower()
    if "/" in model:
        return model
    if provider == "anthropic":
        return f"anthropic/{model}"
    if provider == "openai":
        return f"openai/{model}"
    return model


@lru_cache(maxsize=1)
def get_llm() -> LLM:
    provider = (settings.scrumdev_ai_provider or "anthropic").lower()
    api_key = settings.scrumdev_ai_api_key
    if not api_key:
        logger.warning(
            "llm_api_key_missing",
            provider=provider,
            hint="Configura SCRUMDEV_AI_API_KEY en .env",
        )

    if provider == "anthropic" and api_key:
        os.environ["ANTHROPIC_API_KEY"] = api_key
    elif provider == "openai" and api_key:
        os.environ["OPENAI_API_KEY"] = api_key

    model_id = _normalize_model_id(provider, settings.scrumdev_ai_model)
    logger.info("llm_initialized", provider=provider, model=model_id)
    return LLM(model=model_id, api_key=api_key)

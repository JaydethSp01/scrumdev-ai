"""Cliente OpenAI - complemento a Claude Code SDK (no reemplazo).

Estrategia hibrida segun tarea:
  - Razonamiento profundo, codigo grande, creativo  -> Claude Code SDK (plan Pro)
  - Embeddings RAG                                  -> text-embedding-3-small (barato + rapido)
  - Validacion rapida / intent detection            -> gpt-4o-mini (1 req/0.0001 USD aprox)
  - Image understanding / multimodal pesado         -> gpt-4o vision
  - Function calling con tools estructuradas        -> gpt-4o
  - Transcripcion de audio                          -> whisper-1

Cuando OPENAI_ENABLED=false, helpers retornan None / raise — el caller
debe caer al runtime Claude.
"""
from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import httpx

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)

API_BASE = "https://api.openai.com/v1"


def is_enabled() -> bool:
    return bool(settings.openai_enabled and settings.openai_api_key)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }


# --- Chat completion (fast/mini) ---

async def chat_fast(
    prompt: str,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 600,
) -> str:
    """Respuesta corta y barata. Para validaciones, intent detection,
    resumenes, judging entre opciones, clasificacion."""
    if not is_enabled():
        raise RuntimeError("openai_disabled")
    msgs: list[dict] = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    body = {
        "model": model or settings.openai_model_fast,
        "messages": msgs,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{API_BASE}/chat/completions", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


# --- Vision (multimodal con imagen URL o base64) ---

async def vision_describe(
    image_source: str,
    prompt: str = "Describe esta imagen brevemente. Si es un mockup/screenshot de UI, identifica componentes y posibles problemas.",
    model: str | None = None,
    max_tokens: int = 500,
) -> str:
    """`image_source` puede ser una URL http(s)... o una ruta local."""
    if not is_enabled():
        raise RuntimeError("openai_disabled")
    if image_source.startswith("http://") or image_source.startswith("https://"):
        image_url = image_source
    else:
        p = Path(image_source)
        b64 = base64.b64encode(p.read_bytes()).decode()
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        image_url = f"data:{mime};base64,{b64}"
    body = {
        "model": model or settings.openai_model_vision,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        r = await client.post(f"{API_BASE}/chat/completions", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


# --- Embeddings (mas baratos y mejores que sentence-transformers local) ---

async def embed(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Devuelve un vector por cada texto. dim=1536 para text-embedding-3-small."""
    if not is_enabled():
        raise RuntimeError("openai_disabled")
    body = {"model": model or settings.openai_embedding_model, "input": texts}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{API_BASE}/embeddings", json=body, headers=_headers())
        r.raise_for_status()
        return [d["embedding"] for d in r.json()["data"]]


async def embed_one(text: str, model: str | None = None) -> list[float]:
    vectors = await embed([text], model=model)
    return vectors[0]


# --- Function calling / structured output ---

async def chat_with_tools(
    prompt: str,
    tools: list[dict],
    system: str | None = None,
    model: str | None = None,
    tool_choice: str | dict = "auto",
) -> dict[str, Any]:
    """Function calling estructurado. Util para extraer datos / clasificar."""
    if not is_enabled():
        raise RuntimeError("openai_disabled")
    msgs: list[dict] = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    body = {
        "model": model or settings.openai_model_vision,  # gpt-4o tiene mejor tool use
        "messages": msgs,
        "tools": tools,
        "tool_choice": tool_choice,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{API_BASE}/chat/completions", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()

"""Runtime alternativo que usa Claude Code via claude-agent-sdk.

Permite ejecutar prompts contra Claude usando la sesion autenticada del binario
`claude` instalado en la maquina (plan Pro/Max), sin consumir Anthropic API.

Requisitos:
  - Tener Claude Code instalado y autenticado en la maquina que corre el backend.
  - Variable opcional `CLAUDE_CODE_BIN` para apuntar a un binario especifico.
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


async def _run_via_api(
    prompt: str,
    system_prompt: Optional[str],
    image_paths: Optional[list[str]],
    provider: str,
) -> str:
    """Generación vía API (cloud). OpenAI por defecto; Anthropic API si está
    configurado el provider 'anthropic' con su key. Visión con gpt-4o si hay
    imágenes."""
    from services.agent_runtime_service.app.runtime import openai_client

    model_big = settings.openai_model_vision or "gpt-4o"  # gpt-4o: buen codegen
    # imágenes (bug-fix con screenshot): usar visión sobre la primera
    if image_paths:
        for p in image_paths:
            try:
                return await openai_client.vision_describe(p, prompt)
            except Exception:  # noqa: BLE001
                continue
    # texto: completion grande (generación de apps/backlog/código)
    try:
        return await openai_client.chat_fast(
            prompt, system=system_prompt, model=model_big, max_tokens=16000,
            temperature=0.6,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("api_generation_failed", provider=provider)
        raise RuntimeError(f"API generation error ({provider}): {exc}") from exc


def _ensure_bin_in_env() -> None:
    """Si el usuario especifico CLAUDE_CODE_BIN, anade su directorio al PATH."""
    if settings.claude_code_bin:
        bin_path = settings.claude_code_bin
        bin_dir = os.path.dirname(bin_path) or "."
        current_path = os.environ.get("PATH", "")
        if bin_dir not in current_path.split(os.pathsep):
            os.environ["PATH"] = bin_dir + os.pathsep + current_path

    # PRECEDENCIA DE CREDENCIALES (bug prod): el CLI de Claude Code PREFIERE
    # ANTHROPIC_API_KEY sobre el token del plan (CLAUDE_CODE_OAUTH_TOKEN). Si el
    # entorno arrastra una ANTHROPIC_API_KEY invalida/placeholder, el CLI la usa y
    # falla con 401 ("error result"), cayendo a OpenAI. Cuando vamos por el plan
    # headless (hay OAuth token), eliminamos ANTHROPIC_API_KEY para forzar el token.
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") and os.environ.get("ANTHROPIC_API_KEY"):
        os.environ.pop("ANTHROPIC_API_KEY", None)
        logger.info("anthropic_api_key_removed_for_oauth_plan")


# Timeout por intento (segundos) según el peso de la tarea. La generación de app
# (ui/app) produce muchos archivos en una respuesta -> necesita más aire que una
# clasificación de texto. Configurable por env para ajustar sin redeploy de código.
_KIND_TIMEOUT = {
    "ui": float(os.environ.get("CLAUDE_TIMEOUT_UI", "420")),
    "app": float(os.environ.get("CLAUDE_TIMEOUT_APP", "420")),
    "code": float(os.environ.get("CLAUDE_TIMEOUT_CODE", "300")),
    "text": float(os.environ.get("CLAUDE_TIMEOUT_TEXT", "180")),
}


async def run_claude_code(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_turns: int = 1,
    image_paths: Optional[list[str]] = None,
    kind: str = "text",
) -> str:
    """Punto único de generación con LLM — **CLAUDE-ONLY** (Anthropic es lo mejor hoy
    para código y UI; OpenAI quedó retirado del flujo).

    Estrategia: Claude vía plan headless con REINTENTOS y timeout duro por intento.
    NO hay fallback a OpenAI (era peso muerto: una key sin saldo convertía un hipo de
    Claude en fallo duro). Si Claude no responde tras los reintentos, se lanza el error
    para que el llamador degrade con elegancia (p.ej. omitir un paso de refinamiento y
    enviar lo ya generado), nunca para tumbar todo el build.

    El único camino no-Claude es `SCRUMDEV_AI_PROVIDER != claude_code` (dev local sin
    token), que respeta el provider explícito.
    """
    provider = (settings.scrumdev_ai_provider or "claude_code").lower()
    if provider != "claude_code":
        # provider explícito no-claude: respetarlo (p.ej. dev local sin token)
        return await _run_via_api(prompt, system_prompt, image_paths, provider)

    timeout_s = _KIND_TIMEOUT.get(kind, _KIND_TIMEOUT["text"])
    # 2 intentos (1 reintento): acota el peor caso de tiempo. Un 2º timeout significa
    # que Claude está genuinamente caído -> el llamador degrada con elegancia.
    attempts = 2
    last: BaseException | None = None
    for attempt in range(attempts):
        try:
            # timeout duro: si el SDK se cuelga, abortamos el intento y reintentamos
            # en vez de dejar la corrutina (y el build) colgada indefinidamente.
            return await asyncio.wait_for(
                _run_claude_sdk(prompt, system_prompt, max_turns, image_paths),
                timeout=timeout_s,
            )
        except BaseException as exc:  # noqa: BLE001
            last = exc
            logger.warning(
                "claude_retry", kind=kind, attempt=attempt, error=str(exc)[:160]
            )
            if attempt < attempts - 1:
                await asyncio.sleep(2 ** attempt)  # backoff: no martillear el SDK
    raise RuntimeError(
        f"Claude generation failed ({kind}) tras {attempts} intentos: {str(last)[:200]}"
    )


async def _run_claude_sdk(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_turns: int = 1,
    image_paths: Optional[list[str]] = None,
) -> str:
    """Generación vía Claude Code SDK/CLI (plan, sin API)."""
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

    # Sandbox: solo permitir Read si hay image_paths Y todos los paths estan
    # dentro del directorio uploads/ (whitelist). Previene que un prompt
    # del usuario pida "lee /etc/passwd" (Sprint 2 security fix).
    import os
    from pathlib import Path

    uploads_root = Path(os.environ.get("UPLOADS_ROOT", "uploads")).resolve()

    safe_image_paths: list[str] = []
    if image_paths:
        for p in image_paths:
            try:
                resolved = Path(p).resolve()
                # Verifica que esta dentro de uploads_root
                resolved.relative_to(uploads_root)
                safe_image_paths.append(str(resolved))
            except (ValueError, OSError):
                logger.warning("rejected_unsafe_image_path", path=p)
                continue

    allowed_tools: list[str] = []
    if safe_image_paths:
        allowed_tools = ["Read"]

    # permission_mode='default' en lugar de 'bypassPermissions' = el SDK
    # no aprueba automaticamente lecturas fuera del cwd. Solo paths
    # explicitos del prompt.
    options_kwargs: dict = {
        "max_turns": max_turns,
        "permission_mode": "default" if safe_image_paths else "default",
        "allowed_tools": allowed_tools,
        "cwd": str(uploads_root) if safe_image_paths else None,
    }
    if system_prompt:
        options_kwargs["system_prompt"] = system_prompt

    # Limpiar None values
    options_kwargs = {k: v for k, v in options_kwargs.items() if v is not None}

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

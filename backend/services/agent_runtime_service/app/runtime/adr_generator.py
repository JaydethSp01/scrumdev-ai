"""Genera Architecture Decision Records (ADR) usando Claude Code SDK.

El ADR sigue el formato MADR:
  - Title (ADR-NNN)
  - Status (proposed/accepted/deprecated)
  - Context
  - Decision
  - Consequences
"""
from __future__ import annotations

from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.personalization import build_style_prefix, remember


async def generate_adr(
    project_key: str,
    adr_number: int,
    topic: str,
    context: str,
    nfr_data: dict | None = None,
) -> dict:
    nfr_block = ""
    if nfr_data:
        import json

        nfr_block = (
            "\n\n### NFR capturados:\n```json\n" + json.dumps(nfr_data, indent=2) + "\n```\n"
        )

    style_prefix = await build_style_prefix(project_key, f"{topic} {context}", top_k=4)

    prompt = (
        f"{style_prefix}"
        f"Genera un Architecture Decision Record (ADR) numero {adr_number:03d} "
        f"para el proyecto {project_key} sobre: {topic}.\n\n"
        f"### Contexto:\n{context}\n{nfr_block}\n"
        "Devuelve markdown estricto en formato MADR con secciones:\n"
        "## Title (ADR-XXX: titulo descriptivo)\n"
        "## Status\nproposed\n"
        "## Context\n(explica el problema y restricciones)\n"
        "## Decision\n(decision tomada con justificacion tecnica)\n"
        "## Consequences\n(positivas, negativas y neutrales)\n\n"
        "Se conciso. No agregues introducciones ni cierres."
    )

    markdown = await run_claude_code(
        prompt,
        system_prompt=(
            "Eres un arquitecto senior que escribe ADR claros y accionables. "
            "Sigues el formato MADR estricto. Respondes solo markdown."
        ),
    )

    await remember(project_key, f"ADR-{adr_number:03d} {topic}: {markdown[:600]}", kind="adr")

    # Persistir ADR en docs/adr/ con firma (autor + fecha) — guia Delfin
    import os
    from datetime import datetime, timezone
    from pathlib import Path
    import re

    safe_topic = re.sub(r"[^a-zA-Z0-9-]+", "-", topic.lower()).strip("-")[:60]
    adr_dir = Path(os.environ.get("ADR_ROOT", "docs/adr")).resolve()
    adr_dir.mkdir(parents=True, exist_ok=True)
    fname = f"ADR-{adr_number:03d}-{safe_topic}.md"
    fs_path = adr_dir / fname

    footer = (
        "\n\n---\n"
        f"_Author: ScrumDev AI (`adr_generator.py`)_\n"
        f"_Project: {project_key}_\n"
        f"_Date: {datetime.now(timezone.utc).isoformat()}_\n"
        f"_File: docs/adr/{fname}_\n"
    )
    fs_path.write_text(markdown.rstrip() + footer, encoding="utf-8")

    # Auto-commit ADR al repo del proyecto generado via git_connector_service
    # (cierra T5 gap: ADRs versionados en el repo del cliente, no solo local).
    git_commit_result: dict | None = None
    try:
        import httpx
        from shared.config.settings import settings as _settings

        slug = project_key.lower().replace("_", "-")
        async with httpx.AsyncClient(timeout=20.0) as _client:
            r = await _client.post(
                f"{_settings.git_connector_service_url}/push",
                json={
                    "repo": slug,
                    "branch": "main",
                    "files": [
                        {
                            "path": f"docs/adr/{fname}",
                            "content": markdown.rstrip() + footer,
                        }
                    ],
                    "message": f"docs(adr): {fname} - {topic[:60]}",
                },
            )
            if r.status_code < 400:
                git_commit_result = r.json()
    except Exception:
        # Best-effort: si git_connector no responde, el ADR queda en local
        git_commit_result = None

    return {
        "adr_number": adr_number,
        "title": f"ADR-{adr_number:03d}: {topic}",
        "status": "proposed",
        "context": context,
        "decision": "Ver markdown completo.",
        "consequences": "Ver markdown completo.",
        "markdown": markdown,
        "fs_path": str(fs_path),
        "file_name": fname,
        "git_commit": git_commit_result,
    }

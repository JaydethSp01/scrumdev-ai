"""Extrae texto de documentos de requerimientos (PDF/docx/txt/md).

El empresario sube su doc de requisitos y se extrae el texto para enriquecer
el contexto de la IA. Luego se sintetiza en una vision.
"""
from __future__ import annotations

import io

from services.agent_runtime_service.app.runtime.openai_client import chat_fast, is_enabled
from services.agent_runtime_service.app.runtime.claude_code_runtime import run_claude_code
from shared.observability import get_logger

logger = get_logger(__name__)


def extract_text(filename: str, data: bytes) -> str:
    """Extrae texto plano del documento segun su tipo."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as exc:
            logger.warning("pdf_extract_failed", error=str(exc))
            return ""
    if name.endswith(".docx"):
        try:
            import docx
            doc = docx.Document(io.BytesIO(data))
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception as exc:
            logger.warning("docx_extract_failed", error=str(exc))
            return ""
    # txt, md, csv, json -> decode directo
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


async def vision_from_document(text: str, project_name: str = "") -> dict:
    """Sintetiza el texto del doc en una vision + entidades + features.

    Retorna {vision, target_users, summary}.
    """
    truncated = text[:6000]  # cap para el prompt
    prompt = (
        f"Producto: {project_name}\n\n"
        f"Documento de requerimientos del cliente:\n{truncated}\n\n"
        "Analiza el documento y extrae:\n"
        "1. Una VISION DE PRODUCTO clara (1 parrafo, 4-6 frases).\n"
        "2. Usuarios objetivo (1 frase).\n\n"
        "Devuelve JSON EXACTO:\n"
        '{"vision": "...", "target_users": "...", "summary": "1 frase resumen"}'
    )
    import json, re
    try:
        if is_enabled():
            raw = await chat_fast(prompt, max_tokens=600, temperature=0.4)
        else:
            raw = await run_claude_code(prompt, max_turns=1)
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        data = json.loads(m.group(0) if m else cleaned)
    except Exception as exc:
        logger.warning("vision_from_doc_failed", error=str(exc))
        data = {
            "vision": truncated[:500],
            "target_users": "",
            "summary": "Extraido del documento",
        }
    return data

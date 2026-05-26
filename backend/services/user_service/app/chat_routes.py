"""Upload de imagenes para el chat IA de un proyecto.

El usuario adjunta capturas/mockups para dar feedback visual al asistente
("este header no va aqui"). Las imagenes quedan en
`uploads/{slug}/chat/{uuid}.ext` y se sirven via /uploads.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from services.user_service.app.brand_routes import (
    ALLOWED_MIME,
    MAX_BYTES,
    PUBLIC_BASE,
    UPLOADS_ROOT,
    _slugify,
)

router = APIRouter()


@router.post("/projects/{project_key}/chat/upload-image")
async def upload_chat_image(project_key: str, file: UploadFile = File(...)) -> dict:
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo no soportado: {file.content_type}. Permitidos: {', '.join(sorted(ALLOWED_MIME))}",
        )
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Imagen excede {MAX_BYTES // 1024 // 1024}MB",
        )

    slug = _slugify(project_key)
    chat_dir = UPLOADS_ROOT / slug / "chat"
    chat_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "img.png").suffix.lower() or ".png"
    fname = f"{uuid.uuid4().hex}{ext}"
    fs_path = chat_dir / fname
    fs_path.write_bytes(data)

    return {
        "project_key": project_key,
        "url": f"{PUBLIC_BASE}/{slug}/chat/{fname}",
        "fs_path": str(fs_path),
        "name": file.filename,
        "size_bytes": len(data),
        "mime_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

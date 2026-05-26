"""Endpoints para personalizacion del cliente: brand kit + assets upload.

Storage local en `uploads/{project_key}/` servido como static.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select

from shared.db.models import BrandKit, ProjectAsset
from shared.db.session import get_session

router = APIRouter()

UPLOADS_ROOT = Path(os.environ.get("UPLOADS_ROOT", "uploads")).resolve()
UPLOADS_ROOT.mkdir(exist_ok=True)

PUBLIC_BASE = os.environ.get("UPLOADS_PUBLIC_BASE", "http://localhost:8012/uploads")
MAX_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"}
ASSET_TYPES = {"logo", "hero", "feature", "avatar", "gallery", "background", "other"}


class BrandKitIn(BaseModel):
    primary_color: str = "#5b6cff"
    secondary_color: str = "#10b981"
    accent_color: str = "#f59e0b"
    background_color: str = "#ffffff"
    text_color: str = "#171717"
    font_family: str = "Inter"
    logo_url: str | None = None
    tone: str = "moderno"
    industry: str | None = None
    extra: dict = {}


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-").lower()
    return base or "file"


@router.get("/projects/{project_key}/brand-kit")
async def get_brand_kit(project_key: str) -> dict:
    async for session in get_session():
        r = await session.execute(
            select(BrandKit).where(BrandKit.project_key == project_key)
        )
        bk = r.scalar_one_or_none()
        if not bk:
            return {
                "project_key": project_key,
                "primary_color": "#5b6cff",
                "secondary_color": "#10b981",
                "accent_color": "#f59e0b",
                "background_color": "#ffffff",
                "text_color": "#171717",
                "font_family": "Inter",
                "logo_url": None,
                "tone": "moderno",
                "industry": None,
                "extra": {},
                "exists": False,
            }
        return {
            "project_key": project_key,
            "primary_color": bk.primary_color,
            "secondary_color": bk.secondary_color,
            "accent_color": bk.accent_color,
            "background_color": bk.background_color,
            "text_color": bk.text_color,
            "font_family": bk.font_family,
            "logo_url": bk.logo_url,
            "tone": bk.tone,
            "industry": bk.industry,
            "extra": bk.extra,
            "exists": True,
        }
    raise HTTPException(status_code=503, detail="db unavailable")


@router.put("/projects/{project_key}/brand-kit")
async def upsert_brand_kit(project_key: str, body: BrandKitIn) -> dict:
    async for session in get_session():
        r = await session.execute(
            select(BrandKit).where(BrandKit.project_key == project_key)
        )
        bk = r.scalar_one_or_none()
        if bk:
            for k, v in body.model_dump().items():
                setattr(bk, k, v)
        else:
            bk = BrandKit(project_key=project_key, **body.model_dump())
            session.add(bk)
        await session.commit()
        await session.refresh(bk)
        return {"project_key": project_key, "updated": True, "id": bk.id}
    raise HTTPException(status_code=503, detail="db unavailable")


@router.get("/projects/{project_key}/assets")
async def list_assets(project_key: str) -> dict:
    async for session in get_session():
        r = await session.execute(
            select(ProjectAsset)
            .where(ProjectAsset.project_key == project_key)
            .order_by(ProjectAsset.asset_type, ProjectAsset.order_index)
        )
        items = r.scalars().all()
        return {
            "assets": [
                {
                    "id": a.id,
                    "asset_type": a.asset_type,
                    "name": a.name,
                    "url": a.url,
                    "alt_text": a.alt_text,
                    "order_index": a.order_index,
                    "mime_type": a.mime_type,
                    "size_bytes": a.size_bytes,
                    "created_at": a.created_at.isoformat(),
                }
                for a in items
            ]
        }
    return {"assets": []}


@router.post("/projects/{project_key}/assets")
async def upload_asset(
    project_key: str,
    file: UploadFile = File(...),
    asset_type: str = Form("other"),
    alt_text: str = Form(""),
    order_index: int = Form(0),
) -> dict:
    if asset_type not in ASSET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"asset_type must be one of {sorted(ASSET_TYPES)}",
        )
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"mime {file.content_type} not allowed")

    project_dir = UPLOADS_ROOT / _slugify(project_key)
    project_dir.mkdir(exist_ok=True)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    safe_name = f"{uuid.uuid4().hex[:12]}.{ext}" if ext else f"{uuid.uuid4().hex[:12]}.bin"
    dest = project_dir / safe_name

    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large (max 10MB)")
    dest.write_bytes(contents)

    public_url = f"{PUBLIC_BASE}/{_slugify(project_key)}/{safe_name}"

    async for session in get_session():
        asset = ProjectAsset(
            project_key=project_key,
            asset_type=asset_type,
            name=file.filename or safe_name,
            url=public_url,
            alt_text=alt_text or None,
            order_index=order_index,
            mime_type=file.content_type,
            size_bytes=len(contents),
        )
        session.add(asset)
        await session.commit()
        await session.refresh(asset)
        return {
            "id": asset.id,
            "url": public_url,
            "asset_type": asset_type,
            "size_bytes": len(contents),
        }
    raise HTTPException(status_code=503, detail="db unavailable")


@router.delete("/projects/{project_key}/assets/{asset_id}")
async def delete_asset(project_key: str, asset_id: str) -> dict:
    async for session in get_session():
        asset = await session.get(ProjectAsset, asset_id)
        if not asset or asset.project_key != project_key:
            raise HTTPException(status_code=404, detail="asset not found")
        # Borrar archivo del disco
        try:
            url = asset.url
            slug = _slugify(project_key)
            filename = url.rsplit("/", 1)[-1]
            (UPLOADS_ROOT / slug / filename).unlink(missing_ok=True)
        except Exception:
            pass
        await session.delete(asset)
        await session.commit()
        return {"deleted": True, "id": asset_id}
    raise HTTPException(status_code=503, detail="db unavailable")

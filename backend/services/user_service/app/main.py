from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import select

from services.user_service.app.brand_routes import UPLOADS_ROOT, router as brand_router
from services.user_service.app.chat_routes import router as chat_router
from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import Project, User
from shared.db.session import get_session
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("user-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - User Service", version="0.2.0")
instrument_app(app, "user-service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir imagenes subidas como static
Path(UPLOADS_ROOT).mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_ROOT)), name="uploads")
app.include_router(brand_router)
app.include_router(chat_router)


class ProjectCreate(BaseModel):
    key: str
    name: str
    description: str | None = None
    owner_id: str | None = None


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "user-service"}


@app.get("/users/{user_id}")
async def get_user(user_id: str) -> dict:
    async for session in get_session():
        user = await session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="user not found")
        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/users")
async def list_users() -> dict:
    async for session in get_session():
        result = await session.execute(select(User).order_by(User.created_at.desc()))
        rows = result.scalars().all()
        return {
            "users": [
                {"id": u.id, "email": u.email, "name": u.name, "is_active": u.is_active}
                for u in rows
            ]
        }
    return {"users": []}


@app.get("/projects")
async def list_projects(owner_id: str | None = None) -> dict:
    """Lista proyectos. Si se pasa owner_id, filtra por dueno. Sin owner_id
    devuelve lista vacia para evitar exponer proyectos ajenos."""
    if not owner_id:
        return {"projects": []}
    async for session in get_session():
        stmt = (
            select(Project)
            .where(Project.owner_id == owner_id)
            .order_by(Project.created_at.desc())
        )
        result = await session.execute(stmt)
        rows = result.scalars().all()
        return {
            "projects": [
                {
                    "id": p.id,
                    "key": p.key,
                    "name": p.name,
                    "description": p.description,
                    "owner_id": p.owner_id,
                    "created_at": p.created_at.isoformat(),
                }
                for p in rows
            ]
        }
    return {"projects": []}


@app.post("/projects")
async def create_project(req: ProjectCreate) -> dict:
    async for session in get_session():
        existing = await session.execute(select(Project).where(Project.key == req.key))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="project key already exists")
        project = Project(**req.model_dump())
        session.add(project)
        await session.commit()
        await session.refresh(project)
        return {
            "id": project.id,
            "key": project.key,
            "name": project.name,
            "description": project.description,
            "owner_id": project.owner_id,
        }
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/projects/{key}")
async def get_project(key: str) -> dict:
    async for session in get_session():
        result = await session.execute(select(Project).where(Project.key == key))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="project not found")
        return {
            "id": project.id,
            "key": project.key,
            "name": project.name,
            "description": project.description,
            "owner_id": project.owner_id,
            "created_at": project.created_at.isoformat(),
        }
    raise HTTPException(status_code=503, detail="database unavailable")

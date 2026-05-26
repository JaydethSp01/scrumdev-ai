from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from shared.config.settings import settings
from shared.db import init_db
from shared.db.models import User
from shared.db.session import get_session
from shared.observability import configure_logging, get_logger
from shared.security.jwt import create_access_token, decode_token
from shared.security.passwords import hash_password, verify_password

configure_logging("auth-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Auth Service", version="0.1.0")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@app.on_event("startup")
async def _startup() -> None:
    try:
        await init_db()
    except Exception as exc:
        logger.warning("db_init_failed", error=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "auth-service"}


@app.post("/auth/register", response_model=TokenResponse)
async def register(req: RegisterRequest) -> TokenResponse:
    async for session in get_session():
        existing = await session.execute(select(User).where(User.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="email already registered")
        user = User(email=req.email, name=req.name, hashed_password=hash_password(req.password))
        session.add(user)
        await session.commit()
        await session.refresh(user)
        token = create_access_token(user.id, {"email": user.email, "name": user.name})
        return TokenResponse(
            access_token=token,
            user={"id": user.id, "email": user.email, "name": user.name},
        )
    raise HTTPException(status_code=503, detail="database unavailable")


@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest) -> TokenResponse:
    async for session in get_session():
        result = await session.execute(select(User).where(User.email == req.email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="user inactive")
        token = create_access_token(user.id, {"email": user.email, "name": user.name})
        return TokenResponse(
            access_token=token,
            user={"id": user.id, "email": user.email, "name": user.name},
        )
    raise HTTPException(status_code=503, detail="database unavailable")


@app.get("/auth/verify")
async def verify(token: str) -> dict:
    try:
        payload = decode_token(token)
        return {"valid": True, "subject": payload.get("sub"), "claims": payload}
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

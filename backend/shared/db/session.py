from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from shared.config.settings import settings


class Base(DeclarativeBase):
    pass


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _normalize_db_url(raw: str) -> tuple[str, dict]:
    """Acepta URLs de Postgres de cualquier proveedor (Neon, Supabase, local) y
    las adapta al driver asyncpg.

    - postgresql:// -> postgresql+asyncpg://
    - quita `sslmode`/`channel_binding` (params de libpq que asyncpg NO entiende)
      y, si pedían SSL, lo activa vía connect_args={"ssl": True}.
    Devuelve (url_normalizada, connect_args).
    """
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

    url = raw.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]

    parts = urlsplit(url)
    q = dict(parse_qsl(parts.query))
    ssl_required = q.pop("sslmode", "").lower() in ("require", "verify-full", "verify-ca", "prefer")
    q.pop("channel_binding", None)
    new = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))
    connect_args: dict = {}
    if ssl_required or ".neon.tech" in parts.netloc or "supabase" in parts.netloc:
        connect_args["ssl"] = True
    return new, connect_args


def _get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        url, connect_args = _normalize_db_url(settings.database_url)
        _engine = create_async_engine(
            url,
            echo=False,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def init_db() -> None:
    """Crea las tablas declaradas. Fase 1 usa create_all; despues migrara a Alembic."""
    from shared.db import models  # noqa: F401 - asegura registro de modelos

    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    _get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session

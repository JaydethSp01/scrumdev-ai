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
    await _ensure_constraints()


async def _ensure_constraints() -> None:
    """Asegura constraints que create_all NO actualiza (raw DDL idempotente).

    El check de human_decisions.status DEBE permitir 'superseded' (el loop de
    sprints lo usa para invalidar la aprobacion vieja del Sprint Review). Una
    migracion vieja lo creo SIN ese valor -> el avance de sprint reventaba y el
    deploy nunca se generaba. Esto lo corrige en cada arranque (idempotente), asi
    prod queda al dia al redesplegar sin tocar la DB a mano. Best-effort."""
    from sqlalchemy import text

    try:
        engine = _get_engine()
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE human_decisions DROP CONSTRAINT IF EXISTS chk_human_decisions_status"
            ))
            await conn.execute(text(
                "ALTER TABLE human_decisions ADD CONSTRAINT chk_human_decisions_status "
                "CHECK (status IN ('pending','approved','rejected','superseded'))"
            ))
    except Exception as exc:  # noqa: BLE001 - nunca bloquear el arranque
        import logging
        logging.getLogger("db.init").warning("ensure_constraints failed: %s", exc)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    _get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        yield session

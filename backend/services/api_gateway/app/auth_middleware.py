"""Sprint 3: middleware Bearer auth opcional en gateway.

Cuando AUTH_ENFORCE=true (prod) requiere Bearer token valido en todos los
endpoints EXCEPTO la whitelist publica (login, register, health, metrics,
preview, webhooks). En dev (AUTH_ENFORCE=false) deja pasar sin token pero
si llega uno lo decodifica e inyecta `request.state.user` para que el
endpoint lo use si quiere.
"""
from __future__ import annotations

import os

import httpx
from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Paths publicos (no requieren token aunque AUTH_ENFORCE=true)
PUBLIC_PATHS = {
    "/",
    "/health",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/auth/login",
    "/auth/register",
    "/auth/verify",
    "/services/status",
    "/integrations/status",
}

# Prefijos publicos (webhooks de proveedores externos validados por HMAC)
PUBLIC_PREFIXES = (
    "/webhooks/",
    "/uploads/",
)


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(p) for p in PUBLIC_PREFIXES)


def _auth_enforced() -> bool:
    return os.environ.get("AUTH_ENFORCE", "false").lower() == "true"


class BearerAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, auth_service_url: str) -> None:
        super().__init__(app)
        self.auth_service_url = auth_service_url.rstrip("/")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if _is_public(path):
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        token = ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()

        enforced = _auth_enforced()

        if not token:
            if enforced:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Missing Bearer token"},
                )
            return await call_next(request)

        # Validar token contra auth_service
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(f"{self.auth_service_url}/auth/verify", params={"token": token})
                if r.status_code != 200:
                    if enforced:
                        return JSONResponse(status_code=401, content={"detail": "Invalid token"})
                else:
                    data = r.json()
                    request.state.user = data.get("claims") or {"sub": data.get("subject")}
        except Exception:
            if enforced:
                return JSONResponse(status_code=503, content={"detail": "auth service unreachable"})

        return await call_next(request)

"""Core bundle - auth, user, conversation, notification, audit, memory, policy, ml.

Cada servicio se monta como sub-app bajo su prefijo. El gateway, cuando
BUNDLE_MODE=true, apunta a este bundle con los prefijos.

Rutas resultantes:
  /auth/*          -> auth_service
  /user/*          -> user_service
  /conversation/*  -> conversation_service
  /notification/*  -> notification_service
  /audit/*         -> audit_service
  /memory/*        -> memory_service
  /policy/*        -> policy_service
  /ml/*            -> ml_service
  /health          -> health del bundle
"""
from __future__ import annotations

from fastapi import FastAPI

from services.auth_service.app.main import app as auth_app
from services.user_service.app.main import app as user_app
from services.conversation_service.app.main import app as conversation_app
from services.notification_service.app.main import app as notification_app
from services.audit_service.app.main import app as audit_app
from services.memory_service.app.main import app as memory_app
from services.policy_service.app.main import app as policy_app
from services.ml_service.app.main import app as ml_app

app = FastAPI(title="ScrumDev AI - Core Bundle", version="1.0.0")

app.mount("/auth", auth_app)
app.mount("/user", user_app)
app.mount("/conversation", conversation_app)
app.mount("/notification", notification_app)
app.mount("/audit", audit_app)
app.mount("/memory", memory_app)
app.mount("/policy", policy_app)
app.mount("/ml", ml_app)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "bundle": "core",
        "services": ["auth", "user", "conversation", "notification", "audit", "memory", "policy", "ml"],
    }

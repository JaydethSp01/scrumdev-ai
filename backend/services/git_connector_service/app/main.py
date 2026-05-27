"""Git Connector (GitHub REST API).

Permite consultar repo, listar branches, crear branch, crear commit (via blob+tree),
crear PR. Sin token: solo metadatos basicos via API publica si el repo es publico.
"""
from __future__ import annotations

import base64
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from services.git_connector_service.app.repo_publisher import ensure_repo, push_files
from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("git-connector-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Git Connector", version="0.2.0")
instrument_app(app, "git-connector-service")


class PublishRequest(BaseModel):
    repo_name: str
    description: str = ""
    private: bool = True
    files: list[dict]
    commit_message: str = "feat: ScrumDev AI generated artifacts"
    branch: str = "main"


@app.post("/publish")
async def publish_artifacts(req: PublishRequest) -> dict:
    """Crea repo (si no existe) y publica los archivos en main.

    Si no se puede crear, retorna 200 con error+message+manual_create_url para que
    el frontend muestre instrucciones claras (no rompe el flujo con un 5xx).
    """
    repo = await ensure_repo(req.repo_name, req.description, req.private)
    if "error" in repo:
        return {"repo": repo, "push": None, "needs_user_action": True}
    result = await push_files(req.repo_name, req.files, req.branch, req.commit_message)
    return {
        "repo": repo,
        "push": result,
    }


class BranchCreate(BaseModel):
    name: str
    from_ref: str = "main"


class FileCommit(BaseModel):
    branch: str
    path: str
    content: str
    message: str


class PullRequestCreate(BaseModel):
    title: str
    head: str
    base: str = "main"
    body: str = ""


def _configured() -> bool:
    """Para deploy/publish basta con token + owner. SCRUMDEV_GIT_REPO solo se
    requiere para los endpoints /repo, /branches, /pulls que apuntan a 1 repo fijo."""
    return bool(settings.scrumdev_git_token and settings.scrumdev_git_owner)


def _headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.scrumdev_git_token:
        headers["Authorization"] = f"Bearer {settings.scrumdev_git_token}"
    return headers


def _repo_url() -> str:
    return f"https://api.github.com/repos/{settings.scrumdev_git_owner}/{settings.scrumdev_git_repo}"


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "git-connector-service",
        "configured": _configured(),
        "provider": settings.scrumdev_git_provider,
        "repo": f"{settings.scrumdev_git_owner}/{settings.scrumdev_git_repo}"
        if _configured()
        else None,
    }


@app.get("/repo")
async def repo() -> dict:
    if not settings.scrumdev_git_owner or not settings.scrumdev_git_repo:
        return {"mock": True, "configured": False}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(_repo_url(), headers=_headers())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.get("/branches")
async def branches() -> dict:
    if not _configured():
        return {"mock": True, "branches": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{_repo_url()}/branches", headers=_headers())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"branches": response.json()}


@app.post("/branches")
async def create_branch(req: BranchCreate) -> dict:
    if not _configured():
        return {"mock": True, "branch": req.name, "from": req.from_ref}
    async with httpx.AsyncClient(timeout=15.0) as client:
        ref_resp = await client.get(
            f"{_repo_url()}/git/ref/heads/{req.from_ref}", headers=_headers()
        )
        if ref_resp.status_code >= 400:
            raise HTTPException(status_code=ref_resp.status_code, detail=ref_resp.text)
        sha = ref_resp.json()["object"]["sha"]
        create_resp = await client.post(
            f"{_repo_url()}/git/refs",
            json={"ref": f"refs/heads/{req.name}", "sha": sha},
            headers=_headers(),
        )
        if create_resp.status_code >= 400:
            raise HTTPException(status_code=create_resp.status_code, detail=create_resp.text)
        return create_resp.json()


@app.post("/commits")
async def commit_file(req: FileCommit) -> dict:
    if not _configured():
        return {"mock": True, **req.model_dump()}
    async with httpx.AsyncClient(timeout=30.0) as client:
        existing = await client.get(
            f"{_repo_url()}/contents/{req.path}",
            params={"ref": req.branch},
            headers=_headers(),
        )
        sha = existing.json().get("sha") if existing.status_code == 200 else None
        payload: dict[str, Any] = {
            "message": req.message,
            "content": base64.b64encode(req.content.encode()).decode(),
            "branch": req.branch,
        }
        if sha:
            payload["sha"] = sha
        response = await client.put(
            f"{_repo_url()}/contents/{req.path}", json=payload, headers=_headers()
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.post("/pulls")
async def create_pr(req: PullRequestCreate) -> dict:
    if not _configured():
        return {"mock": True, **req.model_dump()}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{_repo_url()}/pulls",
            json={"title": req.title, "head": req.head, "base": req.base, "body": req.body},
            headers=_headers(),
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


# --- Webhook GitHub (T1 §78 - eventos push/pr/release) ---
import hashlib  # noqa: E402
import hmac  # noqa: E402

from fastapi import Header, Request  # noqa: E402

from shared.events.domain_events import DomainEvent  # noqa: E402
from shared.events.event_bus import event_bus  # noqa: E402
from shared.observability.metrics import instrument_app


def _verify_signature(secret: str, body: bytes, signature: str | None) -> bool:
    """Verifica X-Hub-Signature-256 (HMAC-SHA256 hex con prefix sha256=)."""
    if not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: str | None = Header(None),
    x_hub_signature_256: str | None = Header(None),
) -> dict:
    """Recibe webhooks de GitHub. Valida HMAC con GITHUB_WEBHOOK_SECRET."""
    raw = await request.body()
    secret = getattr(settings, "github_webhook_secret", None) or ""
    if secret and not _verify_signature(secret, raw, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="invalid HMAC signature")

    import json as _json

    try:
        body = _json.loads(raw or b"{}")
    except Exception:
        body = {}

    repo_full_name = (body.get("repository") or {}).get("full_name")
    ref = body.get("ref")
    sender = (body.get("sender") or {}).get("login")
    project_key = (repo_full_name or "").split("/")[-1].upper().replace("-", "_") if repo_full_name else None

    await event_bus.publish(
        DomainEvent(
            event_type=f"github.{x_github_event or 'unknown'}",
            source_service="git-connector-service",
            correlation_id=f"github-{repo_full_name or 'na'}-{ref or 'na'}",
            project_key=project_key,
            payload={
                "github_event": x_github_event,
                "repo": repo_full_name,
                "ref": ref,
                "sender": sender,
                "action": body.get("action"),
            },
        )
    )
    logger.info("github_webhook_received", gh_event=x_github_event, repo=repo_full_name)
    return {"received": True, "event": x_github_event, "repo": repo_full_name}

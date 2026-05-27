"""Connector Jira (Cloud REST API v3).

Sin credenciales: responde mock para no romper el flujo. Con credenciales:
realiza llamadas reales con Basic Auth (email + API token).
"""
from __future__ import annotations

import base64
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from shared.config.settings import settings
from shared.observability import configure_logging, get_logger
from shared.observability.metrics import instrument_app

configure_logging("jira-connector-service", debug=settings.app_debug)
logger = get_logger(__name__)

app = FastAPI(title=f"{settings.app_name} - Jira Connector", version="0.1.0")
instrument_app(app, "jira-connector-service")


class JiraIssueCreate(BaseModel):
    summary: str
    description: str = ""
    issue_type: str = "Story"
    labels: list[str] = []
    assignee_account_id: str | None = None


class JiraIssueUpdate(BaseModel):
    summary: str | None = None
    description: str | None = None
    labels: list[str] | None = None


class JiraComment(BaseModel):
    body: str


def _ok() -> bool:
    return bool(
        settings.scrumdev_jira_base_url
        and settings.scrumdev_jira_email
        and settings.scrumdev_jira_api_token
    )


def _auth() -> dict[str, str]:
    raw = f"{settings.scrumdev_jira_email}:{settings.scrumdev_jira_api_token}".encode()
    return {
        "Authorization": f"Basic {base64.b64encode(raw).decode()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _base() -> str:
    return settings.scrumdev_jira_base_url.rstrip("/")


def _adf(text: str) -> dict:
    """Atlassian Document Format minimo para descripciones plain text."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text or ""}]}
        ],
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "jira-connector-service",
        "configured": _ok(),
        "project_key": settings.scrumdev_jira_project_key,
    }


@app.post("/issues")
async def create_issue(req: JiraIssueCreate) -> dict:
    if not _ok():
        logger.info("jira_mock_create", summary=req.summary)
        return {
            "mock": True,
            "key": f"{settings.scrumdev_jira_project_key}-MOCK",
            "summary": req.summary,
        }
    payload = {
        "fields": {
            "project": {"key": settings.scrumdev_jira_project_key},
            "summary": req.summary,
            "description": _adf(req.description),
            "issuetype": {"name": req.issue_type},
        }
    }
    if req.labels:
        payload["fields"]["labels"] = req.labels
    if req.assignee_account_id:
        payload["fields"]["assignee"] = {"accountId": req.assignee_account_id}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(f"{_base()}/rest/api/3/issue", json=payload, headers=_auth())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.get("/issues/{issue_key}")
async def get_issue(issue_key: str) -> dict:
    if not _ok():
        return {"mock": True, "key": issue_key, "summary": "(mock issue)"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{_base()}/rest/api/3/issue/{issue_key}", headers=_auth())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.put("/issues/{issue_key}")
async def update_issue(issue_key: str, req: JiraIssueUpdate) -> dict:
    if not _ok():
        return {"mock": True, "key": issue_key, "updated": req.model_dump(exclude_none=True)}
    fields: dict[str, Any] = {}
    if req.summary is not None:
        fields["summary"] = req.summary
    if req.description is not None:
        fields["description"] = _adf(req.description)
    if req.labels is not None:
        fields["labels"] = req.labels
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.put(
            f"{_base()}/rest/api/3/issue/{issue_key}", json={"fields": fields}, headers=_auth()
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return {"updated": True, "key": issue_key}


@app.post("/issues/{issue_key}/comments")
async def add_comment(issue_key: str, req: JiraComment) -> dict:
    if not _ok():
        return {"mock": True, "key": issue_key, "body": req.body}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{_base()}/rest/api/3/issue/{issue_key}/comment",
            json={"body": _adf(req.body)},
            headers=_auth(),
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


@app.get("/projects/{project_key}/issues")
async def list_issues(project_key: str, max_results: int = 50) -> dict:
    if not _ok():
        return {"mock": True, "issues": []}
    jql = f'project = "{project_key}" ORDER BY created DESC'
    params = {"jql": jql, "maxResults": max_results}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{_base()}/rest/api/3/search", params=params, headers=_auth())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()


class JiraBulkRequest(BaseModel):
    project_key: str
    stories: list[dict]


async def _resolve_jira_project_key(client: httpx.AsyncClient, requested: str) -> str:
    """Si el project_key del request no existe en Jira, cae al de settings.

    Permite que ScrumDev AI use sus propios keys de proyecto (BARISTA, MU, ...)
    sin que el usuario tenga que crear esos proyectos en Jira a mano.
    """
    r = await client.get(f"{_base()}/rest/api/3/project/{requested}", headers=_auth())
    if r.status_code == 200:
        return requested
    fallback = settings.scrumdev_jira_project_key
    if fallback:
        return fallback
    return requested


@app.post("/issues/bulk")
async def create_issues_bulk(req: JiraBulkRequest) -> dict:
    """Crea N issues. Si no hay creds, devuelve mocks deterministicos.

    Si el project_key no existe en Jira, usa el SCRUMDEV_JIRA_PROJECT_KEY default.
    """
    results: list[dict] = []
    if not _ok():
        for i, s in enumerate(req.stories, 1):
            results.append({
                "story_key": s.get("story_key"),
                "issue_key": f"{req.project_key}-{i}",
                "mock": True,
            })
        return {"created": len(results), "results": results}
    async with httpx.AsyncClient(timeout=30.0) as client:
        effective_pk = await _resolve_jira_project_key(client, req.project_key)
        for s in req.stories:
            payload = {
                "fields": {
                    "project": {"key": effective_pk},
                    "summary": s.get("title", "Untitled"),
                    "description": _adf(s.get("description", "")),
                    "issuetype": {"name": "Story"},
                    "labels": s.get("labels", []),
                }
            }
            r = await client.post(f"{_base()}/rest/api/3/issue", json=payload, headers=_auth())
            if r.status_code >= 400:
                results.append({"story_key": s.get("story_key"), "error": r.text})
            else:
                results.append({"story_key": s.get("story_key"), "issue_key": r.json().get("key")})
    return {"created": len(results), "results": results, "jira_project_used": effective_pk}


# --- Webhooks Jira (T1 §78 - columna vertebral event-driven) ---
from fastapi import Header, Request  # noqa: E402

from shared.events.domain_events import DomainEvent  # noqa: E402
from shared.events.event_bus import event_bus  # noqa: E402
from shared.observability.metrics import instrument_app


@app.post("/webhooks/jira")
async def jira_webhook(request: Request, x_atlassian_webhook_secret: str | None = Header(None)) -> dict:
    """Recibe webhooks de Jira Cloud. Valida secret y publica DomainEvent.

    Para registrar el webhook en Jira: Settings -> System -> Webhooks -> Create.
    URL: https://<tu-host>/jira/webhooks/jira  (proxiado por gateway)
    Secret: lo configuras en JIRA_WEBHOOK_SECRET de tu .env.
    """
    expected = getattr(settings, "jira_webhook_secret", None) or ""
    if expected and x_atlassian_webhook_secret != expected:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    body = await request.json()
    event_name = body.get("webhookEvent", "unknown")
    issue = body.get("issue") or {}
    issue_key = issue.get("key")
    project_key = (issue.get("fields") or {}).get("project", {}).get("key")

    await event_bus.publish(
        DomainEvent(
            event_type=f"jira.{event_name}",
            source_service="jira-connector-service",
            correlation_id=f"jira-{issue_key or 'na'}",
            project_key=project_key,
            issue_key=issue_key,
            payload={
                "webhook_event": event_name,
                "issue_key": issue_key,
                "summary": (issue.get("fields") or {}).get("summary"),
                "status": ((issue.get("fields") or {}).get("status") or {}).get("name"),
            },
        )
    )
    logger.info("jira_webhook_received", jira_event=event_name, issue_key=issue_key)
    return {"received": True, "event": event_name, "issue_key": issue_key}

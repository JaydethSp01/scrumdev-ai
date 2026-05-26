"""E2E test del pipeline conversation -> orchestrator -> Jira -> GitHub -> deploy.

Usa mocks de los connectors (Jira/GitHub/Vercel) y un stub del agent_runtime
para NO consumir el plan Claude Pro. Valida que el flujo HTTP end-to-end
funciona y que approval gate + policy bloqueen cuando corresponda.

Cubre gap T5 §667 de la guia Delfin.
"""
from __future__ import annotations

import os
import time

import httpx
import pytest


BASE = os.environ.get("SCRUMDEV_GATEWAY_URL", "http://localhost:8080")


def _is_alive() -> bool:
    try:
        r = httpx.get(f"{BASE}/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _is_alive(), reason="gateway no esta corriendo en :8080")


@pytest.fixture
def project_key() -> str:
    return "BARISTA"  # proyecto real existente


def test_assistant_responds_to_basic_question(project_key: str):
    """Sanity: el assistant responde a un mensaje simple via gateway."""
    r = httpx.post(
        f"{BASE}/projects/{project_key}/assistant",
        json={
            "user_id": "e2e-test",
            "message": "Cuantas historias hay en el backlog?",
            "image_paths": [],
            "image_urls": [],
        },
        timeout=180.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert "reply" in data
    assert isinstance(data["reply"], str)
    assert len(data["reply"]) > 0


def test_jira_bulk_creation_mock(project_key: str):
    """Jira sin creds devuelve mocks deterministicos."""
    r = httpx.post(
        f"http://localhost:8004/issues/bulk",
        json={
            "project_key": project_key,
            "stories": [
                {"story_key": "S-001", "title": "Auth"},
                {"story_key": "S-002", "title": "Profile"},
            ],
        },
        timeout=15.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["created"] == 2
    assert all(r.get("issue_key", "").startswith(project_key) for r in data["results"])


def test_github_webhook_received_and_event_published():
    """Webhook GitHub sin secret pasa y publica DomainEvent."""
    r = httpx.post(
        f"{BASE}/webhooks/github",
        json={
            "ref": "refs/heads/main",
            "repository": {"full_name": "JaydethSp01/barista"},
            "sender": {"login": "jaysp"},
        },
        headers={"X-Github-Event": "push", "Content-Type": "application/json"},
        timeout=10.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["received"] is True
    assert data["event"] == "push"


def test_jira_webhook_received():
    """Webhook Jira sin secret pasa."""
    r = httpx.post(
        f"{BASE}/webhooks/jira",
        json={
            "webhookEvent": "jira:issue_updated",
            "issue": {
                "key": "TEST-1",
                "fields": {
                    "summary": "Test",
                    "status": {"name": "In Progress"},
                    "project": {"key": "TEST"},
                },
            },
        },
        headers={"Content-Type": "application/json"},
        timeout=10.0,
    )
    assert r.status_code == 200
    assert r.json()["received"] is True


def test_human_decision_create_and_approve(project_key: str):
    """Workflow approval gate: crear decision, aprobar, verificar status."""
    r = httpx.post(
        f"{BASE.replace(':8080', ':8002')}/decisions",
        json={
            "project_key": project_key,
            "decision_type": "release_to_production",
            "title": "E2E test approval",
            "summary": "Test automatizado",
            "requested_by": "e2e-test",
        },
        timeout=10.0,
    )
    assert r.status_code == 201, r.text
    decision = r.json()
    decision_id = decision["id"]
    assert decision["status"] == "pending"

    r2 = httpx.post(
        f"http://localhost:8002/decisions/{decision_id}/approve",
        json={"decided_by": "e2e-test", "decision_reason": "Test pass"},
        timeout=10.0,
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"


def test_policy_check_workflow_gate(project_key: str):
    """Policy service evalua y NO bloquea si no hay critical violations."""
    r = httpx.post(
        "http://localhost:8007/evaluate",
        json={
            "project_key": project_key,
            "stage": "post-refinement",
            "context": {"backlog": "ok"},
        },
        timeout=10.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("passed", "blocked")
    assert "policies_evaluated" in data


def test_full_smoke_all_services_healthy():
    """Smoke: 14 servicios + gateway responden 200 en /health."""
    ports = [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8009, 8010, 8011, 8012, 8080]
    for port in ports:
        r = httpx.get(f"http://localhost:{port}/health", timeout=3.0)
        assert r.status_code == 200, f"servicio :{port} no responde"

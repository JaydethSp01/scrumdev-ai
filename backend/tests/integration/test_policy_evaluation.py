"""Tests del policy_service contra politicas YAML reales."""
from fastapi.testclient import TestClient

from services.policy_service.app.main import app

client = TestClient(app)


def test_lists_four_policies():
    response = client.get("/policies")
    assert response.status_code == 200
    policies = response.json()["policies"]
    assert "architecture-policy" in policies
    assert "twelve-factor-policy" in policies
    assert "security-policy" in policies
    assert "quality-gates" in policies


def test_get_policy_returns_yaml_parsed():
    response = client.get("/policies/architecture-policy")
    assert response.status_code == 200
    data = response.json()
    assert "rules" in data
    assert any(r["id"] == "no_business_logic_in_controllers" for r in data["rules"])


def test_evaluate_detects_hardcoded_secret():
    response = client.post(
        "/policy/evaluate",
        json={
            "project_key": "T",
            "artifact_type": "code",
            "content": 'api_key = "sk-prod-secret-12345"',
            "policies": ["twelve-factor-policy"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert any(v["rule"] == "hardcoded_secrets_forbidden" for v in body["violations"])


def test_evaluate_passes_clean_code():
    response = client.post(
        "/policy/evaluate",
        json={
            "project_key": "T",
            "artifact_type": "code",
            "content": "from os import getenv\napi_key = getenv('API_KEY')",
            "policies": ["twelve-factor-policy"],
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "passed"


def test_evaluate_detects_sql_injection():
    response = client.post(
        "/policy/evaluate",
        json={
            "project_key": "T",
            "artifact_type": "code",
            "content": 'query = f"SELECT * FROM users WHERE id={user_id}"',
            "policies": ["security-policy"],
        },
    )
    body = response.json()
    assert body["status"] == "failed"
    assert any(v["rule"] == "owasp_injection" for v in body["violations"])

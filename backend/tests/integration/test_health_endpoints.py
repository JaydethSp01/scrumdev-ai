"""Verifica que las FastAPI apps cargan y exponen /health correctamente."""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    "module_path,expected_service",
    [
        ("services.api_gateway.app.main:app", "api-gateway"),
        ("services.policy_service.app.main:app", "policy-service"),
        ("services.memory_service.app.main:app", "memory-service"),
        ("services.deploy_connector_service.app.main:app", "deploy-connector-service"),
        ("services.git_connector_service.app.main:app", "git-connector-service"),
        ("services.jira_connector_service.app.main:app", "jira-connector-service"),
    ],
)
def test_health_returns_ok(module_path: str, expected_service: str) -> None:
    module_name, attr = module_path.split(":")
    module = __import__(module_name, fromlist=[attr])
    app = getattr(module, attr)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == expected_service

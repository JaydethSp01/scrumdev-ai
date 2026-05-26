"""Healthchecks de los servicios nuevos (auth, user, notification, ml)."""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    "module_path,expected_service",
    [
        ("services.auth_service.app.main:app", "auth-service"),
        ("services.user_service.app.main:app", "user-service"),
        ("services.notification_service.app.main:app", "notification-service"),
        ("services.ml_service.app.main:app", "ml-service"),
    ],
)
def test_new_services_health(module_path: str, expected_service: str) -> None:
    module_name, attr = module_path.split(":")
    module = __import__(module_name, fromlist=[attr])
    app = getattr(module, attr)
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == expected_service

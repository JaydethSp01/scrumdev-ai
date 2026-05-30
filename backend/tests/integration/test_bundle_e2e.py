"""E2E en modo BUNDLE (4 procesos). Todo via gateway :8080.

A diferencia de test_e2e_pipeline (que asumia 14 puertos individuales), este
solo necesita el gateway. Cubre las features del rework: clasificador,
sprints, pipeline 14 fases, intake por industria, circuit breaker.
"""
from __future__ import annotations

import os

import httpx
import pytest

GW = os.environ.get("SCRUMDEV_GATEWAY_URL", "http://localhost:8080")


def _alive() -> bool:
    try:
        return httpx.get(f"{GW}/health", timeout=2.0).status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _alive(), reason="gateway no esta en :8080")


def test_gateway_health():
    r = httpx.get(f"{GW}/health", timeout=3.0)
    assert r.status_code == 200


def test_integrations_status():
    r = httpx.get(f"{GW}/integrations/status", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    # claude + openai configurados
    assert data["claude_code"]["configured"] is True
    assert "vercel" in data


def test_product_classifier_software():
    """Inventario -> software real (no estatico)."""
    r = httpx.post(
        f"{GW.replace(':8080', ':8200')}/agent/product/classify",
        json={"vision": "Sistema de inventario con productos, proveedores y control de stock"},
        timeout=90.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_static"] is False
    assert data["type"] in ("saas_crud", "dashboard", "marketplace")
    assert len(data["entities"]) >= 2


def test_product_classifier_landing():
    """Landing -> estatico."""
    r = httpx.post(
        f"{GW.replace(':8080', ':8200')}/agent/product/classify",
        json={"vision": "Una landing page informativa para mi portafolio personal"},
        timeout=90.0,
    )
    assert r.status_code == 200
    assert r.json()["is_static"] is True


def test_pipeline_14_phases():
    r = httpx.get(f"{GW}/projects/BARISTA/pipeline", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 14
    gates = [p["gate_n"] for p in data["phases"] if p.get("human_gate")]
    assert sorted(g for g in gates if g) == [1, 2, 3, 4]


def test_sprints_board():
    r = httpx.get(f"{GW}/projects/BARISTA/sprints", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    assert "sprints" in data
    assert "unassigned" in data


def test_intake_industries():
    r = httpx.get(f"{GW}/intake/industries", timeout=10.0)
    assert r.status_code == 200
    inds = r.json()["industries"]
    assert any(i["id"] == "restaurante" for i in inds)
    assert any(i["id"] == "manufactura" for i in inds)


def test_intake_form_dynamic():
    """Form de industria genera campos especificos."""
    r = httpx.post(
        f"{GW}/intake/form",
        json={"industry": "retail", "product_hint": "tienda de ropa"},
        timeout=90.0,
    )
    assert r.status_code == 200
    data = r.json()
    assert "fields" in data
    assert len(data["fields"]) >= 3
    # cada field tiene id, label, type
    for f in data["fields"]:
        assert "id" in f and "label" in f and "type" in f


def test_circuit_breaker_no_crash():
    """El gateway con circuit breaker sigue respondiendo a multiples requests."""
    for _ in range(5):
        r = httpx.get(f"{GW}/projects/BARISTA/state", timeout=10.0)
        assert r.status_code == 200

"""Tests de los pipelines ML que no requieren cargar el embedder real."""
import pytest

from services.ml_service.app.pipelines.risk_extractor import extract_risks


def test_extract_risks_finds_payment_high_risk():
    result = extract_risks("Como cliente quiero pagar con tarjeta Stripe en el checkout")
    assert result["overall_risk"] in {"medium", "high"}
    types = [r["type"] for r in result["risks"]]
    assert "financial" in types


def test_extract_risks_finds_auth_risk():
    result = extract_risks(
        "Login con email y password con MFA via OAuth tokens y JWT."
    )
    types = [r["type"] for r in result["risks"]]
    assert "auth" in types
    assert result["count"] >= 1


def test_extract_risks_minimal_for_trivial():
    result = extract_risks("cambiar color del boton a azul")
    assert result["overall_risk"] in {"minimal", "low"}


def test_extract_risks_dedupes_by_type():
    """Aunque haya multiples keywords del mismo tipo, no se duplican."""
    result = extract_risks(
        "Pago con tarjeta y otro pago via stripe y un checkout adicional"
    )
    types = [r["type"] for r in result["risks"]]
    assert len(types) == len(set(types))

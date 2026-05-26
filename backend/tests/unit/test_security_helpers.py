from shared.security.jwt import create_access_token, decode_token
from shared.security.passwords import hash_password, verify_password


def test_password_hash_and_verify():
    h = hash_password("super-secret-123")
    assert h != "super-secret-123"
    assert verify_password("super-secret-123", h) is True
    assert verify_password("wrong", h) is False


def test_jwt_roundtrip():
    token = create_access_token("user-123", {"email": "u@example.com"})
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["email"] == "u@example.com"
    assert "exp" in payload


def test_jwt_invalid_raises():
    import pytest

    with pytest.raises(ValueError):
        decode_token("definitely.not.a.valid.jwt")

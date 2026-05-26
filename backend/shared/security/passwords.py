from __future__ import annotations

from passlib.context import CryptContext

# pbkdf2_sha256 es puro-Python, no depende de bcrypt nativo, evita conflictos de
# version entre passlib 1.7.4 y bcrypt 4+/5+ (donde se elimino __about__).
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _pwd.verify(password, hashed)
    except Exception:
        return False

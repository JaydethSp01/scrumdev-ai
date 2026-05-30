"""Circuit Breaker - patron de resiliencia para llamadas entre servicios.

Cuando un servicio downstream falla N veces seguidas, el breaker ABRE y
rechaza llamadas inmediatamente (sin esperar timeout) durante un cooldown.
Despues prueba con UNA llamada (half-open); si pasa, CIERRA.

Previene cascadas: si el deploy_connector cae, no todas las requests se
quedan colgadas esperando timeout.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

from shared.observability import get_logger

logger = get_logger(__name__)


class State(str, Enum):
    CLOSED = "closed"      # normal
    OPEN = "open"          # rechaza rapido
    HALF_OPEN = "half_open"  # probando


class CircuitOpenError(Exception):
    """Se levanta cuando el breaker esta abierto."""


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    cooldown_seconds: float = 15.0
    _state: State = State.CLOSED
    _failures: int = 0
    _opened_at: float = 0.0

    # Reloj inyectable para tests (evita time.time directo)
    _now: object = field(default=time.monotonic)

    def _clock(self) -> float:
        return self._now()  # type: ignore

    def allow(self) -> bool:
        """True si se permite la llamada."""
        if self._state == State.CLOSED:
            return True
        if self._state == State.OPEN:
            if self._clock() - self._opened_at >= self.cooldown_seconds:
                self._state = State.HALF_OPEN
                logger.info("breaker_half_open", name=self.name)
                return True
            return False
        # HALF_OPEN: permitir 1 prueba
        return True

    def record_success(self) -> None:
        if self._state in (State.HALF_OPEN, State.OPEN):
            logger.info("breaker_closed", name=self.name)
        self._state = State.CLOSED
        self._failures = 0

    def record_failure(self) -> None:
        self._failures += 1
        if self._state == State.HALF_OPEN:
            self._open()
        elif self._failures >= self.failure_threshold:
            self._open()

    def _open(self) -> None:
        self._state = State.OPEN
        self._opened_at = self._clock()
        logger.warning("breaker_open", name=self.name, failures=self._failures)

    @property
    def state(self) -> str:
        return self._state.value


# Registro global de breakers por host
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(key: str) -> CircuitBreaker:
    if key not in _breakers:
        _breakers[key] = CircuitBreaker(name=key)
    return _breakers[key]


def breakers_status() -> dict[str, str]:
    return {k: b.state for k, b in _breakers.items()}

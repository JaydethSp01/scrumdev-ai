"""Cliente HTTP entre servicios con Circuit Breaker (patron resiliencia).

Cada host tiene su breaker. Si un servicio downstream cae, el breaker abre y
rechaza rapido (sin colgar) durante el cooldown, evitando cascadas.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from shared.clients.circuit_breaker import CircuitOpenError, get_breaker


def _host_key(url: str) -> str:
    try:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"
    except Exception:
        return url


async def post_json(url: str, payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    breaker = get_breaker(_host_key(url))
    if not breaker.allow():
        raise CircuitOpenError(f"circuit open for {_host_key(url)}")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            breaker.record_success()
            return response.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout):
        breaker.record_failure()
        raise
    except httpx.HTTPStatusError as exc:
        # 5xx cuenta como fallo del servicio; 4xx no (es del request)
        if exc.response.status_code >= 500:
            breaker.record_failure()
        else:
            breaker.record_success()
        raise


async def get_json(url: str, timeout: float = 10.0) -> dict[str, Any]:
    breaker = get_breaker(_host_key(url))
    if not breaker.allow():
        raise CircuitOpenError(f"circuit open for {_host_key(url)}")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            breaker.record_success()
            return response.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout):
        breaker.record_failure()
        raise
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code >= 500:
            breaker.record_failure()
        else:
            breaker.record_success()
        raise

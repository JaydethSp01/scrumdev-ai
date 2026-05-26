"""Prometheus metrics helpers para todos los servicios.

Cada servicio FastAPI puede llamar `instrument_app(app, service_name)` para
exponer `/metrics` con metricas estandar de FastAPI (requests, latencia,
in_progress) y custom counters.
"""
from __future__ import annotations

import time
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)


def instrument_app(app: FastAPI, service_name: str) -> None:
    registry = CollectorRegistry()
    requests_total = Counter(
        "http_requests_total",
        "Total HTTP requests",
        ["service", "method", "path", "status"],
        registry=registry,
    )
    latency = Histogram(
        "http_request_duration_seconds",
        "Request duration in seconds",
        ["service", "method", "path"],
        registry=registry,
    )
    inflight = Gauge(
        "http_requests_in_progress",
        "Requests currently being served",
        ["service"],
        registry=registry,
    )

    @app.middleware("http")
    async def _middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]):
        if request.url.path == "/metrics":
            return await call_next(request)
        start = time.perf_counter()
        inflight.labels(service_name).inc()
        try:
            response: Response = await call_next(request)
            status = response.status_code
        except Exception:
            status = 500
            raise
        finally:
            elapsed = time.perf_counter() - start
            inflight.labels(service_name).dec()
            path = request.scope.get("route").path if request.scope.get("route") else request.url.path
            requests_total.labels(service_name, request.method, path, str(status)).inc()
            latency.labels(service_name, request.method, path).observe(elapsed)
        return response

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(content=generate_latest(registry), media_type=CONTENT_TYPE_LATEST)

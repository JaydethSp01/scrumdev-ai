"""Tests del path Temporal real (gap de fidelidad con el taller 3/5).

Verifica que cuando TEMPORAL_ENABLED=true el orchestrator arranca un workflow
DURABLE de verdad (client.start_workflow sobre SoftwareDeliveryWorkflow) y que
cuando esta deshabilitado cae honestamente a None (-> HTTP directo). No requiere
un broker Temporal vivo: se mockea el cliente.
"""
from __future__ import annotations

# asyncio_mode=auto (pyproject) -> las funciones async test corren sin marca.


async def test_temporal_enabled_starts_real_workflow(monkeypatch):
    from services.orchestrator_service.app import temporal_client as tc

    calls: dict = {}

    class FakeHandle:
        async def result(self):
            return {"workflow": "completed", "crew_result": {"success": True, "output": "ok"}}

    class FakeClient:
        async def start_workflow(self, wf, cmd, id=None, task_queue=None):
            calls["wf"] = getattr(wf, "__qualname__", str(wf))
            calls["id"] = id
            calls["task_queue"] = task_queue
            calls["crew_name"] = cmd.crew_name
            calls["correlation_id"] = cmd.correlation_id
            return FakeHandle()

    async def fake_connect(host, namespace=None):
        calls["connected_host"] = host
        return FakeClient()

    import temporalio.client as tclient

    monkeypatch.setattr(tclient.Client, "connect", fake_connect)
    monkeypatch.setattr(tc.settings, "temporal_enabled", True)
    tc._client = None  # resetea el cache de conexion

    result = await tc.start_workflow("refinement", {"project_key": "X"}, "corr-1")

    # arranco un workflow Temporal REAL (no fallback disfrazado)
    assert result == {"workflow": "completed", "crew_result": {"success": True, "output": "ok"}}
    assert "SoftwareDeliveryWorkflow" in calls["wf"]
    assert calls["id"] == "wf-corr-1"
    assert calls["task_queue"] == tc.settings.temporal_task_queue
    assert calls["crew_name"] == "refinement"
    assert calls["correlation_id"] == "corr-1"
    tc._client = None  # limpia para no contaminar otros tests


async def test_temporal_disabled_returns_none(monkeypatch):
    from services.orchestrator_service.app import temporal_client as tc

    monkeypatch.setattr(tc.settings, "temporal_enabled", False)
    tc._client = None
    # deshabilitado -> None honesto (el orchestrator cae a HTTP directo)
    assert await tc.start_workflow("refinement", {}, "corr-x") is None


async def test_temporal_connect_failure_falls_back(monkeypatch):
    from services.orchestrator_service.app import temporal_client as tc

    async def boom(host, namespace=None):
        raise ConnectionError("no broker")

    import temporalio.client as tclient

    monkeypatch.setattr(tclient.Client, "connect", boom)
    monkeypatch.setattr(tc.settings, "temporal_enabled", True)
    tc._client = None
    # broker caido -> None (no revienta; el orchestrator usa HTTP)
    assert await tc.start_workflow("refinement", {}, "corr-y") is None
    tc._client = None

"""Tests unitarios de los patrones de diseño (no requieren servicios)."""
from __future__ import annotations


def test_circuit_breaker_opens_after_threshold():
    from shared.clients.circuit_breaker import CircuitBreaker
    cb = CircuitBreaker("t", failure_threshold=3, cooldown_seconds=999)
    assert cb.allow()
    cb.record_failure()
    cb.record_failure()
    assert cb.allow()  # aun cerrado (2 < 3)
    cb.record_failure()
    assert not cb.allow()  # abierto
    assert cb.state == "open"


def test_circuit_breaker_half_open_after_cooldown():
    times = [0.0]
    from shared.clients.circuit_breaker import CircuitBreaker
    cb = CircuitBreaker("t2", failure_threshold=1, cooldown_seconds=10)
    cb._now = lambda: times[0]  # type: ignore
    cb.record_failure()
    assert not cb.allow()
    times[0] = 11.0  # pasar cooldown
    assert cb.allow()  # half-open
    cb.record_success()
    assert cb.state == "closed"


def test_circuit_breaker_recovers_on_success():
    from shared.clients.circuit_breaker import CircuitBreaker
    cb = CircuitBreaker("t3", failure_threshold=2)
    cb.record_failure()
    cb.record_success()  # reset
    cb.record_failure()
    assert cb.allow()  # 1 fallo, aun cerrado


def test_llm_factory_resolves_providers():
    from services.agent_runtime_service.app.runtime.llm_factory import get_llm
    assert get_llm("claude_code").name == "claude_code"
    assert get_llm("openai").name == "openai"
    # default fallback
    assert get_llm("inexistente").name == "claude_code"


def test_llm_factory_register():
    from services.agent_runtime_service.app.runtime.llm_factory import (
        get_llm, register_provider,
    )

    class FakeProvider:
        name = "fake"
        async def complete(self, *a, **k):
            return "ok"

    register_provider("fake", FakeProvider())
    assert get_llm("fake").name == "fake"


def test_pipeline_has_14_phases_and_4_gates():
    from services.orchestrator_service.app.project_pipeline import PHASES, build_pipeline_view
    assert len(PHASES) == 14
    gates = [p.get("gate_n") for p in PHASES if p.get("human_gate")]
    assert sorted(g for g in gates if g) == [1, 2, 3, 4]
    view = build_pipeline_view("BACKLOG")
    assert view["current_index"] == 0
    assert view["phases"][0]["status"] == "current"


def test_deploy_validator_fixes_missing_exports():
    from services.orchestrator_service.app.deploy_validator import validate_and_fix
    files = [
        {"path": "app/page.tsx", "content": "import { FOO_MOCK, type Bar } from '@/lib/mock'; export default function P(){return null}"},
        {"path": "lib/mock.ts", "content": "export const X = [];"},
        {"path": "next.config.mjs", "content": "export default {}"},
    ]
    fixed, report = validate_and_fix(files)
    mock = [f for f in fixed if f["path"] == "lib/mock.ts"][0]["content"]
    assert "export const FOO_MOCK" in mock
    assert "export type Bar = any" in mock
    assert report["stack"] == "nextjs"


def test_deploy_validator_detects_stack():
    from services.orchestrator_service.app.deploy_validator import detect_stack
    assert detect_stack([{"path": "app/page.tsx", "content": ""}]) == "nextjs"
    assert detect_stack([{"path": "vite.config.ts", "content": ""}, {"path": "package.json", "content": ""}]) == "vite-react"
    assert detect_stack([{"path": "index.html", "content": ""}]) == "static"

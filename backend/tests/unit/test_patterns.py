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


def test_deploy_validator_creates_missing_css():
    """Regresion: layout.tsx importa ./globals.css faltante -> deploy fallaba
    con 'Module not found'. El validador debe crearlo."""
    from services.orchestrator_service.app.deploy_validator import validate_and_fix
    files = [
        {"path": "app/layout.tsx", "content": "import './globals.css';\nexport default function L(){return null}"},
        {"path": "app/page.tsx", "content": "export default function P(){return null}"},
        {"path": "tailwind.config.ts", "content": "export default {content:[]}"},
        {"path": "next.config.mjs", "content": "export default {}"},
    ]
    fixed, report = validate_and_fix(files)
    css = [f for f in fixed if f["path"] == "app/globals.css"]
    assert css, "globals.css deberia haberse creado"
    assert "@tailwind base" in css[0]["content"]


def test_blueprint_picks_stack_and_splits_tiers():
    from shared.stacks.stack_blueprints import pick_stack, split_by_tier, get_blueprint
    assert pick_stack({"type": "saas_crud", "is_static": False}) == "nextjs-fastapi-postgres"
    assert pick_stack({"type": "landing", "is_static": True}) == "nextjs-static"
    files = [
        {"path": "frontend/app/page.tsx", "content": "x"},
        {"path": "backend/main.py", "content": "from fastapi import FastAPI\napp=FastAPI()"},
        {"path": "api/index.py", "content": "y"},  # sin prefijo -> backend por contenido
    ]
    buckets = split_by_tier(files, "nextjs-fastapi-postgres")
    assert "app/page.tsx" in [f["path"] for f in buckets["frontend"]]
    assert "main.py" in [f["path"] for f in buckets["backend"]]


def test_completeness_gate_blocks_incomplete():
    from services.ml_service.app.pipelines.stack_expert import score_completeness
    # casi vacio -> no deploy_ready
    poor = score_completeness([{"path": "frontend/app/page.tsx"}], "nextjs-fastapi-postgres")
    assert poor["deploy_ready"] is False
    assert poor["global_score"] < 0.5


def test_manifest_backfill_makes_deploy_ready():
    from services.agent_runtime_service.app.runtime.app_generator import _ensure_manifest_complete
    from services.ml_service.app.pipelines.stack_expert import score_completeness
    files = [{"path": "frontend/app/login/page.tsx", "content": "x"}]
    filled, report = _ensure_manifest_complete(files, "nextjs-fastapi-postgres", "DEMO")
    assert len(report) >= 10
    sc = score_completeness(filled, "nextjs-fastapi-postgres")
    assert sc["deploy_ready"] is True


def test_detect_stack_from_files():
    from services.orchestrator_service.app.deploy_split import detect_stack_from_files, render_url_for
    assert detect_stack_from_files([{"path": "backend/main.py"}]) == "nextjs-fastapi-postgres"
    assert detect_stack_from_files([{"path": "frontend/app/page.tsx"}]) == "nextjs-static"
    assert render_url_for("demo-api") == "https://demo-api.onrender.com"


def test_backend_build_gate_catches_errors():
    from services.orchestrator_service.app.build_gate import build_gate_backend
    ok = build_gate_backend([{"path": "main.py", "content": "from fastapi import FastAPI\napp=FastAPI()"}])
    assert ok["ok"] is True
    bad = build_gate_backend([{"path": "main.py", "content": "def x(:\n pass"}])
    assert bad["ok"] is False


def test_deploy_validator_detects_stack():
    from services.orchestrator_service.app.deploy_validator import detect_stack
    assert detect_stack([{"path": "app/page.tsx", "content": ""}]) == "nextjs"
    assert detect_stack([{"path": "vite.config.ts", "content": ""}, {"path": "package.json", "content": ""}]) == "vite-react"
    assert detect_stack([{"path": "index.html", "content": ""}]) == "static"

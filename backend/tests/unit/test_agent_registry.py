from services.agent_runtime_service.app.runtime.agent_registry import AgentRegistry


def test_register_and_get() -> None:
    registry = AgentRegistry()
    registry.register("dummy", {"role": "test"})
    assert registry.get("dummy") == {"role": "test"}
    assert registry.get("missing") is None


def test_list_agents_returns_registered() -> None:
    registry = AgentRegistry()
    registry.register("a", 1)
    registry.register("b", 2)
    assert set(registry.list_agents()) == {"a", "b"}

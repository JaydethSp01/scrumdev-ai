import pytest

from services.agent_runtime_service.app.runtime.agent_executor import AgentExecutor


@pytest.mark.asyncio
async def test_unknown_crew_raises() -> None:
    executor = AgentExecutor()
    with pytest.raises(ValueError):
        await executor.run_crew("does-not-exist", {"story": "x"})


@pytest.mark.asyncio
async def test_missing_input_raises() -> None:
    executor = AgentExecutor()
    with pytest.raises(ValueError):
        await executor.run_crew("refinement", {})

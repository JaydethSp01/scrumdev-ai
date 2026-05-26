from __future__ import annotations

import asyncio
from typing import Any

from shared.config.settings import settings
from shared.observability import get_logger

logger = get_logger(__name__)


class AgentExecutor:
    """Despacha la ejecucion de crews al runtime configurado.

    SCRUMDEV_AI_PROVIDER=claude_code  -> usa Claude Code SDK (plan Pro/Max)
    SCRUMDEV_AI_PROVIDER=anthropic    -> usa CrewAI + Anthropic API
    SCRUMDEV_AI_PROVIDER=openai       -> usa CrewAI + OpenAI API
    """

    async def run_crew(self, crew_name: str, inputs: dict[str, Any]) -> str:
        if crew_name not in {"refinement", "architecture", "delivery"}:
            raise ValueError(f"crew '{crew_name}' no esta registrado")

        primary_input = inputs.get("story") or inputs.get("requirements") or inputs.get("message")
        if not primary_input:
            raise ValueError("inputs.story o inputs.requirements o inputs.message es obligatorio")

        provider = (settings.scrumdev_ai_provider or "claude_code").lower()
        logger.info("crew_kickoff_start", crew=crew_name, provider=provider)

        if provider == "claude_code":
            result = await self._run_with_claude_code(crew_name, primary_input)
        else:
            result = await self._run_with_crewai(crew_name, primary_input)

        logger.info("crew_kickoff_done", crew=crew_name, provider=provider)
        return result

    @staticmethod
    async def _run_with_claude_code(crew_name: str, primary_input: str) -> str:
        from services.agent_runtime_service.app.crews.claude_code_crews import (
            run_architecture,
            run_delivery,
            run_refinement,
        )

        runners = {
            "refinement": run_refinement,
            "architecture": run_architecture,
            "delivery": run_delivery,
        }
        return await runners[crew_name](primary_input)

    @staticmethod
    async def _run_with_crewai(crew_name: str, primary_input: str) -> str:
        from services.agent_runtime_service.app.crews.architecture_crew import (
            build_architecture_crew,
        )
        from services.agent_runtime_service.app.crews.delivery_crew import build_delivery_crew
        from services.agent_runtime_service.app.crews.refinement_crew import (
            build_refinement_crew,
        )

        builders = {
            "refinement": build_refinement_crew,
            "architecture": build_architecture_crew,
            "delivery": build_delivery_crew,
        }
        crew = builders[crew_name](primary_input)
        result = await asyncio.to_thread(crew.kickoff)
        if hasattr(result, "raw") and result.raw:
            return str(result.raw)
        if hasattr(result, "output") and result.output:
            return str(result.output)
        return str(result)

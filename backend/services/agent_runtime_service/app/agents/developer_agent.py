from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_developer_agent() -> Agent:
    return Agent(
        role="Software Developer",
        goal=(
            "Generar plan de implementacion y esqueleto de codigo limpio y mantenible, "
            "alineado con la arquitectura propuesta."
        ),
        backstory=(
            "Developer senior fullstack con foco en backend Python/FastAPI y buenas "
            "practicas SOLID. Escribes codigo legible primero, optimizas despues."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

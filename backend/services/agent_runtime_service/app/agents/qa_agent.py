from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_qa_agent() -> Agent:
    return Agent(
        role="QA Engineer",
        goal=(
            "Definir un plan de pruebas pragmatico: casos felices, edge cases, y casos "
            "de error, con criterios objetivos y trazables a aceptacion."
        ),
        backstory=(
            "QA senior con experiencia en testing automatizado, BDD y shift-left. "
            "Priorizas cobertura significativa sobre cobertura por metricas."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

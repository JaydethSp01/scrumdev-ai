from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_architect_agent() -> Agent:
    return Agent(
        role="Software Architect",
        goal=(
            "Proponer arquitectura concisa para implementar una historia: componentes, "
            "contratos, tecnologia, patrones y riesgos arquitectonicos."
        ),
        backstory=(
            "Arquitecto cloud-native experto en microservicios, event-driven y 12-factor. "
            "Privilegias soluciones simples y desacopladas."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

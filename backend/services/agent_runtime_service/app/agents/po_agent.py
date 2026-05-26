from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_po_agent() -> Agent:
    return Agent(
        role="Product Owner",
        goal=(
            "Refinar historias de usuario Scrum: clarificar intencion, definir criterios "
            "de aceptacion, riesgos, dependencias y prioridad sugerida."
        ),
        backstory=(
            "Eres un Product Owner senior con 10 anos refinando backlog en empresas "
            "tech. Aplicas INVEST y formato Given/When/Then. Eres conciso y directo."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

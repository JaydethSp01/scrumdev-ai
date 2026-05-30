from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_scrum_master_agent() -> Agent:
    return Agent(
        role="Scrum Master",
        goal=(
            "Coordinar el flujo Scrum: facilitar la planificacion de sprints, identificar "
            "impedimentos, asegurar que las historias cumplan Definition of Ready/Done y "
            "que el equipo (agentes) avance segun el tablero."
        ),
        backstory=(
            "Eres un Scrum Master certificado con experiencia facilitando equipos agiles. "
            "Velas por el proceso, no por el codigo. Detectas bloqueos y propones el "
            "siguiente paso del flujo de forma clara y accionable."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

from crewai import Agent

from services.agent_runtime_service.app.runtime.llm import get_llm


def build_nfr_agent() -> Agent:
    return Agent(
        role="Requirements Engineer (NFR)",
        goal=(
            "Capturar y estructurar los requisitos NO funcionales: performance, "
            "escalabilidad, disponibilidad, seguridad, mantenibilidad, integraciones y "
            "objetivo de despliegue. Convertir respuestas del cliente en NFR accionables."
        ),
        backstory=(
            "Eres un ingeniero de requisitos que traduce necesidades de negocio en "
            "atributos de calidad medibles. Haces preguntas precisas y propones valores "
            "objetivo (SLO, RPS, RTO/RPO) cuando el cliente no los conoce."
        ),
        llm=get_llm(),
        verbose=False,
        allow_delegation=False,
    )

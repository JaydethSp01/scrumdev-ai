from crewai import Crew, Process, Task

from services.agent_runtime_service.app.runtime.bootstrap import get_registry


def build_architecture_crew(requirements: str) -> Crew:
    registry = get_registry()
    architect = registry.get("architect_agent")

    task = Task(
        description=(
            "Disena una arquitectura concisa para los siguientes requerimientos:\n\n"
            f"{requirements}\n\n"
            "Devuelve en markdown:\n"
            "1. Componentes principales y sus responsabilidades.\n"
            "2. Tecnologias propuestas (con justificacion breve).\n"
            "3. Diagrama tipo ASCII de bloques.\n"
            "4. Contratos clave (endpoints, eventos, esquemas).\n"
            "5. Riesgos arquitectonicos y mitigaciones."
        ),
        expected_output="Markdown con arquitectura propuesta, contratos y riesgos.",
        agent=architect,
    )

    return Crew(
        agents=[architect],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

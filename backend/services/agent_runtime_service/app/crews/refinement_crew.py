from crewai import Crew, Process, Task

from services.agent_runtime_service.app.runtime.bootstrap import get_registry


def build_refinement_crew(story: str) -> Crew:
    registry = get_registry()
    po_agent = registry.get("po_agent")

    task = Task(
        description=(
            "Refina la siguiente historia de usuario:\n\n"
            f"{story}\n\n"
            "Devuelve en markdown:\n"
            "1. Historia reescrita en formato 'Como <rol> quiero <accion> para <beneficio>'.\n"
            "2. Criterios de aceptacion en Given/When/Then (3 a 5 escenarios).\n"
            "3. Definicion de hecho (DoD) sugerida.\n"
            "4. Riesgos y dependencias.\n"
            "5. Estimacion en story points (Fibonacci) con justificacion."
        ),
        expected_output="Markdown con historia refinada, AC, DoD, riesgos y estimacion.",
        agent=po_agent,
    )

    return Crew(
        agents=[po_agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

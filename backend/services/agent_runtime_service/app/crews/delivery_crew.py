"""Crew completo de entrega: PO -> Architect -> Developer -> QA -> Security."""
from crewai import Crew, Process, Task

from services.agent_runtime_service.app.runtime.bootstrap import get_registry


def build_delivery_crew(story: str) -> Crew:
    registry = get_registry()
    po = registry.get("po_agent")
    architect = registry.get("architect_agent")
    developer = registry.get("developer_agent")
    qa = registry.get("qa_agent")
    security = registry.get("security_agent")

    refine_task = Task(
        description=(
            f"Refina la historia: {story}\n"
            "Entrega: historia reescrita, criterios de aceptacion (3-5), DoD."
        ),
        expected_output="Historia refinada con AC y DoD en markdown.",
        agent=po,
    )

    arch_task = Task(
        description=(
            "Disena la arquitectura para implementar la historia refinada del paso anterior. "
            "Entrega componentes, contratos y diagrama ASCII."
        ),
        expected_output="Arquitectura concisa en markdown.",
        agent=architect,
        context=[refine_task],
    )

    dev_task = Task(
        description=(
            "A partir de la arquitectura, genera un plan de implementacion paso a paso y "
            "un esqueleto de codigo del componente principal (lenguaje a elegir segun "
            "arquitectura). Maximo 80 lineas de codigo."
        ),
        expected_output="Plan + esqueleto de codigo en bloques markdown.",
        agent=developer,
        context=[refine_task, arch_task],
    )

    qa_task = Task(
        description=(
            "Define el plan de pruebas para la historia: casos felices, edge cases y "
            "errores, mapeados a los criterios de aceptacion."
        ),
        expected_output="Plan de pruebas en tabla markdown.",
        agent=qa,
        context=[refine_task, arch_task],
    )

    sec_task = Task(
        description=(
            "Revisa la historia y la arquitectura. Identifica riesgos de seguridad "
            "relevantes (OWASP Top 10 aplicable) y controles minimos a implementar."
        ),
        expected_output="Lista de riesgos y controles en markdown.",
        agent=security,
        context=[refine_task, arch_task, dev_task],
    )

    return Crew(
        agents=[po, architect, developer, qa, security],
        tasks=[refine_task, arch_task, dev_task, qa_task, sec_task],
        process=Process.sequential,
        verbose=False,
    )

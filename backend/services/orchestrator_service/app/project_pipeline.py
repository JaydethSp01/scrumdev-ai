"""Pipeline del proyecto - maquina de 14 fases (guia §7). FASE C.

Define las 14 fases en orden, qué agente/crew ejecuta cada una, qué artefacto
produce, y cuáles son los 4 GATES de aprobacion humana obligatoria.

A diferencia de state_machine.py (que es por-historia), esto trackea el
estado GLOBAL del proyecto para el flujo end-to-end del empresario.
"""
from __future__ import annotations

# Las 14 fases en orden, con metadata para la UI
PHASES: list[dict] = [
    {"state": "BACKLOG", "label": "Backlog", "actor": "PO Agent",
     "artifact": "Historias Scrum", "human_gate": False,
     "desc": "El PO Agent descompone la vision en historias priorizadas."},
    {"state": "REFINEMENT", "label": "Aprobar Product Backlog", "actor": "Humano (PO)",
     "artifact": "Backlog aprobado", "human_gate": True, "gate_n": 1,
     "desc": "APROBACION #1: revisas las historias con sus criterios de aceptacion; "
             "puedes modificar, priorizar o pedir cambios. Sin tu visto bueno del "
             "backlog NO se continua."},
    {"state": "NFR_CAPTURE", "label": "Definir requisitos NFR", "actor": "Humano (PO)",
     "artifact": "Requisitos no funcionales", "human_gate": True, "gate_n": 2,
     "desc": "APROBACION #2: defines performance, seguridad, escalabilidad y deployment. "
             "El Architect Agent los necesita para proponer la arquitectura."},
    {"state": "ARCHITECTURE_INCEPTION", "label": "Arquitectura", "actor": "Architect Agent",
     "artifact": "Propuesta de arquitectura + stack", "human_gate": False,
     "desc": "El Architect Agent propone estilo, DB, auth, stack segun NFR."},
    {"state": "ARCHITECTURE_APPROVAL_PENDING", "label": "Aprobar arquitectura",
     "actor": "Humano (PO)", "artifact": "ADR firmado", "human_gate": True,
     "gate_n": 3,
     "desc": "APROBACION #3: revisas y apruebas la arquitectura antes de generar codigo."},
    {"state": "READY_FOR_DEVELOPMENT", "label": "Listo para desarrollo",
     "actor": "Orchestrator", "artifact": "Sprints planificados", "human_gate": False,
     "desc": "Arquitectura aprobada. Se planifican los sprints."},
    {"state": "DEVELOPMENT", "label": "Desarrollo", "actor": "Developer Agent",
     "artifact": "Codigo + PR", "human_gate": False,
     "desc": "El Developer Agent genera el codigo del sprint activo."},
    {"state": "CODE_REVIEW", "label": "Code Review", "actor": "Code Review + Security Agent",
     "artifact": "Review + policy gate", "human_gate": False,
     "desc": "Agentes revisan patrones, seguridad y politicas."},
    {"state": "QA", "label": "QA", "actor": "QA Agent",
     "artifact": "Tests + evidencia", "human_gate": False,
     "desc": "El QA Agent ejecuta pruebas unitarias e integracion."},
    {"state": "PO_REVIEW", "label": "Aprobar evidencia (Sprint Review)", "actor": "Humano (PO)",
     "artifact": "Aceptacion PO", "human_gate": True, "gate_n": 4,
     "desc": "APROBACION #4: revisas la evidencia (codigo + tests + DoD) y aceptas el "
             "sprint o pides cambios (vuelve al backlog)."},
    {"state": "RELEASE_APPROVAL_PENDING", "label": "Aprobar release",
     "actor": "Humano (PO)", "artifact": "Aprobacion staging", "human_gate": True,
     "gate_n": 5,
     "desc": "APROBACION #5: apruebas el release a staging."},
    {"state": "STAGING_DEPLOYMENT", "label": "Deploy staging", "actor": "Deploy Connector",
     "artifact": "App en staging", "human_gate": False,
     "desc": "Se despliega a staging. QA valida el ambiente."},
    {"state": "PRODUCTION_DEPLOYMENT", "label": "Aprobar produccion",
     "actor": "Humano (PO)", "artifact": "App en produccion", "human_gate": True,
     "gate_n": 6,
     "desc": "APROBACION #6: apruebas el deploy a produccion (regla dura §27)."},
    {"state": "RELEASED", "label": "Released", "actor": "Sistema",
     "artifact": "Producto en vivo", "human_gate": False,
     "desc": "Producto desplegado y disponible."},
]

_STATE_ORDER = [p["state"] for p in PHASES]
_PHASE_BY_STATE = {p["state"]: p for p in PHASES}


def phase_index(state: str) -> int:
    try:
        return _STATE_ORDER.index(state)
    except ValueError:
        return 0


def next_phase(state: str) -> str | None:
    i = phase_index(state)
    if i + 1 < len(_STATE_ORDER):
        return _STATE_ORDER[i + 1]
    return None


def is_human_gate(state: str) -> bool:
    return _PHASE_BY_STATE.get(state, {}).get("human_gate", False)


# Accion automatica asociada a cada fase (lo que se dispara al ENTRAR a la fase).
# Mapea state -> nombre de accion que el orchestrator ejecuta.
PHASE_ACTION: dict[str, str] = {
    "BACKLOG": "generate_backlog",          # PO Agent genera historias
    "ARCHITECTURE_INCEPTION": "propose_architecture",  # Architect Agent
    "READY_FOR_DEVELOPMENT": "plan_sprints",  # planificar sprints
    "DEVELOPMENT": "generate_code",          # Developer Agent genera codigo del sprint
    "CODE_REVIEW": "run_policy_check",        # policy + security
    "QA": "run_qa",                          # QA Agent
    "STAGING_DEPLOYMENT": "deploy_staging",   # Deploy Connector
    "PRODUCTION_DEPLOYMENT": "deploy_production",  # Deploy Connector
}


def action_for(state: str) -> str | None:
    return PHASE_ACTION.get(state)


def build_pipeline_view(current_state: str) -> dict:
    """Devuelve las 14 fases con su status relativo al estado actual."""
    cur_idx = phase_index(current_state)
    phases = []
    for i, p in enumerate(PHASES):
        if i < cur_idx:
            status = "done"
        elif i == cur_idx:
            status = "current"
        else:
            status = "pending"
        phases.append({**p, "status": status, "index": i})
    return {
        "current_state": current_state,
        "current_index": cur_idx,
        "total": len(PHASES),
        "phases": phases,
        "is_gate": is_human_gate(current_state),
        "gate_n": _PHASE_BY_STATE.get(current_state, {}).get("gate_n"),
    }

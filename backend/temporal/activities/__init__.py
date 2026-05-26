"""Temporal activities - unidades reintentables del pipeline ScrumDev AI.

Cada activity es una llamada HTTP al microservicio responsable. Cuando un
workflow llama una activity y falla, Temporal reintenta segun la policy
declarada en el workflow.
"""
from services.agent_runtime_service.app.runtime.bootstrap import (  # noqa
    get_registry,
)

from .deploy_to_vercel import deploy_to_vercel
from .push_to_git import push_to_git
from .push_to_jira import push_to_jira
from .request_human_approval import request_human_approval
from .run_crew import run_crew_activity

__all__ = [
    "run_crew_activity",
    "push_to_jira",
    "push_to_git",
    "deploy_to_vercel",
    "request_human_approval",
]

"""Registra los agentes disponibles en el runtime."""
from __future__ import annotations

from functools import lru_cache

from services.agent_runtime_service.app.agents.architect_agent import build_architect_agent
from services.agent_runtime_service.app.agents.code_review_agent import build_code_review_agent
from services.agent_runtime_service.app.agents.developer_agent import build_developer_agent
from services.agent_runtime_service.app.agents.devops_agent import build_devops_agent
from services.agent_runtime_service.app.agents.nfr_agent import build_nfr_agent
from services.agent_runtime_service.app.agents.po_agent import build_po_agent
from services.agent_runtime_service.app.agents.qa_agent import build_qa_agent
from services.agent_runtime_service.app.agents.release_agent import build_release_agent
from services.agent_runtime_service.app.agents.scrum_master_agent import build_scrum_master_agent
from services.agent_runtime_service.app.agents.security_agent import build_security_agent
from services.agent_runtime_service.app.runtime.agent_registry import AgentRegistry


@lru_cache(maxsize=1)
def get_registry() -> AgentRegistry:
    registry = AgentRegistry()
    # 10 agentes de la guia Delfin (taller_3 / §8)
    registry.register("po_agent", build_po_agent())
    registry.register("scrum_master_agent", build_scrum_master_agent())
    registry.register("nfr_agent", build_nfr_agent())
    registry.register("architect_agent", build_architect_agent())
    registry.register("developer_agent", build_developer_agent())
    registry.register("code_review_agent", build_code_review_agent())
    registry.register("qa_agent", build_qa_agent())
    registry.register("security_agent", build_security_agent())
    registry.register("devops_agent", build_devops_agent())
    registry.register("release_agent", build_release_agent())
    return registry

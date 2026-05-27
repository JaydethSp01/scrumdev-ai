"""Adaptadores HTTP que implementan los Protocols de shared/contracts/connectors.

Cada adapter es un cliente delgado del microservicio correspondiente. El
orchestrator depende de los Protocol (Hexagonal: Dependency Inversion).
"""
from .vercel_adapter import VercelDeployAdapter
from .render_adapter import RenderDeployAdapter
from .neon_adapter import NeonDatabaseAdapter

__all__ = ["VercelDeployAdapter", "RenderDeployAdapter", "NeonDatabaseAdapter"]

"""Repository pattern - encapsula el acceso a datos.

En vez de `select(Model)` + `session.add/commit` esparcidos por cada endpoint,
los repositorios centralizan las queries de cada agregado. Esto:
- desacopla la logica de negocio del ORM
- facilita testing (mock del repo)
- evita queries duplicadas

Uso:
    async for session in get_session():
        repo = BacklogRepository(session)
        items = await repo.list_by_project("BARISTA")
"""
from .backlog_repository import BacklogRepository
from .chat_repository import ChatRepository
from .project_repository import ProjectRepository

__all__ = ["BacklogRepository", "ChatRepository", "ProjectRepository"]

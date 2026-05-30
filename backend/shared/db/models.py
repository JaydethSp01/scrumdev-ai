from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    issue_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    conversation_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    issue_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    crew_name: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    source_service: Mapped[str] = mapped_column(String(64))
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # FASE C: estado actual en la maquina de 14 fases (guia §7)
    workflow_state: Mapped[str] = mapped_column(String(48), default="BACKLOG", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(32), default="in_app")
    read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class MemoryItem(Base):
    """Memoria semantica usando pgvector. La columna embedding es opcional - si
    pgvector no esta disponible, se guarda solo el contenido y busqueda usa LIKE."""

    __tablename__ = "memory_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    namespace: Mapped[str] = mapped_column(String(128), index=True)
    content: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class BuildMemory(Base):
    """Memoria de builds para el Stack Expert (ML que aprende de cada deploy).

    Guarda, por cada proyecto generado+desplegado, la vision (+ su embedding),
    el stack elegido, el manifiesto de archivos por tier y el resultado real del
    build/deploy. Los builds EXITOSOS se recuperan como exemplars few-shot para
    guiar la generacion de proyectos similares futuros.

    El embedding se guarda como lista JSON (no requiere pgvector); la similitud
    se calcula en Python (coseno) en el ml_service. Mismo patron que MemoryItem.
    """

    __tablename__ = "build_memory"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    stack: Mapped[str] = mapped_column(String(64), index=True)
    vision: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(JSON, default=list)
    # manifiesto: {tier_name: [paths...]} de lo que efectivamente se genero
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    # resultado: build local OK por tier + deploy OK + urls
    success: Mapped[bool] = mapped_column(default=False)
    outcome: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class NFRCapture(Base):
    """Captura de requerimientos no funcionales por proyecto/historia."""

    __tablename__ = "nfr_captures"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    issue_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_id: Mapped[str] = mapped_column(String(128))
    nfr_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class HumanDecision(Base):
    """Decisiones que requieren aprobacion humana (architecture, release, etc)."""

    __tablename__ = "human_decisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    issue_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    decision_type: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    decided_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ArchitectureDecision(Base):
    """Architecture Decision Record persistido."""

    __tablename__ = "architecture_decisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    adr_number: Mapped[int] = mapped_column(default=1)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    context: Mapped[str] = mapped_column(Text)
    decision: Mapped[str] = mapped_column(Text)
    consequences: Mapped[str] = mapped_column(Text)
    markdown: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PolicyViolation(Base):
    """Violaciones de politicas detectadas por policy_service."""

    __tablename__ = "policy_violations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    artifact_type: Mapped[str] = mapped_column(String(64))
    artifact_reference: Mapped[str] = mapped_column(String(255))
    policy: Mapped[str] = mapped_column(String(128))
    rule: Mapped[str] = mapped_column(String(128))
    severity: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ProjectVision(Base):
    """Vision del producto descrita por el usuario startup."""

    __tablename__ = "project_visions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    vision: Mapped[str] = mapped_column(Text)
    target_users: Mapped[str | None] = mapped_column(Text, nullable=True)
    stack_preference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class BacklogItem(Base):
    """Historia Scrum del backlog generada por el PO Agent."""

    __tablename__ = "backlog_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    story_key: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    acceptance_criteria: Mapped[list] = mapped_column(JSON, default=list)
    story_points: Mapped[int] = mapped_column(default=3)
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    status: Mapped[str] = mapped_column(String(32), default="backlog", index=True)
    order_index: Mapped[int] = mapped_column(default=0)
    # FASE B: a que sprint pertenece (null = backlog sin asignar)
    sprint_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # ciclo de vida: a que version pertenece la tarea
    version_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # origen de la tarea: backlog | feature_request | bugfix
    origin: Mapped[str] = mapped_column(String(32), default="backlog")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ProjectVersion(Base):
    """Version de un proyecto. Concepto de ciclo de vida:

      Proyecto -> N Versiones -> N Sprints -> N Tareas (BacklogItem).

    v1 = lo que el cliente pidio inicialmente. Versiones nuevas se crean para
    cambios grandes y PARTEN del codigo de la version anterior (copy-forward).
    Cambios chicos / bugs se manejan como tareas dentro de la version activa.
    """

    __tablename__ = "project_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    number: Mapped[int] = mapped_column(default=1)  # v1, v2, v3...
    name: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text, default="")  # que agrega esta version
    # draft | active | released | archived
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    based_on_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    order_index: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Sprint(Base):
    """Sprint Scrum. El PO decide el orden y que historias entran. FASE B."""

    __tablename__ = "sprints"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    version_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    number: Mapped[int] = mapped_column(default=1)  # Sprint 1, 2, 3...
    name: Mapped[str] = mapped_column(String(255))
    goal: Mapped[str] = mapped_column(Text, default="")  # objetivo del sprint
    order_index: Mapped[int] = mapped_column(default=0)  # orden que el PO decide
    # planned | active | completed | cancelled
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    total_points: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class CodeArtifact(Base):
    """Archivo de codigo generado por el Dev Agent."""

    __tablename__ = "code_artifacts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    version_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    story_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    file_path: Mapped[str] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    git_branch: Mapped[str | None] = mapped_column(String(128), nullable=True)
    git_commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    git_pr_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class BuildRun(Base):
    """Ejecucion del pipeline 'generar sistema completo'."""

    __tablename__ = "build_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    triggered_by: Mapped[str] = mapped_column(String(128))
    stage: Mapped[str] = mapped_column(String(64), default="started")
    progress_percent: Mapped[int] = mapped_column(default=0)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BrandKit(Base):
    """Identidad visual del cliente: colores, fuente, logo. Uno por proyecto."""

    __tablename__ = "brand_kits"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    primary_color: Mapped[str] = mapped_column(String(16), default="#5b6cff")
    secondary_color: Mapped[str] = mapped_column(String(16), default="#10b981")
    accent_color: Mapped[str] = mapped_column(String(16), default="#f59e0b")
    background_color: Mapped[str] = mapped_column(String(16), default="#ffffff")
    text_color: Mapped[str] = mapped_column(String(16), default="#171717")
    font_family: Mapped[str] = mapped_column(String(64), default="Inter")
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tone: Mapped[str] = mapped_column(String(32), default="moderno")
    industry: Mapped[str | None] = mapped_column(String(64), nullable=True)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ProjectAsset(Base):
    """Imagen subida por el cliente con etiqueta para usarse en el generado."""

    __tablename__ = "project_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    asset_type: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(1024))
    alt_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    order_index: Mapped[int] = mapped_column(default=0)
    mime_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ChatSession(Base):
    """Un chat dentro de un proyecto. Un proyecto puede tener VARIOS chats, cada
    uno con su historial. Un chat puede atarse a una version (ej. chat dedicado a
    arreglar bugs de la v2) o ser general del proyecto.
    """

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    version_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Nuevo chat")
    # general | lifecycle | bugfix | feature
    kind: Mapped[str] = mapped_column(String(32), default="general")
    archived: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )


class ChatMessage(Base):
    """Mensaje del Chat IA del proyecto. Atado a project+user para privacidad."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    project_key: Mapped[str] = mapped_column(String(64), index=True)
    # a que chat pertenece el mensaje (un proyecto tiene varios chats)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    role: Mapped[str] = mapped_column(String(32))  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    image_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    action: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

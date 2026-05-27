from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "local"
    app_name: str = "ScrumDev AI"
    app_debug: bool = True

    api_gateway_port: int = 8080
    conversation_service_port: int = 8001
    orchestrator_service_port: int = 8002
    agent_runtime_service_port: int = 8003
    jira_connector_service_port: int = 8004
    git_connector_service_port: int = 8005
    deploy_connector_service_port: int = 8006
    policy_service_port: int = 8007
    memory_service_port: int = 8008
    audit_service_port: int = 8009
    notification_service_port: int = 8010
    auth_service_port: int = 8011
    user_service_port: int = 8012
    ml_service_port: int = 8013

    conversation_service_url: str = "http://localhost:8001"
    orchestrator_service_url: str = "http://localhost:8002"
    agent_runtime_service_url: str = "http://localhost:8003"
    jira_connector_service_url: str = "http://localhost:8004"
    git_connector_service_url: str = "http://localhost:8005"
    deploy_connector_service_url: str = "http://localhost:8006"
    policy_service_url: str = "http://localhost:8007"
    memory_service_url: str = "http://localhost:8008"
    audit_service_url: str = "http://localhost:8009"
    notification_service_url: str = "http://localhost:8010"
    auth_service_url: str = "http://localhost:8011"
    user_service_url: str = "http://localhost:8012"
    ml_service_url: str = "http://localhost:8013"

    ml_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    ml_enabled: bool = True
    ml_cache_dir: str = "./ml_cache"

    database_url: str = "postgresql+asyncpg://scrumdev:scrumdev@localhost:5432/scrumdev_ai"
    redis_url: str = "redis://localhost:6379/0"

    temporal_enabled: bool = False
    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "scrumdev-ai-task-queue"

    rabbitmq_enabled: bool = False
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"

    scrumdev_neon_api_key: str | None = None
    scrumdev_neon_org_id: str | None = None

    # OpenAI - hibrido con Claude Code (no reemplazo)
    openai_api_key: str | None = None
    openai_enabled: bool = False
    openai_model_fast: str = "gpt-4o-mini"
    openai_model_vision: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"

    scrumdev_jira_base_url: str | None = None
    scrumdev_jira_email: str | None = None
    scrumdev_jira_api_token: str | None = None
    scrumdev_jira_project_key: str = "SDAI"
    jira_webhook_secret: str | None = None
    issue_tracker_provider: str = "jira"  # jira | asana | linear | notion

    scrumdev_git_provider: str = "github"
    scrumdev_git_token: str | None = None
    scrumdev_git_owner: str | None = None
    scrumdev_git_repo: str | None = None
    github_webhook_secret: str | None = None
    version_control_provider: str = "github"  # github | gitlab | bitbucket

    scrumdev_ai_provider: str = "claude_code"
    scrumdev_ai_api_key: str | None = None
    scrumdev_ai_model: str = "claude-sonnet-4-6"
    claude_code_bin: str | None = None

    scrumdev_deploy_provider: str | None = "render"
    scrumdev_deploy_api_token: str | None = None

    vercel_token: str | None = None
    vercel_team_id: str | None = None

    jwt_secret_key: str = "change-me-in-production-please"
    jwt_algorithm: str = "HS256"

    cors_allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


settings = Settings()


# Failfast: en prod, NO permitir secrets default. Sprint 1.4.
_DEFAULT_JWT = "change-me-in-production-please"
if (settings.app_env or "").lower() in ("production", "prod"):
    if settings.jwt_secret_key == _DEFAULT_JWT or len(settings.jwt_secret_key or "") < 32:
        raise RuntimeError(
            "SECURITY: JWT_SECRET_KEY must be set to a strong random value in production. "
            "Generate one with: openssl rand -base64 64"
        )
    if not settings.github_webhook_secret or not settings.jira_webhook_secret:
        raise RuntimeError(
            "SECURITY: GITHUB_WEBHOOK_SECRET y JIRA_WEBHOOK_SECRET son obligatorios en production."
        )

from shared.config.settings import settings


def test_settings_defaults_load() -> None:
    assert settings.app_name
    assert isinstance(settings.api_gateway_port, int)
    assert settings.scrumdev_ai_provider in {"anthropic", "openai", "claude_code"}


def test_cors_origins_list_parses() -> None:
    assert isinstance(settings.cors_origins_list, list)
    assert all(o.startswith("http") for o in settings.cors_origins_list)

from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GEMINI_API_KEY: str = ""
    SLACK_BOT_TOKEN: str = ""
    SLACK_DEFAULT_CHANNEL: str = "#centro-soluciones-dev"
    ENVIRONMENT: str = "development"
    STORAGE_BACKEND: str = "local"
    GCS_BUCKET_NAME: str = ""
    MAX_UPLOAD_SIZE_MB: int = 10
    DANY_WEBHOOK_URL: str = "https://webhook.soyneto.com/webhook/dany-csn"
    CORS_ORIGINS: str = "http://localhost:4200,http://localhost:3000"

    # ── Sprint 3: token fijo que usa n8n para crear tickets desde Dany ──────
    # Genera uno con:  python -c "import secrets; print(secrets.token_hex(32))"
    # Ponlo también en el .env y en las credenciales de n8n
    DANY_SYSTEM_TOKEN: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = str(_ENV_FILE)


@lru_cache
def get_settings() -> Settings:
    return Settings()

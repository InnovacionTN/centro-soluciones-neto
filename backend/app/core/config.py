from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Ruta absoluta al .env — funciona sin importar desde dónde se lanza uvicorn
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GEMINI_API_KEY: str = ""
    SLACK_BOT_TOKEN: str = ""
    SLACK_DEFAULT_CHANNEL: str = "#centro-soluciones-dev"
    ENVIRONMENT: str = "development"   # development | staging | production
    STORAGE_BACKEND: str = "local"
    GCS_BUCKET_NAME: str = ""
    MAX_UPLOAD_SIZE_MB: int = 10
    DANY_WEBHOOK_URL: str = "https://webhook.soyneto.com/webhook/dany-csn"
    # CORS: lista separada por comas. En prod/staging Firebase Hosting hace rewrite
    # directo por lo que no se necesita el dominio del frontend — solo APIs externas.
    CORS_ORIGINS: str = "http://localhost:4200,http://localhost:3000"

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

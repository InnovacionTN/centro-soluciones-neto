from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GEMINI_API_KEY: str = ""
    SLACK_BOT_TOKEN: str = ""
    SLACK_DEFAULT_CHANNEL: str = "#centro-soluciones-dev"
    ENVIRONMENT: str = "development"
    # Almacenamiento de evidencias
    # "local" = carpeta uploads/ del proyecto (dev)
    # "gcs"   = Google Cloud Storage (prod)
    STORAGE_BACKEND: str = "local"
    GCS_BUCKET_NAME: str = ""
    MAX_UPLOAD_SIZE_MB: int = 10

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

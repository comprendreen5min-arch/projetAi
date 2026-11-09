from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Datalift API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Database configuration:
    # Par défaut, SQLite pour fonctionner immédiatement en local sans Docker ni serveur externe.
    # Pour PostgreSQL, définir DATABASE_URL ou les variables POSTGRES_* dans .env
    DATABASE_URL: Optional[str] = None
    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    POSTGRES_PORT: Optional[int] = 5432

    # Storage directory for Parquet artifacts
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage" / "datasets"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if self.POSTGRES_SERVER and self.POSTGRES_USER and self.POSTGRES_PASSWORD and self.POSTGRES_DB:
            return (
                f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
                f"{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        # SQLite zero-config par défaut
        return f"sqlite:///{self.BASE_DIR / 'datalift.db'}"


settings = Settings()
# Ensure storage directory exists
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

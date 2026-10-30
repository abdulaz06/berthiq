"""Application settings.

Single source of truth for runtime configuration. Values come from the process
environment and an optional per-machine `.env` at the repo root (gitignored).
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings loaded from env / `.env`.

    `.env` is resolved relative to the process working directory. Recipes run the
    backend from the repo root (uvicorn `--app-dir backend`), so the root `.env`
    is found; `env_file` also lists `.env` for running inside `backend/`.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "BerthIQ"
    APP_VERSION: str = "0.1.0"
    ENABLE_UPLOADS: bool = False
    DEMO_TTL_HOURS: int = 24
    JOB_TIMEOUT_SECONDS: int = Field(default=90, ge=1, le=120)

    # Native local Postgres. Overridden per-machine via `.env` (see .env.example).
    DATABASE_URL: str = "postgresql+psycopg2://postgres:CHANGE_ME@localhost:5432/berthiq"

    # Browser origins allowed to call the API (the Next.js dev server).
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()

"""Persistent single-process production API. Run migrations as a release step."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402
import uvicorn  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from app.config import settings  # noqa: E402
from app.services.prediction import load_default_model  # noqa: E402


def preflight() -> None:
    if not os.environ.get("DATABASE_URL"):
        raise ValueError("Production requires an explicit DATABASE_URL environment variable.")
    if (
        not os.environ.get("CORS_ORIGINS")
        or not settings.CORS_ORIGINS
        or any(
            not origin.startswith("https://") or "*" in origin for origin in settings.CORS_ORIGINS
        )
    ):
        raise ValueError("Set CORS_ORIGINS to your exact HTTPS frontend origins as a JSON list.")
    cfg = Config()
    cfg.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "app/db/migrations")
    )
    head = ScriptDirectory.from_config(cfg).get_current_head()
    engine = sa.create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 10})
    try:
        with engine.connect() as conn:
            if MigrationContext.configure(conn).get_current_revision() != head:
                raise ValueError("Database migrations are not current. Run the release command.")
            if not conn.scalar(sa.text("SELECT count(*) FROM datasets WHERE status = 'ready'")):
                raise ValueError("No ready dataset. Run scripts/prepare_demo.py.")
        load_default_model()
    finally:
        engine.dispose()


def main() -> int:
    try:
        preflight()
        port = int(os.environ.get("PORT", "8000"))
        if not 1 <= port <= 65535:
            raise ValueError("PORT must be between 1 and 65535.")
    except ValueError as exc:
        print(str(exc))
        return 1
    except Exception as exc:
        print(f"Production preflight failed ({type(exc).__name__}); inspect service configuration.")
        return 1
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,
        limit_concurrency=64,
        timeout_keep_alive=5,
        proxy_headers=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

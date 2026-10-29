"""Run pytest in an explicitly isolated PostgreSQL database, never the dev DB.

Uses TEST_DATABASE_URL if provided; otherwise derives berthiq_launch_test on the
configured server. Creates it if absent (requires CREATEDB locally); never drops
a database. Credentials are inherited in process memory and never printed.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import sqlalchemy as sa

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import settings  # noqa: E402


def main() -> int:
    configured = sa.engine.make_url(settings.DATABASE_URL)
    explicit = os.environ.get("TEST_DATABASE_URL")
    target = (
        sa.engine.make_url(explicit) if explicit else configured.set(database="berthiq_launch_test")
    )
    name = target.database or ""
    if not name.endswith("_test") or not name.replace("_", "").isalnum():
        raise SystemExit("Refusing test database: name must be alphanumeric and end in _test.")
    admin = sa.create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            sa.text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": name}
        )
        if not exists:
            conn.exec_driver_sql(f'CREATE DATABASE "{name}"')
    admin.dispose()
    env = os.environ.copy()
    env["DATABASE_URL"] = env["TEST_DATABASE_URL"] = target.render_as_string(hide_password=False)
    print(f"Running against isolated database {name}", flush=True)
    return subprocess.call([sys.executable, "-m", "pytest", *sys.argv[1:]], cwd=BACKEND, env=env)


if __name__ == "__main__":
    raise SystemExit(main())

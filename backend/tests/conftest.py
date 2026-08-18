"""Shared test fixtures.

DB-backed tests need a real PostgreSQL (the schema uses UUID/JSONB/native enums,
which SQLite can't stand in for). The test database URL is exactly
``settings.DATABASE_URL`` — the same source Alembic's env.py reads — so set
``DATABASE_URL`` in the environment to point tests at a throwaway database.
When no database is reachable the DB fixtures ``skip`` rather than fail, so the
suite stays green on a machine without Postgres configured; CI provides one.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from app.config import settings
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    """A session-wide engine, or skip the whole DB suite if none is reachable."""
    engine = sa.create_engine(settings.DATABASE_URL, future=True)
    try:
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
    except OperationalError as exc:
        engine.dispose()
        pytest.skip(f"No PostgreSQL reachable at DATABASE_URL ({exc.__class__.__name__}).")
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(scope="session")
def alembic_cfg() -> Config:
    """Alembic config pointed at this repo's migrations.

    The DB URL comes from env.py (which reads ``settings.DATABASE_URL``), so tests
    and migrations always target the same database.
    """
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "app" / "db" / "migrations"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return cfg


@pytest.fixture
def session(db_engine: Engine) -> Iterator[Session]:
    """A clean ORM-created schema + session, torn down after each test."""
    from app.db import Base

    Base.metadata.drop_all(db_engine)
    Base.metadata.create_all(db_engine)
    factory = sessionmaker(bind=db_engine, expire_on_commit=False, future=True)
    db = factory()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(db_engine)

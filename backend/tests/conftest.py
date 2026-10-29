"""Shared test fixtures.

DB-backed tests need a real PostgreSQL (the schema uses UUID/JSONB/native enums,
which SQLite can't stand in for). The test database URL is exactly
``settings.DATABASE_URL`` — the same source Alembic's env.py reads — so set
``DATABASE_URL`` in the environment to point tests at a throwaway database.
TEST_DATABASE_URL must explicitly match DATABASE_URL and name a disposable
database ending in _test. Unreachable databases fail; they never silently skip.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from app.config import settings
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def reference():
    from app.services.ingestion import port_config
    from app.services.planning import build_input

    sys.path.insert(0, str(BACKEND_DIR / "scripts"))
    import generate_dataset as g

    cfg = port_config()
    generated = g.generate(cfg)
    return build_input(list(generated.events), cfg, generated.window_end), cfg


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    """Fail closed before any destructive fixture can reach a non-test database."""
    explicit = os.environ.get("TEST_DATABASE_URL")
    database = sa.engine.make_url(settings.DATABASE_URL).database or ""
    if explicit != settings.DATABASE_URL or not database.endswith("_test"):
        pytest.fail(
            "DB tests require matching TEST_DATABASE_URL and DATABASE_URL, with a "
            "database name ending in _test. Use just test-backend."
        )
    engine = sa.create_engine(settings.DATABASE_URL, future=True)
    with engine.connect() as conn:
        conn.execute(sa.text("SELECT 1"))
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

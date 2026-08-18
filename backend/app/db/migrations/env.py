"""Alembic migration environment.

Reads the database URL from app settings (per-machine `.env`) rather than
alembic.ini, so the connection string is never committed. `target_metadata` is
wired to the ORM `Base.metadata` in M0-2, when the models exist; until then
autogenerate has nothing to diff, which is correct for the scaffold.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from app.config import settings
from app.db import Base
from app.db import models as _models  # noqa: F401 — registers tables on Base.metadata
from sqlalchemy import engine_from_config, pool

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate diffs against the ORM models. Importing app.db.models above is
# what populates Base.metadata with the tables/enums.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DBAPI connection (emits SQL)."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

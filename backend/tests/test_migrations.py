"""M0-2 acceptance: the first migration applies and rolls back cleanly."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

CORE_TABLES = {"datasets", "events", "cases", "jobs"}
ENUM_TYPES = {
    "dataset_source",
    "dataset_status",
    "case_outcome",
    "provenance",
    "job_type",
    "job_status",
}


def _enum_types(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(sa.text("SELECT typname FROM pg_type WHERE typtype = 'e'")).scalars()
        return set(rows)


def test_upgrade_then_downgrade_is_clean(db_engine: Engine, alembic_cfg: Config) -> None:
    # Start from a known-empty schema regardless of prior state.
    command.downgrade(alembic_cfg, "base")

    command.upgrade(alembic_cfg, "head")
    tables = set(sa.inspect(db_engine).get_table_names())
    assert CORE_TABLES <= tables, f"missing tables after upgrade: {CORE_TABLES - tables}"
    assert ENUM_TYPES <= _enum_types(db_engine), "missing enum types after upgrade"

    command.downgrade(alembic_cfg, "base")
    tables_after = set(sa.inspect(db_engine).get_table_names())
    assert not (CORE_TABLES & tables_after), "core tables survived downgrade"
    assert not (ENUM_TYPES & _enum_types(db_engine)), "enum types survived downgrade"

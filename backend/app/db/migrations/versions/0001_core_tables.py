"""M0-2: core tables (datasets, events, cases, jobs) + enums

Revision ID: 0001_core_tables
Revises:
Create Date: 2026-08-18

First migration. Creates the six enumerated types from docs/DATABASE.md §2
(sim_run_type arrives with the simulation tables) and the four M1 core tables
with their indexes. `provenance` has no column here yet — it is the tag the
later `kpis` table and the API contracts depend on, established once now.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_core_tables"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Enum types. `create_type=False` so table creation never re-emits CREATE TYPE;
# we create/drop them explicitly (below) to control ordering and to establish
# `provenance` even though no M0-2 table references it.
dataset_source = postgresql.ENUM(
    "builtin", "uploaded", "generated", name="dataset_source", create_type=False
)
dataset_status = postgresql.ENUM(
    "validating", "invalid", "ready", name="dataset_status", create_type=False
)
case_outcome = postgresql.ENUM("active", "on_time", "late", name="case_outcome", create_type=False)
provenance = postgresql.ENUM(
    "observed", "predicted", "simulated", "optimized", name="provenance", create_type=False
)
job_type = postgresql.ENUM(
    "discovery", "optimization", "simulation", name="job_type", create_type=False
)
job_status = postgresql.ENUM(
    "pending", "running", "succeeded", "failed", name="job_status", create_type=False
)

_ALL_ENUMS = (dataset_source, dataset_status, case_outcome, provenance, job_type, job_status)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in _ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "datasets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("source", dataset_source, nullable=False),
        sa.Column(
            "status", dataset_status, server_default=sa.text("'validating'"), nullable=False
        ),
        sa.Column("port_config", sa.Text(), nullable=True),
        sa.Column("seed", sa.BigInteger(), nullable=True),
        sa.Column("event_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("case_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("time_range_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_range_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_datasets"),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("activity", sa.Text(), nullable=False),
        sa.Column("start_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=True),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name="fk_events_dataset_id_datasets",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_events"),
    )
    op.create_index("idx_events_dataset_case", "events", ["dataset_id", "case_id", "seq"])
    op.create_index("idx_events_activity", "events", ["dataset_id", "activity"])

    op.create_table(
        "cases",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("current_stage", sa.Text(), nullable=True),
        sa.Column("first_event_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_berthing_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", case_outcome, nullable=False),
        sa.Column("rework_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("vessel_type", sa.Text(), nullable=True),
        sa.Column("loa", sa.Numeric(), nullable=True),
        sa.Column("draft", sa.Numeric(), nullable=True),
        sa.Column("cargo_type", sa.Text(), nullable=True),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name="fk_cases_dataset_id_datasets",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cases"),
        sa.UniqueConstraint("dataset_id", "case_id", name="uq_cases_dataset_case"),
    )
    op.create_index("idx_cases_active", "cases", ["dataset_id", "is_active"])

    op.create_table(
        "jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("job_type", job_type, nullable=False),
        sa.Column("status", job_status, server_default=sa.text("'pending'"), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scenario_id", sa.BigInteger(), nullable=True),
        sa.Column("progress", sa.Numeric(), server_default=sa.text("0"), nullable=False),
        sa.Column("result_type", sa.Text(), nullable=True),
        sa.Column("result_id", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name="fk_jobs_dataset_id_datasets",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_jobs"),
    )
    op.create_index("idx_jobs_status", "jobs", ["status"])


def downgrade() -> None:
    # Tables first (indexes drop with them), then the enum types in reverse.
    op.drop_table("jobs")
    op.drop_table("cases")
    op.drop_table("events")
    op.drop_table("datasets")

    bind = op.get_bind()
    for enum_type in reversed(_ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)

"""Immutable scenarios, analysis results and scoped uploads.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0003"
down_revision = "0002_process_models"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("owner_token", pg.UUID(as_uuid=True)))
    op.create_index("ix_datasets_owner_token", "datasets", ["owner_token"])
    op.create_table(
        "scenarios",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "dataset_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_token", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("spec", pg.JSONB(), nullable=False),
        sa.Column("snapshot", pg.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scenarios_owner_token", "scenarios", ["owner_token"])
    op.create_index("ix_scenarios_expires_at", "scenarios", ["expires_at"])
    op.create_foreign_key(
        "fk_jobs_scenario", "jobs", "scenarios", ["scenario_id"], ["id"], ondelete="CASCADE"
    )
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "scenario_id",
            sa.BigInteger(),
            sa.ForeignKey("scenarios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('optimization', 'simulation')", name="ck_run_kind"),
    )
    op.create_index("ix_analysis_runs_scenario_id", "analysis_runs", ["scenario_id"])


def downgrade() -> None:
    op.drop_table("analysis_runs")
    op.drop_constraint("fk_jobs_scenario", "jobs", type_="foreignkey")
    op.drop_table("scenarios")
    op.drop_index("ix_datasets_owner_token", table_name="datasets")
    op.drop_column("datasets", "owner_token")

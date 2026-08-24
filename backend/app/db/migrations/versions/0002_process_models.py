"""M1-04: process_models (cached discovery output)

Revision ID: 0002_process_models
Revises: 0001_core_tables
Create Date: 2026-08-24

The first derived table (docs/DATABASE.md §5.1). Holds one current discovered
:class:`ProcessModel` per dataset as four JSONB blobs (dfg, variants,
bottlenecks, metrics). UNIQUE on ``dataset_id`` so re-discovery replaces the row;
cascades from ``datasets``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_process_models"
down_revision: str | None = "0001_core_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "process_models",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dfg", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("variants", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("bottlenecks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name="fk_process_models_dataset_id_datasets",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_process_models"),
        sa.UniqueConstraint("dataset_id", name="uq_process_models_dataset"),
    )


def downgrade() -> None:
    op.drop_table("process_models")

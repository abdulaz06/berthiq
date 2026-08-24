"""SQLAlchemy models for the M1 core tables + the enumerated types.

Scope (M0-2): the four transactional/coordination tables the vertical slice is
built on — ``datasets``, ``events``, ``cases``, ``jobs`` — plus every enum from
``docs/DATABASE.md`` §2 except ``sim_run_type`` (arrives with the simulation
tables). ``provenance`` is created here even though no M0-2 table references it
yet: it is the load-bearing tag the ``kpis`` table (later milestone) and the API
contracts depend on, and it is cheaper to establish the type once, now.

Everything mirrors ``docs/DATABASE.md`` column-for-column. Large derived
artifacts stay as JSONB; the five core event fields are real columns.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.provenance import Provenance
from app.db.base import Base

__all__ = [
    "Provenance",
    "DatasetSource",
    "DatasetStatus",
    "CaseOutcome",
    "JobType",
    "JobStatus",
    "Dataset",
    "Event",
    "Case",
    "Job",
    "ProcessModelRow",
    "ALL_ENUMS",
]

# --- Enumerated types (docs/DATABASE.md §2) --------------------------------
# str-mixin so members serialize to their value; member name == value keeps the
# Python API and the Postgres labels identical.


class DatasetSource(str, enum.Enum):
    builtin = "builtin"
    uploaded = "uploaded"
    generated = "generated"


class DatasetStatus(str, enum.Enum):
    validating = "validating"
    invalid = "invalid"
    ready = "ready"


class CaseOutcome(str, enum.Enum):
    active = "active"
    on_time = "on_time"
    late = "late"


class JobType(str, enum.Enum):
    discovery = "discovery"
    optimization = "optimization"
    simulation = "simulation"


class JobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


def _pg_enum(py_enum: type[enum.Enum], name: str) -> sa.Enum:
    """A native Postgres ENUM whose labels are the member *values*."""
    return sa.Enum(
        py_enum,
        name=name,
        values_callable=lambda e: [m.value for m in e],
    )


# Shared type instances (referenced by columns; also created by the migration).
dataset_source_enum = _pg_enum(DatasetSource, "dataset_source")
dataset_status_enum = _pg_enum(DatasetStatus, "dataset_status")
case_outcome_enum = _pg_enum(CaseOutcome, "case_outcome")
provenance_enum = _pg_enum(Provenance, "provenance")
job_type_enum = _pg_enum(JobType, "job_type")
job_status_enum = _pg_enum(JobStatus, "job_status")

# Every enum type the schema owns, in dependency-free order. The migration
# creates/drops exactly this set so `provenance` (unused by an M0-2 table) is
# still established.
ALL_ENUMS: tuple[sa.Enum, ...] = (
    dataset_source_enum,
    dataset_status_enum,
    case_outcome_enum,
    provenance_enum,
    job_type_enum,
    job_status_enum,
)


# --- Transactional layer (docs/DATABASE.md §4) -----------------------------


class Dataset(Base):
    """The versioned root aggregate: an upload, a built-in, or a generator run."""

    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source: Mapped[DatasetSource] = mapped_column(dataset_source_enum, nullable=False)
    status: Mapped[DatasetStatus] = mapped_column(
        dataset_status_enum, nullable=False, server_default=DatasetStatus.validating.value
    )
    port_config: Mapped[str | None] = mapped_column(sa.Text)
    seed: Mapped[int | None] = mapped_column(sa.BigInteger)
    event_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    case_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    time_range_start: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    time_range_end: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    stats: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )

    events: Mapped[list[Event]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True
    )
    cases: Mapped[list[Case]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True
    )
    jobs: Mapped[list[Job]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", passive_deletes=True
    )


class Event(Base):
    """The raw event log — the ground truth everything else derives from."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    activity: Mapped[str] = mapped_column(sa.Text, nullable=False)
    start_ts: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    end_ts: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[str | None] = mapped_column(sa.Text)
    attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")
    )
    seq: Mapped[int | None] = mapped_column(sa.Integer)

    dataset: Mapped[Dataset] = relationship(back_populates="events")

    __table_args__ = (
        Index("idx_events_dataset_case", "dataset_id", "case_id", "seq"),
        Index("idx_events_activity", "dataset_id", "activity"),
    )


class Case(Base):
    """A derived-but-persisted per-call summary, rebuilt from ``events`` at ingest."""

    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False)
    current_stage: Mapped[str | None] = mapped_column(sa.Text)
    first_event_ts: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    last_event_ts: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    service_window_start: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    service_window_end: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    actual_berthing_ts: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    outcome: Mapped[CaseOutcome] = mapped_column(case_outcome_enum, nullable=False)
    rework_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    vessel_type: Mapped[str | None] = mapped_column(sa.Text)
    loa: Mapped[Decimal | None] = mapped_column(sa.Numeric)
    draft: Mapped[Decimal | None] = mapped_column(sa.Numeric)
    cargo_type: Mapped[str | None] = mapped_column(sa.Text)
    attributes: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")
    )

    dataset: Mapped[Dataset] = relationship(back_populates="cases")

    __table_args__ = (
        sa.UniqueConstraint("dataset_id", "case_id", name="uq_cases_dataset_case"),
        Index("idx_cases_active", "dataset_id", "is_active"),
    )


# --- Derived layer (docs/DATABASE.md §5) -----------------------------------


class ProcessModelRow(Base):
    """Cached discovery output — one current model per dataset (docs/DATABASE.md
    §5.1). Re-discovery replaces the row (UNIQUE on ``dataset_id``). The four
    JSONB blobs together serialize a :class:`app.schemas.ProcessModel`."""

    __tablename__ = "process_models"

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    dfg: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    variants: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    bottlenecks: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )

    dataset: Mapped[Dataset] = relationship()

    __table_args__ = (sa.UniqueConstraint("dataset_id", name="uq_process_models_dataset"),)


# --- Coordination layer (docs/DATABASE.md §7) ------------------------------


class Job(Base):
    """Every async operation (discovery / optimization / simulation) gets a row."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )
    job_type: Mapped[JobType] = mapped_column(job_type_enum, nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        job_status_enum, nullable=False, server_default=JobStatus.pending.value
    )
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE")
    )
    # `scenarios` doesn't exist yet (later milestone); the FK to it is added with
    # that table. The column is present now per the contract in DATABASE.md §7.1.
    scenario_id: Mapped[int | None] = mapped_column(sa.BigInteger)
    progress: Mapped[Decimal] = mapped_column(sa.Numeric, nullable=False, server_default="0")
    result_type: Mapped[str | None] = mapped_column(sa.Text)
    result_id: Mapped[str | None] = mapped_column(sa.Text)
    error: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
        onupdate=func.now(),
    )

    dataset: Mapped[Dataset | None] = relationship(back_populates="jobs")

    __table_args__ = (Index("idx_jobs_status", "status"),)

"""Database layer: SQLAlchemy models + session.

Public surface: the declarative ``Base``, the ORM models and their enums, and
the ``engine`` / ``SessionLocal`` / ``get_db`` session helpers. Alembic
migrations live under ``migrations/`` and import ``Base.metadata`` via env.py.
"""

from __future__ import annotations

from app.db.base import Base
from app.db.models import (
    ALL_ENUMS,
    Case,
    CaseOutcome,
    Dataset,
    DatasetSource,
    DatasetStatus,
    Event,
    Job,
    JobStatus,
    JobType,
    Provenance,
)
from app.db.session import SessionLocal, engine, get_db

__all__ = [
    "ALL_ENUMS",
    "Base",
    "Case",
    "CaseOutcome",
    "Dataset",
    "DatasetSource",
    "DatasetStatus",
    "Event",
    "Job",
    "JobStatus",
    "JobType",
    "Provenance",
    "SessionLocal",
    "engine",
    "get_db",
]

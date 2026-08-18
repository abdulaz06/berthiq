"""Declarative base for all ORM models.

A single `Base` carries the shared `MetaData`. The naming convention gives
constraints and indexes deterministic names so Alembic autogenerate produces
stable, reviewable diffs (explicit index names in the models still win).
"""

from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Deterministic names for auto-named constraints/indexes (PostgreSQL-friendly).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Root of the ORM model hierarchy. Import models to populate its metadata."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

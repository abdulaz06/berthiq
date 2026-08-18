"""Shared contract primitives — the provenance-wrapped KPI.

``KpiValue`` is the wire-level half of the honesty guarantee: no endpoint returns
a bare number for a KPI (docs/DATA_CONTRACTS.md §3). Its ``provenance`` field
reuses the canonical ``Provenance`` enum (app.core.provenance), the same one the
DB column and the frontend badge are built on.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.provenance import Provenance


class KpiValue(BaseModel):
    """A single KPI with its unit and lineage. Renders via ``<ProvenanceBadge>``."""

    value: float
    unit: str = Field(description="'hours' | 'percent' | 'count'")
    provenance: Provenance

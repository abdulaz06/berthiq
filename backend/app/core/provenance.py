"""Provenance — the load-bearing honesty tag.

Every KPI that crosses the wire or lands in the DB is tagged with one of these
four values (docs/DATA_CONTRACTS.md §3, docs/DATABASE.md §8). This module is the
single source of truth for the set: the DB enum column (``app.db.models``) and
the API contract (``app.schemas``) both import ``Provenance`` from here, so the
Postgres type, the Pydantic schema, and the generated TS union can never drift.

M0-7 builds the frontend half (``<ProvenanceBadge>`` + ``provenance.ts``) and any
``KpiValue`` core primitive against this same enum.
"""

from __future__ import annotations

import enum


class Provenance(str, enum.Enum):
    """Where a number came from. str-mixin so it serializes to its value."""

    observed = "observed"  # discovery / direct event aggregation
    predicted = "predicted"  # risk model inference
    simulated = "simulated"  # simulation run
    optimized = "optimized"  # solver output


PROVENANCE_VALUES: tuple[str, ...] = tuple(p.value for p in Provenance)

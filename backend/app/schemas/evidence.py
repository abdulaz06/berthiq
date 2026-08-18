"""EvidenceRecord — the structured input every explanation is rendered from.

``TemplateExplainer`` phrases these into sentences; it never invents a number
(docs/DATA_CONTRACTS.md §4). Every figure in a narrative traces to a field here.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import KpiValue


class ShapFactor(BaseModel):
    """One signed driver of a risk prediction."""

    feature: str
    contribution: float
    direction: Literal["increases_risk", "decreases_risk"]


class ConstraintRef(BaseModel):
    """A reference to a solver constraint, binding or penalized."""

    kind: str  # 'berth_no_overlap', 'draft_limit', 'reviewer_capacity', ...
    detail: str


class EvidenceRecord(BaseModel):
    """The deterministic evidence behind a recommendation, risk, or bottleneck."""

    kind: Literal["recommendation", "risk", "bottleneck"]
    solver_status: str | None = None  # OPTIMAL / FEASIBLE / INFEASIBLE (optimization only)
    objective_value: float | None = None
    binding_constraints: list[ConstraintRef] = []
    penalized_soft_constraints: list[ConstraintRef] = []
    top_factors: list[ShapFactor] = []
    baseline_deltas: dict[str, KpiValue] = {}  # vs no-change / FIFO / greedy
    simulation_seed: int | None = None
    replications: int | None = None
    notes: list[str] = []  # structured, template-fillable — not prose

"""Scenario, optimization, and simulation contracts (§5.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.core.provenance import Provenance
from app.schemas.common import KpiValue
from app.schemas.evidence import ConstraintRef, EvidenceRecord


class ObjectiveWeights(BaseModel):
    """The five objective terms from PRODUCT_DEFINITION §15 (w1..w5)."""

    waiting_time: float  # w1
    tardiness: float  # w2
    reviewer_overtime: float  # w3
    workload_imbalance: float  # w4
    plan_changes: float  # w5


class ScenarioConstraints(BaseModel):
    """User-set constraints that shape the solve."""

    reviewer_count: int | None = None  # override available reviewers
    reviewer_shift_caps: dict[str, int] | None = None
    locked_berths: dict[str, str] | None = None  # vessel → berth the user pins
    allow_parallel_low_risk: bool = False
    priority_vessels: list[str] = []


class ScenarioSpec(BaseModel):
    """A saved what-if configuration (request body for POST /api/scenarios)."""

    dataset_id: str
    name: str
    constraints: ScenarioConstraints
    objective_weights: ObjectiveWeights


class Assignment(BaseModel):
    """A vessel placed on a berth at a start time (reviewer set when c2 is active)."""

    vessel: str
    berth: str
    start: datetime
    reviewer: str | None = None


class OptimizationResult(BaseModel):
    """The solver's answer for one scenario, with reproducible evidence."""

    run_id: str
    scenario_id: str
    solver_status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE"]
    objective_value: float | None
    runtime_ms: int
    assignments: list[Assignment]
    changed_decisions: list[Assignment]  # subset differing from the existing plan
    evidence: EvidenceRecord  # kind='recommendation'
    narrative: str
    infeasibility: list[ConstraintRef] | None = None  # populated only when INFEASIBLE


class KpiDistribution(BaseModel):
    """A KPI summarized across simulation replications. Always ``simulated``."""

    name: str
    unit: str
    provenance: Provenance = Provenance.simulated
    mean: float
    std: float
    p10: float
    p50: float
    p90: float


class SimulationResult(BaseModel):
    """Baseline vs optimized run through the same model + seed (§5.4)."""

    run_id: str
    scenario_id: str
    seed: int
    replications: int
    baseline: list[KpiDistribution]
    optimized: list[KpiDistribution]
    # name → (baseline, optimized)
    headline: dict[str, tuple[KpiValue, KpiValue]]  # the 3 hero KPIs
    tradeoffs: dict[str, tuple[KpiValue, KpiValue]]  # overtime, workload — honest costs

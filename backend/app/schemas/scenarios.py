"""Scenario, optimization, and simulation contracts (§5.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.provenance import Provenance
from app.schemas.common import KpiValue
from app.schemas.evidence import ConstraintRef, EvidenceRecord


class ObjectiveWeights(BaseModel):
    """The five objective terms from PRODUCT_DEFINITION §15 (w1..w5)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    waiting_time: float = Field(default=1, ge=0, le=100)
    tardiness: float = Field(default=4, ge=0, le=100)
    reviewer_overtime: float = Field(default=2, ge=0, le=100)
    workload_imbalance: float = Field(default=0.1, ge=0, le=100)
    plan_changes: float = Field(default=30, ge=0, le=100)

    @model_validator(mode="after")
    def nonzero(self) -> ObjectiveWeights:
        if not any(self.model_dump().values()):
            raise ValueError("At least one objective weight must be positive.")
        return self


class BerthClosure(BaseModel):
    berth: str
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def ordered(self) -> BerthClosure:
        if not self.start.tzinfo or not self.end.tzinfo or self.end <= self.start:
            raise ValueError("Closure times need timezone offsets and end must follow start.")
        return self


class ScenarioConstraints(BaseModel):
    """User-set constraints that shape the solve."""

    model_config = ConfigDict(extra="forbid")
    reviewer_count: int | None = Field(default=None, ge=1, le=5)
    reviewer_shift_caps: dict[str, int] | None = None
    locked_berths: dict[str, str] | None = None  # vessel → berth the user pins
    allow_parallel_low_risk: bool = False
    priority_vessels: list[str] = []
    berth_closures: list[BerthClosure] = Field(default_factory=list, max_length=24)
    horizon_hours: int = Field(default=168, ge=12, le=336)

    @model_validator(mode="after")
    def supported(self) -> ScenarioConstraints:
        if self.allow_parallel_low_risk:
            raise ValueError(
                "Parallel review is not supported: approval remains a hard prerequisite."
            )
        if any(not 60 <= cap <= 900 for cap in (self.reviewer_shift_caps or {}).values()):
            raise ValueError("Reviewer shift caps must be between 60 and 900 minutes.")
        return self


class ScenarioSpec(BaseModel):
    """A saved what-if configuration (request body for POST /api/scenarios)."""

    dataset_id: str
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    constraints: ScenarioConstraints = Field(default_factory=ScenarioConstraints)
    objective_weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)


class ScenarioRecord(BaseModel):
    id: str
    spec: ScenarioSpec
    created_at: datetime
    expires_at: datetime


class Assignment(BaseModel):
    """A vessel placed on a berth at a start time (reviewer set when c2 is active)."""

    vessel: str
    berth: str
    start: datetime
    reviewer: str | None = None
    end: datetime | None = None
    cargo_start: datetime | None = None
    review_start: datetime | None = None
    review_end: datetime | None = None


class OptimizationResult(BaseModel):
    """The solver's answer for one scenario, with reproducible evidence."""

    run_id: str
    scenario_id: str
    solver_status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    objective_value: float | None
    runtime_ms: int
    assignments: list[Assignment]
    changed_decisions: list[Assignment]  # subset differing from the existing plan
    evidence: EvidenceRecord  # kind='recommendation'
    narrative: str
    infeasibility: list[ConstraintRef] | None = None  # populated only when INFEASIBLE
    baselines: dict[str, list[Assignment]] = Field(default_factory=dict)
    baseline_objectives: dict[str, float | None] = Field(default_factory=dict)
    constraint_checks: dict[str, bool] = Field(default_factory=dict)
    objective_terms: dict[str, float] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


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
    replication_seeds: list[int] = Field(default_factory=list)
    samples: dict[str, dict[str, list[float]]] = Field(default_factory=dict)
    baseline_schedule: list[Assignment] = Field(default_factory=list)
    optimized_schedule: list[Assignment] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class SimulationRequest(BaseModel):
    optimization_run_id: str
    seed: int = Field(default=20260601, ge=0, le=2**31 - 100)
    replications: int = Field(default=20, ge=2, le=50)

"""Pydantic contracts — the source of truth for every API seam.

The M1 contracts from docs/DATA_CONTRACTS.md. Each response schema has a matching
example fixture committed to both ``backend/tests/fixtures/`` and
``frontend/lib/fixtures/`` (identical content) so the two halves build in parallel.
"""

from __future__ import annotations

from app.schemas.common import KpiValue
from app.schemas.datasets import DataQualityReport, DatasetSummary, ValidationIssue
from app.schemas.discovery import Bottleneck, DfgEdge, DfgNode, ProcessModel, Variant
from app.schemas.evidence import ConstraintRef, EvidenceRecord, ShapFactor
from app.schemas.health import HealthResponse
from app.schemas.jobs import JobStatus
from app.schemas.risk import CaseExplanation, CaseRisk, RiskBoard
from app.schemas.scenarios import (
    Assignment,
    KpiDistribution,
    ObjectiveWeights,
    OptimizationResult,
    ScenarioConstraints,
    ScenarioSpec,
    SimulationResult,
)

__all__ = [
    "Assignment",
    "Bottleneck",
    "CaseExplanation",
    "CaseRisk",
    "ConstraintRef",
    "DataQualityReport",
    "DatasetSummary",
    "DfgEdge",
    "DfgNode",
    "EvidenceRecord",
    "HealthResponse",
    "JobStatus",
    "KpiDistribution",
    "KpiValue",
    "ObjectiveWeights",
    "OptimizationResult",
    "ProcessModel",
    "RiskBoard",
    "ScenarioConstraints",
    "ScenarioSpec",
    "ShapFactor",
    "SimulationResult",
    "ValidationIssue",
    "Variant",
]

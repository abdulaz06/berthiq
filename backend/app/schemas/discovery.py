"""Process-discovery contract: the DFG, variants, and bottlenecks (§5.2)."""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import KpiValue
from app.schemas.evidence import EvidenceRecord


class DfgNode(BaseModel):
    """A stage node in the directly-follows graph."""

    activity: str
    frequency: int
    median_duration_min: float


class DfgEdge(BaseModel):
    """A directed edge with its wait-time statistics."""

    source: str
    target: str
    frequency: int
    median_wait_min: float
    p90_wait_min: float


class Variant(BaseModel):
    """One end-to-end path through the process, with how often it occurs."""

    sequence: list[str]
    count: int
    median_total_min: float


class Bottleneck(BaseModel):
    """A ranked stage flagged as a bottleneck, with its supporting evidence."""

    activity: str
    metric: str  # 'median_wait' | 'rework_rate' | 'resource_load'
    value: KpiValue
    rank: int
    evidence: EvidenceRecord


class ProcessModel(BaseModel):
    """The full discovered model for a dataset."""

    dataset_id: str
    nodes: list[DfgNode]
    edges: list[DfgEdge]
    variants: list[Variant]
    bottlenecks: list[Bottleneck]
    metrics: dict[str, KpiValue]  # throughput, rework_rate, avg_utilization

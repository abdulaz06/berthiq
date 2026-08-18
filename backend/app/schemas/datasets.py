"""Dataset + data-quality contracts (docs/DATA_CONTRACTS.md §2, §5.1)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DatasetSummary(BaseModel):
    """The at-a-glance view of a dataset returned by the dataset endpoints."""

    id: str
    name: str
    source: Literal["builtin", "uploaded", "generated"]
    status: Literal["validating", "invalid", "ready"]
    port_config: str | None
    event_count: int
    case_count: int
    active_case_count: int
    time_range: tuple[datetime, datetime] | None
    activities: list[str]
    resources: list[str]


class ValidationIssue(BaseModel):
    """One category of data-quality problem found during validation."""

    severity: Literal["fatal", "warning", "info"]
    code: str  # 'missing_timestamp', 'impossible_order', 'duplicate_event', ...
    message: str
    count: int
    sample_rows: list[int]


class DataQualityReport(BaseModel):
    """Validation outcome. ``is_blocking`` is true iff any fatal issue is present."""

    dataset_id: str
    total_events: int
    total_cases: int
    issues: list[ValidationIssue]
    is_blocking: bool

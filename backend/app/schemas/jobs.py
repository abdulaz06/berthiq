"""Job-status contract for the async polling loop (docs/DATA_CONTRACTS.md §5.5)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class JobStatus(BaseModel):
    """Progress of one async operation, polled at GET /api/jobs/{id}."""

    id: str
    job_type: Literal["discovery", "optimization", "simulation"]
    status: Literal["pending", "running", "succeeded", "failed"]
    progress: float = Field(ge=0.0, le=1.0)  # best-effort
    result_type: str | None  # what to GET when succeeded
    result_id: str | None
    error: str | None

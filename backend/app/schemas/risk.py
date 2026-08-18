"""Prediction / risk contracts (docs/DATA_CONTRACTS.md §5.3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.evidence import ShapFactor


class CaseRisk(BaseModel):
    """One active port call's miss-risk row on the risk board."""

    case_id: str
    vessel_type: str | None
    current_stage: str
    miss_probability: float = Field(ge=0.0, le=1.0)
    predicted_remaining_min: float | None
    top_factors: list[ShapFactor]  # 3-5 drivers for the row
    service_window_end: datetime | None


class RiskBoard(BaseModel):
    """All active cases scored by the current model version. Caller sorts."""

    dataset_id: str
    model_version: str
    cases: list[CaseRisk]

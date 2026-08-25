"""Risk router (M1-07) — miss-risk predictions + SHAP explanations (§5.3).

``GET /api/datasets/{id}/risk`` scores every active case into a RiskBoard;
``GET /api/cases/{case_id}/explanation?dataset_id=...`` explains one case.

Inference only: the committed model artifact is loaded once (cached) and never
trained in the request path. Both endpoints are fast and synchronous. Every
probability is a model output — ``predicted`` provenance (the RiskBoard carries the
``model_version`` that anchors it); the contract types the probabilities as plain
floats (§5.3), so no bare KpiValue is introduced here.
"""

from __future__ import annotations

import uuid
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import Dataset, Event, get_db
from app.schemas import CaseExplanation, RiskBoard
from app.services import prediction
from app.services.explanation import TemplateExplainer, build_risk_evidence

router = APIRouter(tags=["risk"])

DbSession = Annotated[Session, Depends(get_db)]


def _dataset_or_404(session: Session, dataset_id: str) -> Dataset:
    try:
        did = uuid.UUID(dataset_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found"
        ) from exc
    dataset = session.get(Dataset, did)
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


def _load_events(session: Session, dataset_id: uuid.UUID) -> list[Event]:
    return list(
        session.execute(
            sa.select(Event)
            .where(Event.dataset_id == dataset_id)
            .order_by(Event.case_id, Event.seq)
        )
        .scalars()
        .all()
    )


@router.get("/datasets/{dataset_id}/risk", response_model=RiskBoard)
def get_risk(dataset_id: str, session: DbSession) -> RiskBoard:
    """Score all active cases in the dataset (fast, synchronous, inference only)."""
    dataset = _dataset_or_404(session, dataset_id)
    events = _load_events(session, dataset.id)
    model = prediction.load_default_model()
    return prediction.score_risk_board(model, events, str(dataset.id))


@router.get("/cases/{case_id}/explanation", response_model=CaseExplanation)
def get_case_explanation(
    case_id: str,
    session: DbSession,
    dataset_id: Annotated[str, Query(description="Dataset the case belongs to")],
) -> CaseExplanation:
    """Explain one active case: its miss probability, the SHAP evidence, and a
    deterministic narrative rendered from that evidence."""
    dataset = _dataset_or_404(session, dataset_id)
    events = _load_events(session, dataset.id)
    model = prediction.load_default_model()

    scored = prediction.score_case(model, events, case_id)
    if scored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active case with that id in this dataset.",
        )
    miss_probability, _current_stage, factors = scored
    return CaseExplanation(
        case_id=case_id,
        miss_probability=round(miss_probability, 4),
        evidence=build_risk_evidence(factors),
        narrative=TemplateExplainer.render_risk(case_id, miss_probability, factors),
    )

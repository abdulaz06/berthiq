"""Discovery router (M1-04) — DFG + variants + bottlenecks (docs/DATA_CONTRACTS §5.2).

``POST /api/datasets/{id}/discover`` computes the process model and caches it;
``GET /api/discovery/{dataset_id}`` returns the cached model.

**Synchronous by design (M1).** The contract envelopes discovery as a job
(``POST … → { job_id }``, polled at ``GET /api/jobs/{id}``). Discovery is fast
(<5s on the reference dataset), so for M1 it runs inline: the POST computes,
stores, records a *already-succeeded* discovery job, and returns that JobStatus —
so the frontend's poll loop still works (it sees ``succeeded`` immediately) and
can go straight to the GET. The real async job/worker machinery lands with M1-09
(optimization), where operations are genuinely slow.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import Dataset, Job, JobType, get_db
from app.db import JobStatus as JobStatusEnum
from app.schemas import JobStatus, ProcessModel
from app.services import discovery

router = APIRouter(tags=["discovery"])

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


@router.post("/datasets/{dataset_id}/discover", response_model=JobStatus)
def discover(dataset_id: str, session: DbSession) -> JobStatus:
    """Discover and cache the process model for a dataset. Runs synchronously and
    returns an already-``succeeded`` discovery job pointing at the result."""
    dataset = _dataset_or_404(session, dataset_id)

    job = Job(job_type=JobType.discovery, status=JobStatusEnum.running, dataset_id=dataset.id)
    session.add(job)
    session.flush()

    try:
        discovery.run_discovery(session, str(dataset.id))
    except ValueError as exc:
        job.status = JobStatusEnum.failed
        job.error = str(exc)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    job.status = JobStatusEnum.succeeded
    job.progress = Decimal(1)
    job.result_type = "process_model"
    job.result_id = str(dataset.id)
    session.commit()

    return JobStatus(
        id=str(job.id),
        job_type="discovery",
        status="succeeded",
        progress=1.0,
        result_type="process_model",
        result_id=str(dataset.id),
        error=None,
    )


@router.get("/discovery/{dataset_id}", response_model=ProcessModel)
def get_discovery(dataset_id: str, session: DbSession) -> ProcessModel:
    """Return the cached process model for a dataset (404 if not yet discovered)."""
    _dataset_or_404(session, dataset_id)
    model = discovery.get_saved_process_model(session, dataset_id)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No process model for this dataset yet; POST …/discover first.",
        )
    return model

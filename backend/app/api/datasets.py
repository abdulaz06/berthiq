from __future__ import annotations

import uuid
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Header, HTTPException, UploadFile

from app.api.dependencies import Db, Owner, dataset_or_404
from app.config import settings
from app.db.models import Dataset, DatasetSource
from app.schemas.datasets import (
    ColumnMapping,
    DataQualityReport,
    DatasetSummary,
    DemoCapabilities,
    MappingPreview,
)
from app.services import ingestion

router = APIRouter(tags=["datasets"])


@router.get("/demo/capabilities", response_model=DemoCapabilities)
def capabilities():
    return DemoCapabilities(
        uploads_enabled=settings.ENABLE_UPLOADS,
        max_upload_bytes=ingestion.MAX_BYTES,
        max_event_rows=ingestion.MAX_ROWS,
        session_ttl_hours=settings.DEMO_TTL_HOURS,
    )


@router.get("/datasets", response_model=list[DatasetSummary])
def list_datasets(db: Db, x_demo_session: Annotated[uuid.UUID | None, Header()] = None):
    return [
        ingestion.summary(d)
        for d in db.scalars(
            sa.select(Dataset)
            .where(sa.or_(Dataset.owner_token.is_(None), Dataset.owner_token == x_demo_session))
            .order_by(Dataset.created_at.desc())
        )
    ]


@router.post("/datasets/builtin/{name}", response_model=DatasetSummary)
def builtin(name: str, db: Db):
    if name not in {"khalifa", "khalifa_demo"}:
        raise HTTPException(404, "Unknown built-in dataset.")
    dataset = db.scalar(
        sa.select(Dataset).where(
            Dataset.source == DatasetSource.builtin, Dataset.port_config == "khalifa"
        )
    )
    if not dataset:
        raise HTTPException(503, "Demo dataset is not seeded yet. The server needs just seed.")
    return ingestion.summary(dataset)


@router.post("/datasets", response_model=DatasetSummary, status_code=201)
def upload(file: UploadFile, db: Db, owner: Owner):
    if not settings.ENABLE_UPLOADS:
        raise HTTPException(
            403, "Uploads are disabled in this public demo. Use the built-in dataset."
        )
    # Global advisory transaction lock serializes quotas, including multiple request threads.
    db.execute(sa.text("SELECT pg_advisory_xact_lock(742901)"))
    if (
        db.scalar(
            sa.select(sa.func.count())
            .select_from(Dataset)
            .where(Dataset.source == DatasetSource.uploaded)
        )
        or 0
    ) >= 100:
        raise HTTPException(429, "Upload capacity reached. Reset expired demo data first.")
    if (
        db.scalar(
            sa.select(sa.func.count()).select_from(Dataset).where(Dataset.owner_token == owner)
        )
        or 0
    ) >= 5:
        raise HTTPException(429, "This session has reached its five-upload limit.")
    content = file.file.read(ingestion.MAX_BYTES + 1)
    try:
        rows = ingestion.parse_upload(content, file.filename or "")
        dataset = ingestion.create_upload(db, rows, file.filename or "Uploaded data", owner)
        return ingestion.summary(dataset)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/datasets/{dataset_id}", response_model=DatasetSummary)
def get_dataset(
    dataset_id: str, db: Db, x_demo_session: Annotated[uuid.UUID | None, Header()] = None
):
    return ingestion.summary(dataset_or_404(db, dataset_id, x_demo_session))


@router.get("/datasets/{dataset_id}/suggested-mapping", response_model=MappingPreview)
def mapping_preview(dataset_id: str, db: Db, owner: Owner):
    dataset = dataset_or_404(db, dataset_id, owner)
    rows = (dataset.stats or {}).get("raw_rows", [])
    columns = list(rows[0]) if rows else []
    return MappingPreview(
        columns=columns, suggested=ingestion.suggest_mapping(columns), sample_rows=rows[:5]
    )


@router.post("/datasets/{dataset_id}/mapping", response_model=DataQualityReport)
def apply_mapping(dataset_id: str, mapping: ColumnMapping, db: Db, owner: Owner):
    dataset = dataset_or_404(db, dataset_id, owner)
    try:
        return ingestion.apply_mapping(db, dataset, mapping)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/datasets/{dataset_id}/validation", response_model=DataQualityReport)
def validation(
    dataset_id: str, db: Db, x_demo_session: Annotated[uuid.UUID | None, Header()] = None
):
    return ingestion.validate_dataset(db, dataset_or_404(db, dataset_id, x_demo_session))

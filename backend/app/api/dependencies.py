from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import Dataset, DatasetStatus, get_db

Db = Annotated[Session, Depends(get_db)]


def session_token(x_demo_session: Annotated[str | None, Header()] = None) -> uuid.UUID:
    try:
        token = uuid.UUID(x_demo_session or "")
    except ValueError as exc:
        raise HTTPException(
            400, "A valid X-Demo-Session UUID is required for private demo state."
        ) from exc
    if token.version != 4:
        raise HTTPException(400, "Use a randomly generated UUID v4 for X-Demo-Session.")
    return token


Owner = Annotated[uuid.UUID, Depends(session_token)]


def dataset_or_404(db: Session, dataset_id: str, owner: uuid.UUID | None = None) -> Dataset:
    try:
        dataset = db.get(Dataset, uuid.UUID(dataset_id))
    except ValueError as exc:
        raise HTTPException(404, "Dataset not found.") from exc
    if not dataset or (dataset.owner_token is not None and dataset.owner_token != owner):
        raise HTTPException(404, "Dataset not found.")
    return dataset


def ready_dataset(db: Session, dataset_id: str, owner: uuid.UUID | None = None) -> Dataset:
    dataset = dataset_or_404(db, dataset_id, owner)
    if dataset.status != DatasetStatus.ready:
        raise HTTPException(409, "Validate the dataset before continuing.")
    return dataset

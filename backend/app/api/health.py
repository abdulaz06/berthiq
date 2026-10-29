"""Health-check router — the M0-5 vertical slice proving the stack talks."""

from __future__ import annotations

import sqlalchemy as sa
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.dependencies import Db
from app.config import settings
from app.schemas.health import HealthResponse
from app.services.prediction import load_default_model

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report liveness plus identifying metadata."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        app_name=settings.APP_NAME,
    )


@router.get("/ready")
def ready(db: Db):
    db.execute(sa.text("SELECT 1 FROM datasets LIMIT 1"))
    load_default_model()
    return JSONResponse({"status": "ready", "database": "connected", "model": "loaded"})

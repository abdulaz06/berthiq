"""Health-check router — the M0-5 vertical slice proving the stack talks."""

from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report liveness plus identifying metadata."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        app_name=settings.APP_NAME,
    )

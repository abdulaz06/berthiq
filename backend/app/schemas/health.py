"""Health-check contract."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Liveness payload returned by GET /api/health."""

    status: str
    version: str
    app_name: str

"""FastAPI application entrypoint + router registration.

Kept deliberately thin: it wires middleware and mounts routers. All real logic
lives in `app/services/` (see docs/ARCHITECTURE.md §5).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.config import settings

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routers are mounted under /api.
app.include_router(health.router, prefix="/api")

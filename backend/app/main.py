"""FastAPI application entrypoint + router registration.

Kept deliberately thin: it wires middleware and mounts routers. All real logic
lives in `app/services/` (see docs/ARCHITECTURE.md §5).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import contract_stubs, health
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
# Scaffolding: stub routes that publish the M1 contract schemas into OpenAPI so
# `just types` can generate frontend/lib/types/api.ts. Replaced route-by-route as
# the real M1 endpoints land (see app/api/contract_stubs.py).
app.include_router(contract_stubs.router, prefix="/api")

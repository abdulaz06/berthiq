"""FastAPI application entrypoint + router registration.

Kept deliberately thin: it wires middleware and mounts routers. All real logic
lives in `app/services/` (see docs/ARCHITECTURE.md §5).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api import datasets, discovery, health, operations, risk, scenarios
from app.config import settings
from app.core.limits import DemoLimits
from app.db.session import SessionLocal
from app.services.jobs import recover_interrupted


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        with SessionLocal() as db:
            recover_interrupted(db)
    except SQLAlchemyError:
        logging.getLogger(__name__).warning(
            "Database unavailable at startup; readiness will report it."
        )
    yield


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION, lifespan=lifespan)
app.add_middleware(DemoLimits)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routers are mounted under /api.
app.include_router(health.router, prefix="/api")
# Real M1 endpoints (replace their scaffold stubs below as they land).
app.include_router(discovery.router, prefix="/api")
app.include_router(risk.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")
app.include_router(operations.router, prefix="/api")


@app.exception_handler(SQLAlchemyError)
async def database_unavailable(request: Request, exc: SQLAlchemyError):
    return JSONResponse(
        status_code=503, content={"detail": "Database temporarily unavailable. Retry shortly."}
    )


@app.exception_handler(FileNotFoundError)
async def artifact_unavailable(request: Request, exc: FileNotFoundError):
    return JSONResponse(
        status_code=503,
        content={"detail": "A required model artifact is unavailable on the server."},
    )

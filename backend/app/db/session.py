"""Engine + session factory.

The engine is created lazily-connecting (no I/O at import time), reading the
per-machine ``DATABASE_URL`` from settings. ``get_db`` is the FastAPI dependency
that yields a session and always closes it.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Iterator[Session]:
    """Yield a request-scoped session, closing it on the way out."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

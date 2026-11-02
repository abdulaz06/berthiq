"""Release/preflight checks against the guarded disposable PostgreSQL database."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
import sqlalchemy as sa
from alembic import command
from app.config import settings
from app.db.models import Dataset

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import generate_dataset as generator  # noqa: E402
import serve  # noqa: E402


def test_seed_preserves_existing_dataset_and_event_ids(session):
    generated = generator.generate(generator.load_port_config("khalifa"))
    generator.load_into_db(generated, replace=False)
    existing = session.get(Dataset, generated.dataset_id)
    existing.name = "Preserved local dataset name"
    session.commit()
    before = list(session.execute(sa.text("SELECT id FROM events ORDER BY id")).scalars())
    generator.load_into_db(generated, replace=False)
    session.expire_all()
    assert session.get(Dataset, generated.dataset_id).name == "Preserved local dataset name"
    assert list(session.execute(sa.text("SELECT id FROM events ORDER BY id")).scalars()) == before


def test_preflight_requires_explicit_environment(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="explicit DATABASE_URL"):
        serve.preflight()


def test_preflight_requires_https_origins(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", settings.DATABASE_URL)
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:3000"]')
    monkeypatch.setattr(settings, "CORS_ORIGINS", ["http://localhost:3000"])
    with pytest.raises(ValueError, match="HTTPS"):
        serve.preflight()


def test_release_migrations_seed_and_preflight(db_engine, alembic_cfg, monkeypatch):
    # db_engine enforces an explicit disposable _test URL before migrations.
    command.upgrade(alembic_cfg, "head")
    monkeypatch.setenv("CORS_ORIGINS", '["https://demo.example"]')
    monkeypatch.setattr(settings, "CORS_ORIGINS", ["https://demo.example"])
    try:
        generator.load_into_db(
            generator.generate(generator.load_port_config("khalifa")), replace=False
        )
        serve.preflight()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = {**os.environ, "PORT": str(port), "CORS_ORIGINS": '["https://demo.example"]'}
        with subprocess.Popen(
            [sys.executable, "scripts/serve.py"],
            cwd=Path(__file__).resolve().parents[1],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ) as child:
            try:
                deadline = time.monotonic() + 45
                with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False) as client:
                    while True:
                        try:
                            ready = client.get("/api/ready")
                            if ready.status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        assert child.poll() is None, "Production server exited during startup"
                        assert time.monotonic() < deadline, "Production readiness timed out"
                        time.sleep(0.1)
                    allowed = client.get("/api/health", headers={"Origin": "https://demo.example"})
                    denied = client.get(
                        "/api/health", headers={"Origin": "https://untrusted.example"}
                    )
                    assert allowed.headers["access-control-allow-origin"] == "https://demo.example"
                    assert "access-control-allow-origin" not in denied.headers
            finally:
                child.terminate()
                child.wait(timeout=10)
    finally:
        command.downgrade(alembic_cfg, "base")

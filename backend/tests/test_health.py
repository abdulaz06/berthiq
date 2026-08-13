"""Smoke test for the M0-5 health slice: the backend boots and /api/health is ok."""

from __future__ import annotations

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_returns_ok() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["app_name"] == "BerthIQ"
    assert body["version"]  # non-empty version string

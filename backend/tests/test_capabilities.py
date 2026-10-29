from app.config import settings
from app.main import app
from fastapi.testclient import TestClient


def test_public_capabilities_match_enforcement(monkeypatch):
    client = TestClient(app)
    for enabled in (False, True):
        monkeypatch.setattr(settings, "ENABLE_UPLOADS", enabled)
        response = client.get("/api/demo/capabilities")
        assert response.status_code == 200
        assert response.json() == {
            "uploads_enabled": enabled,
            "max_upload_bytes": 5 * 1024 * 1024,
            "max_event_rows": 50000,
            "session_ttl_hours": 24,
        }

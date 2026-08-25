"""M1-07 acceptance tests for the risk endpoint (inference + SHAP).

* RiskBoard and CaseExplanation responses validate against their committed
  fixtures' shape; probabilities are in [0, 1]; explanations list signed factors.
* Inference is deterministic — the same dataset scores identically twice.
* The endpoint LOADS the committed artifact and never trains in the request path
  (proved by making ``RiskModel.fit`` raise and still getting a valid response).

The endpoints read from the DB, so these tests use the ``session`` fixture (a
throwaway schema) with the real committed model artifact — never the seeded DB.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from app.schemas import CaseExplanation, RiskBoard
from app.services import prediction

BACKEND_DIR = Path(__file__).resolve().parents[1]
FIXTURES = BACKEND_DIR / "tests" / "fixtures"
_TZ = timezone(timedelta(hours=4))
_BASE = datetime(2026, 6, 1, 8, 0, tzinfo=_TZ)


def _attrs(**extra: Any) -> dict[str, Any]:
    base = {
        "vessel_type": "container",
        "cargo_type": "containers",
        "loa": 250.0,
        "draft": 14.0,
        "missing_doc_count": 2,
    }
    base.update(extra)
    return base


def _events_for_dataset(dataset_id: Any) -> list[Any]:
    """Two active cases (never berthed) + one completed case (must be excluded)."""
    from app.db import Event

    def ev(case: str, seq: int, activity: str, start_min: int, end_min: int,
           status: str = "completed", **attrs: Any) -> Event:
        return Event(
            dataset_id=dataset_id, case_id=case, activity=activity,
            start_ts=_BASE + timedelta(minutes=start_min),
            end_ts=_BASE + timedelta(minutes=end_min),
            resource_id=None, status=status, seq=seq, attributes=_attrs(**attrs),
        )

    sw_end = (_BASE + timedelta(hours=40)).isoformat()
    rows = [
        # A1 — active, stuck at Authority review (no service window set yet).
        ev("A1", 1, "Port call request submitted", 0, 0),
        ev("A1", 2, "Documents submitted", 5, 60, rework_iteration=0),
        ev("A1", 3, "Completeness check", 60, 75, rework_iteration=0),
        ev("A1", 4, "Authority review", 200, 460, reviewer_shift="night", review_wait_min=125.0),
        # A2 — active, past the arrival plan (has a service window), awaiting berth.
        ev("A2", 1, "Port call request submitted", 0, 0),
        ev("A2", 2, "Documents submitted", 5, 40, rework_iteration=0),
        ev("A2", 3, "Completeness check", 40, 55, rework_iteration=0),
        ev("A2", 4, "Authority review", 55, 240, reviewer_shift="day", review_wait_min=0.0),
        ev("A2", 5, "Arrival plan confirmed", 240, 240, service_window_end=sw_end),
        ev("A2", 6, "Berth planning", 240, 360),
        # C1 — completed (reached the terminal stage): NOT an active case.
        ev("C1", 1, "Port call request submitted", 0, 0),
        ev("C1", 2, "Documents submitted", 5, 40),
        ev("C1", 3, "Completeness check", 40, 55),
        ev("C1", 4, "Authority review", 55, 200),
        ev("C1", 5, "Arrival plan confirmed", 200, 200, service_window_end=sw_end),
        ev("C1", 6, "Berth planning", 200, 300),
        ev("C1", 7, "Berth assigned", 300, 300),
        ev("C1", 8, "Vessel arrives / anchorage wait", 300, 800),
        ev("C1", 9, "Berthed, cargo start", 800, 800),
    ]
    return rows


@pytest.fixture
def client_and_dataset(session: Any) -> Any:
    """A TestClient wired to the test session, plus a seeded dataset id."""
    from app.db import Dataset, DatasetSource, DatasetStatus, get_db
    from app.main import app
    from fastapi.testclient import TestClient

    dataset = Dataset(
        name="risk test ds", source=DatasetSource.generated, status=DatasetStatus.ready
    )
    session.add(dataset)
    session.flush()
    session.add_all(_events_for_dataset(dataset.id))
    session.flush()

    app.dependency_overrides[get_db] = lambda: session
    try:
        yield TestClient(app), str(dataset.id)
    finally:
        app.dependency_overrides.clear()


# --- RiskBoard ---------------------------------------------------------------


def test_risk_board_matches_fixture_shape(client_and_dataset: Any) -> None:
    client, dataset_id = client_and_dataset
    resp = client.get(f"/api/datasets/{dataset_id}/risk")
    assert resp.status_code == 200
    body = resp.json()

    RiskBoard.model_validate(body)  # validates against the schema

    fixture = json.loads((FIXTURES / "risk_board.example.json").read_text(encoding="utf-8"))
    assert set(body.keys()) == set(fixture.keys())
    assert body["cases"], "expected active cases to score"
    fixture_case_keys = set(fixture["cases"][0].keys())
    factor_keys = set(fixture["cases"][0]["top_factors"][0].keys())
    for case in body["cases"]:
        assert set(case.keys()) == fixture_case_keys
        assert 0.0 <= case["miss_probability"] <= 1.0
        assert 1 <= len(case["top_factors"]) <= 5
        for f in case["top_factors"]:
            assert set(f.keys()) == factor_keys
            # Sign and direction agree.
            expected = "increases_risk" if f["contribution"] >= 0 else "decreases_risk"
            assert f["direction"] == expected


def test_risk_board_excludes_completed_cases(client_and_dataset: Any) -> None:
    client, dataset_id = client_and_dataset
    body = client.get(f"/api/datasets/{dataset_id}/risk").json()
    scored = {c["case_id"] for c in body["cases"]}
    assert scored == {"A1", "A2"}, f"only active cases should be scored, got {scored}"


def test_risk_board_is_deterministic(client_and_dataset: Any) -> None:
    client, dataset_id = client_and_dataset
    first = client.get(f"/api/datasets/{dataset_id}/risk").json()
    second = client.get(f"/api/datasets/{dataset_id}/risk").json()
    assert first == second  # same input -> identical scores


# --- CaseExplanation ---------------------------------------------------------


def test_case_explanation_matches_fixture_shape(client_and_dataset: Any) -> None:
    client, dataset_id = client_and_dataset
    resp = client.get("/api/cases/A2/explanation", params={"dataset_id": dataset_id})
    assert resp.status_code == 200
    body = resp.json()

    CaseExplanation.model_validate(body)

    fixture = json.loads((FIXTURES / "case_explanation.example.json").read_text(encoding="utf-8"))
    assert set(body.keys()) == set(fixture.keys())
    assert body["case_id"] == "A2"
    assert 0.0 <= body["miss_probability"] <= 1.0
    assert body["evidence"]["kind"] == "risk"
    assert body["evidence"]["top_factors"], "explanation must list signed factors"
    assert isinstance(body["narrative"], str) and body["narrative"]
    # Narrative is rendered from evidence numbers — the probability appears in it.
    assert f"{round(body['miss_probability'] * 100)}%" in body["narrative"]


def test_case_explanation_404_for_unknown_or_completed_case(client_and_dataset: Any) -> None:
    client, dataset_id = client_and_dataset
    params = {"dataset_id": dataset_id}
    assert client.get("/api/cases/NOPE/explanation", params=params).status_code == 404
    # C1 is completed, not an active case -> no risk explanation.
    assert client.get("/api/cases/C1/explanation", params=params).status_code == 404


# --- Inference-only guarantees ----------------------------------------------


def test_endpoint_loads_committed_artifact() -> None:
    """Serving loads the committed model artifact and it carries the expected
    version — no training required to answer a request."""
    assert prediction.DEFAULT_MODEL_PATH.exists(), "committed artifact must be present"
    model = prediction.load_default_model()
    assert model.model_version == prediction.MODEL_VERSION
    assert model.feature_columns == list(prediction.FEATURE_COLUMNS)


def test_endpoint_does_not_train(client_and_dataset: Any, monkeypatch: Any) -> None:
    """If the request path tried to train, this would raise; it must not."""

    def _boom(*_a: Any, **_k: Any) -> None:
        raise AssertionError("RiskModel.fit must not be called during inference")

    monkeypatch.setattr(prediction.RiskModel, "fit", classmethod(_boom))
    client, dataset_id = client_and_dataset
    assert client.get(f"/api/datasets/{dataset_id}/risk").status_code == 200
    exp = client.get("/api/cases/A1/explanation", params={"dataset_id": dataset_id})
    assert exp.status_code == 200

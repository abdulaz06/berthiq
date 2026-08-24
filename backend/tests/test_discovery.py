"""M1-04 acceptance tests for the discovery service.

Three things the task requires:

* **A known DFG** — on a tiny hand-built log, the nodes, edges, and wait
  statistics come out exactly as computed by hand (incl. a rework back-edge).
* **The injected bottleneck is found independently** — run discovery over the
  generator's own event log and assert the top-ranked bottleneck is *Authority
  review*, matching the hidden ground truth. This closes the loop: discovery
  rediscovers what the generator injected, from the events alone.
* **Contract shape** — the output validates against the committed
  ``process_model`` fixture's schema, and re-serializes cleanly.

The pure tests need no database. The persistence round-trip reuses the shared
``session`` fixture and skips when no PostgreSQL is reachable.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from app.core.provenance import Provenance
from app.schemas.discovery import ProcessModel
from app.services.discovery import EventLite, discover_process_model

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

import generate_dataset as g  # noqa: E402 — path set above

_BASE = datetime(2026, 1, 1, 0, 0)


def _ev(case: str, act: str, start_min: float, end_min: float, seq: int,
        resource: str | None = None, status: str = "completed") -> EventLite:
    return EventLite(
        case_id=case,
        activity=act,
        start_ts=_BASE + timedelta(minutes=start_min),
        end_ts=_BASE + timedelta(minutes=end_min),
        resource_id=resource,
        status=status,
        seq=seq,
        attributes={},
    )


# --- Test 1: a tiny log with a hand-computed DFG ---------------------------


def test_tiny_log_has_expected_dfg() -> None:
    events = [
        # Case 1 (happy): A -> B -> C
        _ev("c1", "A", 0, 0, 1), _ev("c1", "B", 5, 15, 2), _ev("c1", "C", 20, 25, 3),
        # Case 2 (happy, slower): A -> B -> C
        _ev("c2", "A", 0, 0, 1), _ev("c2", "B", 10, 30, 2), _ev("c2", "C", 50, 60, 3),
        # Case 3 (rework): A -> B -> A -> B -> C  (a B->A back-edge)
        _ev("c3", "A", 0, 0, 1), _ev("c3", "B", 5, 10, 2), _ev("c3", "A", 12, 12, 3),
        _ev("c3", "B", 20, 40, 4), _ev("c3", "C", 45, 50, 5),
    ]

    model = discover_process_model(events, "tiny")

    nodes = {n.activity: n for n in model.nodes}
    assert nodes["A"].frequency == 4 and nodes["A"].median_duration_min == 0.0
    assert nodes["B"].frequency == 4 and nodes["B"].median_duration_min == 15.0
    assert nodes["C"].frequency == 3 and nodes["C"].median_duration_min == 5.0

    edges = {(e.source, e.target): e for e in model.edges}
    # A->B: waits [5, 10, 5, 8] -> median 6.5, p90 (nearest-rank) 10
    assert edges[("A", "B")].frequency == 4
    assert edges[("A", "B")].median_wait_min == 6.5
    assert edges[("A", "B")].p90_wait_min == 10.0
    # B->C: waits [5, 20, 5] -> median 5, p90 20
    assert edges[("B", "C")].frequency == 3
    assert edges[("B", "C")].median_wait_min == 5.0
    assert edges[("B", "C")].p90_wait_min == 20.0
    # B->A: the rework back-edge, once, wait 2
    assert edges[("B", "A")].frequency == 1
    assert edges[("B", "A")].median_wait_min == 2.0


# --- Test 2: discovery independently finds the injected bottleneck ----------


@pytest.fixture(scope="module")
def khalifa_result() -> Any:
    """The generator's own deterministic event log (no DB needed)."""
    cfg = g.load_port_config("khalifa")
    return g.generate(cfg)


def test_top_bottleneck_is_authority_review(khalifa_result: Any) -> None:
    events = khalifa_result.events

    start = time.perf_counter()
    model = discover_process_model(events, str(khalifa_result.dataset_id))
    elapsed = time.perf_counter() - start

    top = model.bottlenecks[0]
    assert top.activity == "Authority review", (
        f"top bottleneck was {top.activity!r}, expected 'Authority review' "
        f"(ranking: {[(b.activity, b.metric) for b in model.bottlenecks]})"
    )
    assert top.value.provenance == Provenance.observed
    assert top.evidence.kind == "bottleneck" and top.evidence.notes

    # Closes the loop: discovery's answer matches the generator's hidden truth.
    assert khalifa_result.ground_truth["true_bottleneck"]["stage"] == "Authority review"

    # <5s target on the reference dataset.
    assert elapsed < 5.0, f"discovery took {elapsed:.2f}s (>5s)"


def test_all_kpis_are_provenance_tagged(khalifa_result: Any) -> None:
    """CLAUDE.md rule #3: no discovery number escapes untagged."""
    model = discover_process_model(khalifa_result.events, str(khalifa_result.dataset_id))
    for kpi in model.metrics.values():
        assert kpi.provenance == Provenance.observed
    for b in model.bottlenecks:
        assert b.value.provenance == Provenance.observed


# --- Test 3: the output matches the committed fixture's shape ---------------


def test_output_validates_against_committed_fixture() -> None:
    fixture_path = BACKEND_DIR / "tests" / "fixtures" / "process_model.example.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    # The committed fixture itself is a valid ProcessModel.
    ProcessModel.model_validate(fixture)

    events = [
        _ev("c1", "A", 0, 0, 1), _ev("c1", "B", 5, 15, 2, resource="r1"),
        _ev("c1", "C", 20, 25, 3),
    ]
    model = discover_process_model(events, "shape")
    dumped = model.model_dump(mode="json")

    # Same top-level contract shape as the fixture, and it round-trips.
    assert set(dumped.keys()) == set(fixture.keys())
    ProcessModel.model_validate(dumped)


# --- Persistence round-trip (needs a database) -----------------------------


def test_persist_and_reload_round_trip(session: Any) -> None:
    import sqlalchemy as sa
    from app.db import Dataset, DatasetSource, DatasetStatus, Event
    from app.services import discovery

    dataset = Dataset(
        name="tiny discovery ds",
        source=DatasetSource.generated,
        status=DatasetStatus.ready,
    )
    session.add(dataset)
    session.flush()

    rows = [
        _ev("c1", "A", 0, 0, 1), _ev("c1", "B", 5, 15, 2, resource="r1"),
        _ev("c1", "C", 20, 25, 3),
        _ev("c2", "A", 0, 0, 1), _ev("c2", "B", 10, 30, 2, resource="r1"),
        _ev("c2", "C", 50, 60, 3),
    ]
    session.add_all(
        Event(
            dataset_id=dataset.id, case_id=r.case_id, activity=r.activity,
            start_ts=r.start_ts, end_ts=r.end_ts, resource_id=r.resource_id,
            status=r.status, seq=r.seq, attributes=r.attributes,
        )
        for r in rows
    )
    session.flush()

    model = discovery.run_discovery(session, str(dataset.id))
    assert model.nodes and model.edges

    reloaded = discovery.get_saved_process_model(session, str(dataset.id))
    assert reloaded is not None
    assert reloaded.model_dump(mode="json") == model.model_dump(mode="json")

    # Re-discovery replaces the single cached row (UNIQUE on dataset_id).
    discovery.run_discovery(session, str(dataset.id))
    count = session.execute(
        sa.text("SELECT count(*) FROM process_models WHERE dataset_id = :d"),
        {"d": dataset.id},
    ).scalar_one()
    assert count == 1


# --- API endpoints (POST discover -> GET discovery) ------------------------


def test_discover_and_get_endpoints(session: Any) -> None:
    from uuid import uuid4

    from app.db import Dataset, DatasetSource, DatasetStatus, Event, get_db
    from app.main import app
    from fastapi.testclient import TestClient

    dataset = Dataset(
        name="api discovery ds", source=DatasetSource.generated, status=DatasetStatus.ready
    )
    session.add(dataset)
    session.flush()
    session.add_all(
        Event(
            dataset_id=dataset.id, case_id=r.case_id, activity=r.activity,
            start_ts=r.start_ts, end_ts=r.end_ts, resource_id=r.resource_id,
            status=r.status, seq=r.seq, attributes=r.attributes,
        )
        for r in [
            _ev("c1", "A", 0, 0, 1), _ev("c1", "B", 5, 15, 2, resource="r1"),
            _ev("c1", "C", 20, 25, 3),
        ]
    )
    session.flush()

    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    try:
        # GET before discovery -> 404.
        assert client.get(f"/api/discovery/{dataset.id}").status_code == 404

        resp = client.post(f"/api/datasets/{dataset.id}/discover")
        assert resp.status_code == 200
        body = resp.json()
        assert body["job_type"] == "discovery"
        assert body["status"] == "succeeded"
        assert body["result_type"] == "process_model"
        assert body["result_id"] == str(dataset.id)

        got = client.get(f"/api/discovery/{dataset.id}")
        assert got.status_code == 200
        model = got.json()
        assert model["dataset_id"] == str(dataset.id)
        assert model["nodes"] and model["edges"]

        # Unknown dataset -> 404 on both routes.
        assert client.post(f"/api/datasets/{uuid4()}/discover").status_code == 404
        assert client.get(f"/api/discovery/{uuid4()}").status_code == 404
    finally:
        app.dependency_overrides.clear()

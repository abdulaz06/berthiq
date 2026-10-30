from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest
from app.db import Dataset, DatasetSource, DatasetStatus, Event, get_db
from app.main import app
from app.schemas.scenarios import OptimizationResult, SimulationResult
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import generate_dataset as g  # noqa: E402


@pytest.fixture
def api(session):
    gen = g.generate(g.load_port_config("khalifa"))
    ds = Dataset(
        id=gen.dataset_id,
        name=gen.dataset_name,
        source=DatasetSource.builtin,
        status=DatasetStatus.ready,
        port_config="khalifa",
        seed=gen.seed,
        event_count=len(gen.events),
        case_count=len(gen.cases),
        time_range_start=gen.window_start,
        time_range_end=gen.window_end,
        stats={"active_case_count": sum(c.is_active for c in gen.cases)},
    )
    session.add(ds)
    session.flush()
    session.add_all([Event(dataset_id=ds.id, **vars(e)) for e in gen.events])
    session.commit()
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield TestClient(app), str(ds.id), {"X-Demo-Session": str(uuid.uuid4())}
    finally:
        app.dependency_overrides.clear()


def test_integrated_real_decision_loop_and_isolation(api):
    client, did, headers = api
    assert client.get("/api/datasets").status_code == 200
    assert not client.get(f"/api/datasets/{did}/validation").json()["is_blocking"]
    discovery = client.post(f"/api/datasets/{did}/discover").json()
    assert client.get(f"/api/jobs/{discovery['id']}").json()["status"] == "succeeded"
    process = client.get(f"/api/discovery/{did}").json()
    assert process["bottlenecks"][0]["activity"] == "Authority review"
    risk = client.get(f"/api/datasets/{did}/risk").json()
    assert risk["cases"]
    operations = client.get(f"/api/datasets/{did}/operations").json()
    assert operations["vessels"] and len(operations["berths"]) == 8
    scenario = client.post(
        "/api/scenarios",
        headers=headers,
        json={
            "dataset_id": did,
            "name": "Five-reviewer experiment",
            "constraints": {"reviewer_count": 5},
        },
    )
    assert scenario.status_code == 201, scenario.text
    sid = scenario.json()["id"]
    assert (
        client.get(
            f"/api/scenarios/{sid}", headers={"X-Demo-Session": str(uuid.uuid4())}
        ).status_code
        == 404
    )
    job = client.post(f"/api/scenarios/{sid}/optimize", headers=headers)
    assert job.status_code == 202, job.text
    completed = client.get(f"/api/jobs/{job.json()['id']}", headers=headers).json()
    assert completed["status"] == "succeeded", completed
    opt = OptimizationResult.model_validate(
        client.get(f"/api/optimization/{completed['result_id']}", headers=headers).json()
    )
    assert opt.solver_status in {"OPTIMAL", "FEASIBLE"}
    assert all(opt.constraint_checks.values())
    job = client.post(
        f"/api/scenarios/{sid}/simulate",
        headers=headers,
        json={
            "optimization_run_id": opt.run_id,
            "replications": 3,
        },
    )
    assert job.status_code == 202, job.text
    completed = client.get(f"/api/jobs/{job.json()['id']}", headers=headers).json()
    assert completed["status"] == "succeeded", completed
    sim = SimulationResult.model_validate(
        client.get(f"/api/simulation/{completed['result_id']}", headers=headers).json()
    )
    assert sim.replications == 3 and sim.replication_seeds == [20260601, 20260602, 20260603]
    exported = client.get(f"/api/scenarios/{sid}/export", headers=headers)
    assert exported.status_code == 200
    assert exported.json()["runs"][0]["result"]["evidence"] == opt.evidence.model_dump(mode="json")
    assert (
        exported.json()["runs"][1]["result"]["headline"] == sim.model_dump(mode="json")["headline"]
    )
    assert client.delete("/api/demo/session", headers=headers).status_code == 204
    assert client.get(f"/api/scenarios/{sid}", headers=headers).status_code == 404


def test_bad_requests_do_not_become_successes(api):
    client, did, headers = api
    assert (
        client.post(
            "/api/scenarios", json={"dataset_id": did, "name": "Missing session"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/scenarios",
            headers=headers,
            json={
                "dataset_id": did,
                "name": "Invalid",
                "constraints": {"reviewer_count": 100},
            },
        ).status_code
        == 422
    )
    assert client.get("/api/optimization/999999", headers=headers).status_code == 404


def test_worker_failure_and_restart_recovery(api, session, monkeypatch):
    from app.db import Job, JobStatus, JobType
    from app.services import compute, jobs

    client, did, headers = api
    sid = client.post(
        "/api/scenarios",
        headers=headers,
        json={
            "dataset_id": did,
            "name": "Failure test",
        },
    ).json()["id"]

    def fail(*args):
        raise ValueError("Controlled computation failure")

    monkeypatch.setattr(compute, "calculate", fail)
    job = client.post(f"/api/scenarios/{sid}/optimize", headers=headers).json()
    got = client.get(f"/api/jobs/{job['id']}", headers=headers).json()
    assert got["status"] == "failed" and "Controlled" in got["error"]

    def timeout(*args):
        raise compute.ComputeTimeout("Computation exceeded its time limit.")

    monkeypatch.setattr(compute, "calculate", timeout)
    timed = client.post(f"/api/scenarios/{sid}/optimize", headers=headers).json()
    timed_status = client.get(f"/api/jobs/{timed['id']}", headers=headers).json()
    assert timed_status["status"] == "failed" and "time limit" in timed_status["error"]
    # Both exception paths returned their slots, rather than permanently exhausting capacity.
    assert jobs.CAPACITY.acquire(blocking=False)
    assert jobs.CAPACITY.acquire(blocking=False)
    jobs.CAPACITY.release()
    jobs.CAPACITY.release()
    interrupted = Job(job_type=JobType.optimization, status=JobStatus.running)
    session.add(interrupted)
    session.commit()
    jobs.recover_interrupted(session)
    session.refresh(interrupted)
    assert interrupted.status == JobStatus.failed
    assert "restarted" in interrupted.error


def test_upload_is_private_and_builtin_is_immutable(api, monkeypatch):
    from app.config import settings

    client, did, headers = api
    assert (
        client.post(
            f"/api/datasets/{did}/mapping",
            headers=headers,
            json={
                "case_id": "case",
                "activity": "activity",
                "end_ts": "timestamp",
            },
        ).status_code
        == 409
    )
    monkeypatch.setattr(settings, "ENABLE_UPLOADS", True)
    response = client.post(
        "/api/datasets",
        headers=headers,
        files={
            "file": (
                "sample.csv",
                b"case_id,activity,end_ts\nC1,Start,2026-01-01T00:00:00Z\n",
                "text/csv",
            ),
        },
    )
    assert response.status_code == 201, response.text
    uploaded = response.json()["id"]
    assert client.get(f"/api/datasets/{uploaded}").status_code == 404
    assert client.get(f"/api/datasets/{uploaded}/risk").status_code == 404
    mapping = client.get(f"/api/datasets/{uploaded}/suggested-mapping", headers=headers).json()
    report = client.post(
        f"/api/datasets/{uploaded}/mapping", headers=headers, json=mapping["suggested"]
    )
    assert report.status_code == 200 and not report.json()["is_blocking"]
    assert client.get(f"/api/datasets/{uploaded}", headers=headers).json()["status"] == "ready"

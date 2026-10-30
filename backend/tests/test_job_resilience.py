from __future__ import annotations

import sys
from decimal import Decimal

import pytest
from app.db.models import Job, JobStatus, JobType
from app.services.compute import ComputeTimeout, run_process
from app.services.jobs import recover_interrupted


def test_worker_timeout_kills_the_owned_process_before_returning(tmp_path):
    marker = tmp_path / "must-not-exist"
    code = "import time,pathlib,sys; time.sleep(1); pathlib.Path(sys.argv[1]).touch()"
    with pytest.raises(ComputeTimeout, match="time limit"):
        run_process([sys.executable, "-c", code, str(marker)], {}, timeout=0.1)
    # Popen context has waited for the killed process; it cannot write later.
    assert not marker.exists()
    assert run_process(
        [sys.executable, "-c", 'print(\'{"result":{"ok":true}}\')'], {}, timeout=5
    ) == {"ok": True}


def test_worker_crash_does_not_expose_stderr():
    with pytest.raises(RuntimeError, match="stopped unexpectedly") as exc:
        run_process(
            [sys.executable, "-c", "raise RuntimeError('private internal diagnostic')"],
            {},
            timeout=5,
        )
    assert "private" not in str(exc.value)


def test_restart_fails_only_interrupted_jobs(session):
    rows = [
        Job(job_type=JobType.optimization, status=status, progress=Decimal("0.1"))
        for status in JobStatus
    ]
    session.add_all(rows)
    session.commit()
    originals = {row.id: row.status for row in rows}
    recover_interrupted(session)
    session.expire_all()
    for row in rows:
        if originals[row.id] in {JobStatus.pending, JobStatus.running}:
            assert row.status == JobStatus.failed and "restarted" in row.error
        else:
            assert row.status == originals[row.id]

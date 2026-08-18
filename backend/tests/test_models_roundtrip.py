"""M0-2 acceptance: ORM round-trip for each core table, plus cascade delete."""

from __future__ import annotations

from datetime import UTC, datetime

import sqlalchemy as sa
from app.db import (
    Case,
    CaseOutcome,
    Dataset,
    DatasetSource,
    DatasetStatus,
    Event,
    Job,
    JobStatus,
    JobType,
)
from sqlalchemy.orm import Session

TS = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


def _make_dataset(**overrides: object) -> Dataset:
    fields: dict[str, object] = {"name": "khalifa-demo", "source": DatasetSource.builtin}
    fields.update(overrides)
    return Dataset(**fields)


def test_dataset_roundtrip_applies_server_defaults(session: Session) -> None:
    ds = _make_dataset(port_config="khalifa", seed=42)
    session.add(ds)
    session.commit()
    session.refresh(ds)

    assert ds.id is not None  # gen_random_uuid() server default
    assert ds.status is DatasetStatus.validating  # 'validating' server default
    assert ds.event_count == 0 and ds.case_count == 0
    assert ds.created_at is not None
    assert ds.source is DatasetSource.builtin
    assert ds.seed == 42


def test_event_roundtrip_defaults_attributes(session: Session) -> None:
    ds = _make_dataset()
    session.add(ds)
    session.commit()

    ev = Event(dataset_id=ds.id, case_id="CALL-001", activity="ARRIVAL", end_ts=TS, seq=1)
    session.add(ev)
    session.commit()
    session.refresh(ev)

    fetched = session.get(Event, ev.id)
    assert fetched is not None
    assert fetched.case_id == "CALL-001"
    assert fetched.attributes == {}  # '{}'::jsonb server default
    assert fetched.end_ts is not None
    assert fetched.dataset_id == ds.id


def test_case_roundtrip_enum_and_unique(session: Session) -> None:
    ds = _make_dataset()
    session.add(ds)
    session.commit()

    case = Case(
        dataset_id=ds.id,
        case_id="CALL-001",
        is_active=True,
        outcome=CaseOutcome.active,
        loa=294.0,
        attributes={"vessel_type": "container"},
    )
    session.add(case)
    session.commit()
    session.refresh(case)

    assert case.outcome is CaseOutcome.active
    assert case.rework_count == 0  # server default
    assert case.attributes == {"vessel_type": "container"}

    # UNIQUE (dataset_id, case_id) is enforced.
    session.add(
        Case(dataset_id=ds.id, case_id="CALL-001", is_active=False, outcome=CaseOutcome.on_time)
    )
    try:
        session.commit()
        raised = False
    except sa.exc.IntegrityError:
        session.rollback()
        raised = True
    assert raised, "duplicate (dataset_id, case_id) should violate the unique constraint"


def test_job_roundtrip_defaults(session: Session) -> None:
    job = Job(job_type=JobType.optimization)
    session.add(job)
    session.commit()
    session.refresh(job)

    assert job.id is not None
    assert job.status is JobStatus.pending  # server default
    assert float(job.progress) == 0.0
    assert job.dataset_id is None  # nullable — jobs need not belong to a dataset
    assert job.created_at is not None and job.updated_at is not None


def test_delete_dataset_cascades(session: Session) -> None:
    ds = _make_dataset()
    session.add(ds)
    session.commit()
    dataset_id = ds.id

    session.add(Event(dataset_id=dataset_id, case_id="C1", activity="ARRIVAL", end_ts=TS))
    session.add(
        Case(dataset_id=dataset_id, case_id="C1", is_active=True, outcome=CaseOutcome.active)
    )
    session.add(Job(job_type=JobType.discovery, dataset_id=dataset_id))
    session.commit()

    session.delete(ds)
    session.commit()

    assert session.scalar(sa.select(sa.func.count()).select_from(Dataset)) == 0
    assert (
        session.scalar(
            sa.select(sa.func.count()).select_from(Event).where(Event.dataset_id == dataset_id)
        )
        == 0
    )
    assert (
        session.scalar(
            sa.select(sa.func.count()).select_from(Case).where(Case.dataset_id == dataset_id)
        )
        == 0
    )
    assert (
        session.scalar(
            sa.select(sa.func.count()).select_from(Job).where(Job.dataset_id == dataset_id)
        )
        == 0
    )

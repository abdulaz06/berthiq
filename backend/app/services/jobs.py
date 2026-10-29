"""Single-process bounded background jobs; durable status/results live in Postgres."""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from threading import BoundedSemaphore
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import AnalysisRun, Dataset, Event, Job, JobStatus, JobType, ScenarioRow
from app.schemas.jobs import JobStatus as JobResponse
from app.schemas.scenarios import (
    OptimizationResult,
    ScenarioSpec,
    SimulationRequest,
    SimulationResult,
)
from app.services import optimization, simulation
from app.services.ingestion import port_config
from app.services.planning import PlanningInput, Vessel, build_input

CAPACITY = BoundedSemaphore(2)
logger = logging.getLogger(__name__)


def status(job: Job) -> JobResponse:
    return JobResponse(
        id=str(job.id),
        job_type=job.job_type.value,
        status=job.status.value,
        progress=float(job.progress),
        result_type=job.result_type,
        result_id=job.result_id,
        error=job.error,
    )


def create_scenario(
    db: Session, dataset: Dataset, spec: ScenarioSpec, owner: uuid.UUID
) -> ScenarioRow:
    now = datetime.now(UTC)
    db.execute(sa.text("SELECT pg_advisory_xact_lock(742902)"))
    db.execute(sa.delete(ScenarioRow).where(ScenarioRow.expires_at < now))
    if (db.scalar(sa.select(sa.func.count()).select_from(ScenarioRow)) or 0) >= 500:
        raise ValueError("The public demo has reached its scenario capacity. Try again later.")
    if (
        db.scalar(
            sa.select(sa.func.count())
            .select_from(ScenarioRow)
            .where(ScenarioRow.owner_token == owner)
        )
        or 0
    ) >= 10:
        raise ValueError("This session has ten scenarios. Reset its workspace to create more.")
    cfg = port_config()
    events = list(
        db.scalars(
            sa.select(Event)
            .where(Event.dataset_id == dataset.id)
            .order_by(Event.case_id, Event.seq)
        )
    )
    if not dataset.time_range_end:
        raise ValueError("Dataset has no observation cutoff.")
    data = build_input(events, cfg, dataset.time_range_end)
    # Validate constraint references before allocating durable work.
    from app.services.planning import blocked, reviewers

    blocked(data, spec.constraints)
    reviewers(data, cfg, spec.constraints)
    payload = asdict(data)
    payload["epoch"] = data.epoch.isoformat()
    row = ScenarioRow(
        dataset_id=dataset.id,
        owner_token=owner,
        spec=spec.model_dump(mode="json"),
        snapshot={"planning": payload, "config": cfg},
        expires_at=now + timedelta(hours=settings.DEMO_TTL_HOURS),
    )
    db.add(row)
    db.commit()
    return row


def restore(snapshot: dict[str, Any]) -> tuple[PlanningInput, dict[str, Any]]:
    fields = dict(snapshot["planning"])
    fields["epoch"] = datetime.fromisoformat(fields["epoch"])
    fields["vessels"] = [Vessel(**v) for v in fields["vessels"]]
    return PlanningInput(**fields), snapshot["config"]


def execute(job_id: uuid.UUID, bind: Any, request: dict[str, Any] | None) -> None:
    """A fresh session per worker. Never reuse a request-scoped ORM session."""
    try:
        with Session(bind, expire_on_commit=False) as db:
            job = db.get(Job, job_id)
            if job is None:
                return
            try:
                job.status, job.progress = JobStatus.running, Decimal("0.1")
                db.commit()
                scenario = db.get(ScenarioRow, job.scenario_id)
                if not scenario:
                    raise ValueError("Scenario expired before the job started.")
                spec = ScenarioSpec.model_validate(scenario.spec)
                data, cfg = restore(scenario.snapshot)
                result: OptimizationResult | SimulationResult
                if job.job_type == JobType.optimization:
                    result = optimization.solve(data, cfg, spec)
                else:
                    sim_request = SimulationRequest.model_validate(request)
                    previous = db.get(AnalysisRun, int(sim_request.optimization_run_id))
                    if (
                        not previous
                        or previous.scenario_id != scenario.id
                        or previous.kind != "optimization"
                    ):
                        raise ValueError("Optimization run does not belong to this scenario.")
                    optimized = OptimizationResult.model_validate(previous.payload)
                    result = simulation.compare(data, cfg, spec, optimized, sim_request)
                run = AnalysisRun(scenario_id=scenario.id, kind=job.job_type.value, payload={})
                db.add(run)
                db.flush()
                result.run_id, result.scenario_id = str(run.id), str(scenario.id)
                run.payload = result.model_dump(mode="json")
                if request:
                    run.payload["optimization_run_id"] = request["optimization_run_id"]
                job.status, job.progress = JobStatus.succeeded, Decimal(1)
                job.result_type, job.result_id = job.job_type.value, str(run.id)
                db.commit()
            except Exception as exc:
                db.rollback()
                logger.exception("Analysis job failed: %s", job_id)
                job = db.get(Job, job_id)
                if job:
                    job.status = JobStatus.failed
                    job.error = (
                        str(exc)
                        if isinstance(exc, ValueError)
                        else "Computation failed; retry or reset this scenario."
                    )
                    db.commit()
    finally:
        CAPACITY.release()


def recover_interrupted(db: Session) -> None:
    db.execute(
        sa.update(Job)
        .where(Job.status.in_([JobStatus.pending, JobStatus.running]))
        .values(
            status=JobStatus.failed,
            error="Server restarted during this job. Please run it again.",
        )
    )
    db.execute(sa.delete(ScenarioRow).where(ScenarioRow.expires_at < datetime.now(UTC)))
    db.commit()

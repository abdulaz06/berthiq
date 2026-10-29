from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from fastapi.responses import JSONResponse

from app.api.dependencies import Db, Owner, dataset_or_404, ready_dataset
from app.db.models import AnalysisRun, Job, JobStatus, JobType, ScenarioRow
from app.schemas.jobs import JobStatus as JobResponse
from app.schemas.scenarios import (
    OptimizationResult,
    ScenarioRecord,
    ScenarioSpec,
    SimulationRequest,
    SimulationResult,
)
from app.services import jobs

router = APIRouter(tags=["scenarios and jobs"])


def owned_scenario(db, scenario_id: int, owner: uuid.UUID | None) -> ScenarioRow:
    row = db.get(ScenarioRow, scenario_id)
    if not row or row.owner_token != owner or row.expires_at < datetime.now(UTC):
        raise HTTPException(404, "Scenario not found or expired.")
    return row


def record(row: ScenarioRow) -> ScenarioRecord:
    return ScenarioRecord(
        id=str(row.id),
        spec=ScenarioSpec.model_validate(row.spec),
        created_at=row.created_at,
        expires_at=row.expires_at,
    )


@router.post("/scenarios", response_model=ScenarioRecord, status_code=201)
def create_scenario(spec: ScenarioSpec, db: Db, owner: Owner):
    dataset = ready_dataset(db, spec.dataset_id, owner)
    try:
        return record(jobs.create_scenario(db, dataset, spec, owner))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/scenarios", response_model=list[ScenarioRecord])
def list_scenarios(db: Db, owner: Owner):
    return [
        record(r)
        for r in db.scalars(
            sa.select(ScenarioRow)
            .where(
                ScenarioRow.owner_token == owner,
                ScenarioRow.expires_at > datetime.now(UTC),
            )
            .order_by(ScenarioRow.created_at.desc())
        )
    ]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioRecord)
def get_scenario(scenario_id: int, db: Db, owner: Owner):
    return record(owned_scenario(db, scenario_id, owner))


def enqueue(
    db,
    scenario: ScenarioRow,
    kind: JobType,
    tasks: BackgroundTasks,
    request: SimulationRequest | None = None,
) -> JobResponse:
    # Row lock makes the persisted per-scenario quota atomic.
    db.execute(sa.select(ScenarioRow).where(ScenarioRow.id == scenario.id).with_for_update())
    if (
        db.scalar(sa.select(sa.func.count()).select_from(Job).where(Job.scenario_id == scenario.id))
        >= 8
    ):
        raise HTTPException(429, "This scenario has reached its eight-run limit.")
    if not jobs.CAPACITY.acquire(blocking=False):
        raise HTTPException(429, "The compute workers are busy. Please retry shortly.")
    try:
        job = Job(
            job_type=kind,
            status=JobStatus.pending,
            dataset_id=scenario.dataset_id,
            scenario_id=scenario.id,
        )
        db.add(job)
        db.commit()
        response = jobs.status(job)
        tasks.add_task(
            jobs.execute, job.id, db.get_bind(), request.model_dump() if request else None
        )
        return response
    except Exception:
        jobs.CAPACITY.release()
        raise


@router.post("/scenarios/{scenario_id}/optimize", response_model=JobResponse, status_code=202)
def optimize(scenario_id: int, db: Db, owner: Owner, tasks: BackgroundTasks):
    return enqueue(db, owned_scenario(db, scenario_id, owner), JobType.optimization, tasks)


@router.post("/scenarios/{scenario_id}/simulate", response_model=JobResponse, status_code=202)
def simulate(
    scenario_id: int, request: SimulationRequest, db: Db, owner: Owner, tasks: BackgroundTasks
):
    scenario = owned_scenario(db, scenario_id, owner)
    try:
        run = db.get(AnalysisRun, int(request.optimization_run_id))
    except ValueError as exc:
        raise HTTPException(422, "Invalid optimization run ID.") from exc
    if not run or run.scenario_id != scenario.id or run.kind != "optimization":
        raise HTTPException(404, "Optimization run not found in this scenario.")
    if run.payload["solver_status"] not in {"OPTIMAL", "FEASIBLE"}:
        raise HTTPException(409, "A feasible optimization is required before simulation.")
    return enqueue(db, scenario, JobType.simulation, tasks, request)


def get_run(run_id: int, kind: str, db, owner: uuid.UUID) -> AnalysisRun:
    run = db.get(AnalysisRun, run_id)
    if not run or run.kind != kind:
        raise HTTPException(404, "Run not found.")
    owned_scenario(db, run.scenario_id, owner)
    return run


@router.get("/optimization/{run_id}", response_model=OptimizationResult)
def optimization_result(run_id: int, db: Db, owner: Owner):
    return OptimizationResult.model_validate(get_run(run_id, "optimization", db, owner).payload)


@router.get("/simulation/{run_id}", response_model=SimulationResult)
def simulation_result(run_id: int, db: Db, owner: Owner):
    return SimulationResult.model_validate(get_run(run_id, "simulation", db, owner).payload)


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: uuid.UUID, db: Db, x_demo_session: Annotated[uuid.UUID | None, Header()] = None
):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    if job.scenario_id:
        owned_scenario(db, job.scenario_id, x_demo_session)
    elif job.dataset_id:
        dataset_or_404(db, str(job.dataset_id), x_demo_session)
    return jobs.status(job)


@router.get("/scenarios/{scenario_id}/export")
def export(scenario_id: int, db: Db, owner: Owner):
    scenario = owned_scenario(db, scenario_id, owner)
    runs = list(
        db.scalars(
            sa.select(AnalysisRun)
            .where(AnalysisRun.scenario_id == scenario.id)
            .order_by(AnalysisRun.id)
        )
    )
    return JSONResponse(
        {
            "disclosure": "Synthetic operations; simulated outcomes, not measured savings.",
            "scenario": record(scenario).model_dump(mode="json"),
            "input_snapshot": scenario.snapshot,
            "runs": [{"kind": r.kind, "result": r.payload} for r in runs],
        },
        headers={
            "Content-Disposition": f'attachment; filename="berthiq-scenario-{scenario_id}.json"'
        },
    )


@router.delete("/demo/session", status_code=204)
def reset(db: Db, owner: Owner):
    active = db.scalar(
        sa.select(sa.func.count())
        .select_from(Job)
        .join(ScenarioRow, ScenarioRow.id == Job.scenario_id)
        .where(
            ScenarioRow.owner_token == owner, Job.status.in_([JobStatus.pending, JobStatus.running])
        )
    )
    if active:
        raise HTTPException(409, "Wait for running jobs before resetting this session.")
    db.execute(sa.delete(ScenarioRow).where(ScenarioRow.owner_token == owner))
    from app.db.models import Dataset

    db.execute(sa.delete(Dataset).where(Dataset.owner_token == owner))
    db.commit()

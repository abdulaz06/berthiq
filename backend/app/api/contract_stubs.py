"""SCAFFOLDING — contract stub routes (M0-4).

These endpoints exist ONLY so every M1 response schema from
docs/DATA_CONTRACTS.md §5 appears in the OpenAPI spec. That is what lets
``just types`` generate the full ``frontend/lib/types/api.ts`` before the real
endpoints exist — resolving the M0-3 open question (schemas don't surface in
OpenAPI until a route references them).

They are NOT implemented: every route returns HTTP 501. Each real endpoint
replaces its stub as the corresponding M1 backend task lands (M1-02 datasets,
M1-04 discovery, M1-07 risk, M1-09 optimize, M1-11 simulate). When you implement
a real route at one of these paths, delete its stub here — do not build features
in this file.
"""

from __future__ import annotations

from typing import NoReturn

from fastapi import APIRouter, status
from fastapi.exceptions import HTTPException

from app.schemas import (
    DataQualityReport,
    DatasetSummary,
    JobStatus,
    OptimizationResult,
    ScenarioSpec,
    SimulationResult,
)

router = APIRouter(tags=["contracts (scaffold)"])

_DETAIL = "Stub route: the real implementation lands with its M1 task."


def _not_implemented() -> NoReturn:
    """Every stub funnels here. ``NoReturn`` tells the type checker the declared
    response_model is satisfied vacuously (the body never returns normally)."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_DETAIL)


# --- Datasets & ingestion (§5.1) ------------------------------------------
@router.get("/datasets", response_model=list[DatasetSummary])
def list_datasets() -> list[DatasetSummary]:
    _not_implemented()


@router.get("/datasets/{dataset_id}", response_model=DatasetSummary)
def get_dataset(dataset_id: str) -> DatasetSummary:
    _not_implemented()


@router.get("/datasets/{dataset_id}/validation", response_model=DataQualityReport)
def get_validation(dataset_id: str) -> DataQualityReport:
    _not_implemented()


# --- Discovery (§5.2) ------------------------------------------------------
# Implemented for real in app/api/discovery.py (M1-04): POST
# /datasets/{id}/discover and GET /discovery/{dataset_id}. Stub removed.


# --- Prediction / risk (§5.3) ---------------------------------------------
# Implemented for real in app/api/risk.py (M1-07): GET /datasets/{id}/risk and
# GET /cases/{case_id}/explanation. Stub removed.


# --- Scenarios, optimization, simulation (§5.4) ---------------------------
@router.post("/scenarios", response_model=JobStatus)
def create_scenario(spec: ScenarioSpec) -> JobStatus:
    # `spec: ScenarioSpec` surfaces the request-body contract in OpenAPI.
    _not_implemented()


@router.get("/optimization/{run_id}", response_model=OptimizationResult)
def get_optimization(run_id: str) -> OptimizationResult:
    _not_implemented()


@router.get("/simulation/{run_id}", response_model=SimulationResult)
def get_simulation(run_id: str) -> SimulationResult:
    _not_implemented()


# --- Jobs (§5.5) -----------------------------------------------------------
@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str) -> JobStatus:
    _not_implemented()

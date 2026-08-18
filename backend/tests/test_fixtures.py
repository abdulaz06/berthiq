"""M0-3 acceptance: every committed fixture validates against its Pydantic model,
and the backend/frontend fixture copies are byte-identical.

This is the seam that lets the two halves build in parallel — the fixture is the
contract both sides agree on, so it must (a) be a valid instance of the schema and
(b) be literally the same bytes the frontend renders.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.schemas import (
    DataQualityReport,
    DatasetSummary,
    EvidenceRecord,
    JobStatus,
    KpiValue,
    OptimizationResult,
    ProcessModel,
    RiskBoard,
    ScenarioSpec,
    SimulationResult,
)
from pydantic import BaseModel

BACKEND_FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
FRONTEND_FIXTURES = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "fixtures"

# fixture stem → the schema its example must validate against.
FIXTURE_MODELS: dict[str, type[BaseModel]] = {
    "kpi_value": KpiValue,
    "evidence_record": EvidenceRecord,
    "dataset_summary": DatasetSummary,
    "data_quality_report": DataQualityReport,
    "process_model": ProcessModel,
    "risk_board": RiskBoard,
    "scenario_spec": ScenarioSpec,
    "optimization_result": OptimizationResult,
    "simulation_result": SimulationResult,
    "job_status": JobStatus,
}


@pytest.mark.parametrize("stem", sorted(FIXTURE_MODELS))
def test_fixture_validates_against_schema(stem: str) -> None:
    path = BACKEND_FIXTURES / f"{stem}.example.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    FIXTURE_MODELS[stem].model_validate(data)  # raises if the fixture is invalid


@pytest.mark.parametrize("stem", sorted(FIXTURE_MODELS))
def test_fixture_copies_are_byte_identical(stem: str) -> None:
    name = f"{stem}.example.json"
    backend_bytes = (BACKEND_FIXTURES / name).read_bytes()
    frontend_path = FRONTEND_FIXTURES / name
    assert frontend_path.exists(), f"missing frontend fixture copy: {frontend_path}"
    assert backend_bytes == frontend_path.read_bytes(), (
        f"{name} differs between backend/ and frontend/ fixture folders"
    )

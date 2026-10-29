from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest
from app.schemas.scenarios import ScenarioConstraints, ScenarioSpec
from app.services.optimization import solve
from app.services.planning import build_input, reviewers, verify

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import generate_dataset as g  # noqa: E402


def test_reference_is_feasible_and_independently_verified(reference):
    data, cfg = reference
    spec = ScenarioSpec(
        dataset_id="reference", name="Review capacity", constraints={"reviewer_count": 5}
    )
    result = solve(data, cfg, spec)
    assert result.solver_status in {"OPTIMAL", "FEASIBLE"}, result
    assert len(result.assignments) == len(data.vessels)
    assert all(result.constraint_checks.values())
    assert all(
        verify(
            data, result.assignments, spec.constraints, reviewers(data, cfg, spec.constraints)
        ).values()
    )
    assert result.objective_value <= result.baseline_objectives["fifo"]
    assert result.runtime_ms < 12_000


def test_incompatible_lock_is_infeasible(reference):
    data, cfg = reference
    vessel = next(v for v in data.vessels if v.vessel_type == "container")
    result = solve(
        data,
        cfg,
        ScenarioSpec(
            dataset_id="reference",
            name="Impossible lock",
            constraints={"locked_berths": {vessel.id: "KBT-1"}},
        ),
    )
    assert result.solver_status == "INFEASIBLE"
    assert not result.assignments
    assert result.objective_value is None
    assert result.infeasibility[0].kind == "berth_compatibility"


def test_unsupported_policy_rejected():
    with pytest.raises(ValueError, match="Parallel review"):
        ScenarioConstraints(allow_parallel_low_risk=True)


def test_completed_future_events_do_not_enter_input(reference):
    data, cfg = reference
    generated = g.generate(cfg)
    earlier = datetime.fromisoformat("2026-07-30T12:00:00+04:00")
    original = build_input(list(generated.events), cfg, earlier)
    truncated = build_input([e for e in generated.events if e.end_ts <= earlier], cfg, earlier)
    assert original == truncated


def test_verifier_rejects_tampered_schedule_and_solver_is_repeatable(reference):
    data, cfg = reference
    spec = ScenarioSpec(dataset_id="reference", name="Repeatable")
    one, two = solve(data, cfg, spec), solve(data, cfg, spec)
    assert one.assignments == two.assignments
    assert one.objective_value == two.objective_value
    staff = reviewers(data, cfg, spec.constraints)
    broken = [a.model_copy(deep=True) for a in one.assignments]
    broken[0].start = data.at(-100_000)
    checks = verify(data, broken, spec.constraints, staff)
    assert not checks["horizon"] and not checks["arrival_readiness"]
    assert not verify(data, broken[:-1], spec.constraints, staff)["exactly_once"]


def test_closed_berths_are_infeasible_with_honest_explanation(reference):
    data, cfg = reference
    spec = ScenarioSpec(
        dataset_id="reference",
        name="All berths closed",
        constraints={
            "horizon_hours": 24,
            "berth_closures": [
                {"berth": b["id"], "start": data.at(0), "end": data.at(24 * 60)}
                for b in data.berths
            ],
        },
    )
    result = solve(data, cfg, spec)
    assert result.solver_status == "INFEASIBLE"
    assert not result.assignments
    assert "not a minimal unsatisfiable core" in result.narrative

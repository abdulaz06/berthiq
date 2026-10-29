from __future__ import annotations

from app.schemas.scenarios import ScenarioSpec, SimulationRequest
from app.services.optimization import solve
from app.services.simulation import compare, random_inputs, simulate_once


def test_matched_simulation_is_deterministic_and_reports_all_costs(reference):
    data, cfg = reference
    spec = ScenarioSpec(
        dataset_id="reference", name="Staffing experiment", constraints={"reviewer_count": 5}
    )
    optimization = solve(data, cfg, spec)
    request = SimulationRequest(optimization_run_id="test", replications=5)
    first = compare(data, cfg, spec, optimization, request)
    second = compare(data, cfg, spec, optimization, request)
    assert first == second
    assert first.replication_seeds == [20260601 + i for i in range(5)]
    assert len(first.samples["baseline"]["avg_waiting_time"]) == 5
    assert (
        first.tradeoffs["reviewer_staffed_hours"][1].value
        > first.tradeoffs["reviewer_staffed_hours"][0].value
    )
    assert all(v.provenance == "simulated" for pair in first.headline.values() for v in pair)
    assert first.baseline[0].std > 0
    for side in [first.baseline_schedule, first.optimized_schedule]:
        for a in side:
            for b in side:
                if a.vessel != b.vessel and a.berth == b.berth:
                    assert a.end <= b.start or b.end <= a.start


def test_identical_plan_and_random_stream_gives_identical_result(reference):
    data, cfg = reference
    spec = ScenarioSpec(dataset_id="reference", name="Same plan")
    result = solve(data, cfg, spec)
    draws = random_inputs(data, cfg, 42)
    assert simulate_once(data, cfg, result.assignments, spec.constraints, draws) == simulate_once(
        data, cfg, result.assignments, spec.constraints, draws
    )

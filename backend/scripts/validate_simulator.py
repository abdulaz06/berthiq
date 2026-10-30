"""Offline historical backtest. Held-out generator truth is scoring-only."""

from __future__ import annotations

import json
import math
import statistics
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate_dataset as generator  # noqa: E402
from app.schemas.scenarios import ScenarioConstraints  # noqa: E402
from app.services.optimization import baseline  # noqa: E402
from app.services.planning import build_input, compatible, reviewers  # noqa: E402
from app.services.simulation import random_inputs, simulate_once  # noqa: E402


def forecast(events, cfg, cutoff, replications=20) -> dict[str, Any]:
    # This boundary accepts event prefixes, not Case summaries or ground_truth.
    prefix = [event for event in events if event.end_ts <= cutoff]
    data = build_input(prefix, cfg, cutoff)
    constraints = ScenarioConstraints(horizon_hours=168)
    plan = baseline(data, constraints, reviewers(data, cfg, constraints), "no_change")
    if not plan:
        incompatible = [
            v.id
            for v in data.vessels
            if v.original_berth
            and not any(b["id"] == v.original_berth and compatible(v, b) for b in data.berths)
        ]
        raise ValueError(
            "Historical prefix has no feasible no-change plan. "
            f"Historical berth incompatible with current rules: {incompatible}"
        )
    samples: dict[str, list[float]] = {v.id: [] for v in data.vessels}
    failures = []
    for seed in range(20260601, 20260601 + replications):
        try:
            _, schedules = simulate_once(
                data, cfg, plan, constraints, random_inputs(data, cfg, seed)
            )
            for assignment in schedules:
                samples[assignment.vessel].append(
                    (assignment.cargo_start - cutoff).total_seconds() / 3600
                )
        except ValueError as exc:
            failures.append({"seed": seed, "reason": str(exc)})
    return {
        "samples": samples,
        "failures": failures,
        "deterministic": {a.vessel: (a.cargo_start - cutoff).total_seconds() / 3600 for a in plan},
        "prefix_events": len(prefix),
        "latest_input": max(e.end_ts for e in prefix).isoformat(),
    }


def score(predicted: dict, historical_cargo: dict[str, Any], cutoff) -> dict:
    rows = []
    censored = []
    for cid, draws in sorted(predicted["samples"].items()):
        if cid not in historical_cargo or not draws:
            censored.append(cid)
            continue
        truth = (historical_cargo[cid] - cutoff).total_seconds() / 3600
        if truth <= 0:
            raise ValueError("Scoring must use completions strictly after the observation cutoff.")
        ordered = sorted(draws)
        p10, p90 = (ordered[max(0, math.ceil(len(draws) * p) - 1)] for p in (0.1, 0.9))
        median = statistics.median(draws)
        rows.append(
            {
                "case_id": cid,
                "historical_hours": truth,
                "simulated_p50_hours": median,
                "simulated_p10_hours": p10,
                "simulated_p90_hours": p90,
                "error_hours": median - truth,
                "covered": p10 <= truth <= p90,
                "deterministic_error_hours": predicted["deterministic"][cid] - truth,
            }
        )
    return {
        "scored_cases": len(rows),
        "censored_or_failed_cases": censored,
        "mae_hours": statistics.mean(abs(r["error_hours"]) for r in rows),
        "bias_hours": statistics.mean(r["error_hours"] for r in rows),
        "p10_p90_coverage": statistics.mean(r["covered"] for r in rows),
        "deterministic_plan_mae_hours": statistics.mean(
            abs(r["deterministic_error_hours"]) for r in rows
        ),
        "cases": rows,
    }


def evaluate() -> dict:
    cfg = generator.load_port_config("khalifa")
    generated = generator.generate(cfg)
    historical_cargo = {
        case.case_id: case.actual_berthing_ts
        for case in generated.cases
        if case.actual_berthing_ts is not None and not case.is_active
    }
    windows = []
    for days in (56, 49, 42, 35, 28, 21, 14, 7):
        cutoff = generated.window_end - timedelta(days=days)
        try:
            predicted = forecast(generated.events, cfg, cutoff)
        except ValueError as exc:
            windows.append({"cutoff": cutoff.isoformat(), "forecast_failure": str(exc)})
            continue
        windows.append(
            {
                "cutoff": cutoff.isoformat(),
                "prefix_events": predicted["prefix_events"],
                "latest_input": predicted["latest_input"],
                "failed_replications": predicted["failures"],
                **score(predicted, historical_cargo, cutoff),
            }
        )
    return {
        "method": "Frozen prefix forecasts scored against held-out generator cargo starts",
        "generator_seed": generated.seed,
        "replications_per_cutoff": 20,
        "simulation_seed_start": 20260601,
        "horizon_hours": 168,
        "known_generator_bottleneck": generated.ground_truth["true_bottleneck"],
        "windows": windows,
        "limitations": [
            "Synthetic retrospective backtest; not external validation or real-world savings.",
            "No parameters fitted or tuned on held-out completions or hidden generator state.",
            "Historical generator dispatch differs from the forecast no-change planner.",
            "Intervals describe simulator variability, not calibrated predictive confidence.",
            "Repeated vessels across cutoffs are correlated; windows are reported separately.",
            "This checks baseline timing, not causal validity of staffing counterfactuals.",
        ],
    }


if __name__ == "__main__":
    report = evaluate()
    path = Path(__file__).resolve().parents[2] / "DOCS/SIMULATOR_VALIDATION.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for window in report["windows"]:
        if "forecast_failure" in window:
            print(f"{window['cutoff']}: FAILED: {window['forecast_failure']}")
            continue
        print(
            f"{window['cutoff']}: n={window['scored_cases']} "
            f"MAE={window['mae_hours']:.2f}h coverage={window['p10_p90_coverage']:.1%}"
        )

"""Matched-seed SimPy counterfactuals; actual resource queues determine outcomes."""

from __future__ import annotations

import hashlib
import math
import random
import statistics
from collections import defaultdict
from typing import Any

import simpy

from app.schemas.common import KpiValue
from app.schemas.scenarios import (
    Assignment,
    KpiDistribution,
    OptimizationResult,
    ScenarioConstraints,
    ScenarioSpec,
    SimulationRequest,
    SimulationResult,
)
from app.services.optimization import baseline
from app.services.planning import PlanningInput, blocked, reviewers

UNITS = {
    "avg_waiting_time": "hours",
    "window_compliance": "percent",
    "berth_conflicts": "count",
    "reviewer_overtime": "hours",
    "workload_imbalance": "hours",
    "reviewer_staffed_hours": "hours",
}


def random_inputs(data: PlanningInput, cfg: dict[str, Any], seed: int) -> dict[str, dict[str, Any]]:
    """Streams keyed by case, not execution order: true common random numbers."""
    draws = {}
    for v in data.vessels:
        digest = hashlib.sha256(f"{seed}:{v.id}".encode()).digest()
        rng = random.Random(int.from_bytes(digest[:8], "big"))
        attempts = 1
        # Observable missing documents proxy for rework; no hidden completeness labels.
        if v.review_duration:
            reject_probability = min(
                0.75, cfg["levers"]["rework"]["base_reject_prob"] + 0.08 * v.missing_docs
            )
            while attempts < 3 and rng.random() < reject_probability:
                attempts += 1
        draws[v.id] = {
            "reviews": [max(60, round(rng.gauss(v.review_duration, 50))) for _ in range(attempts)]
            if v.review_duration
            else [],
            "rework_docs": [round(rng.uniform(120, 360)) for _ in range(attempts - 1)],
            "pilot": max(30, round(v.pilot * rng.uniform(0.8, 1.2))),
            "occupancy": max(180, round(v.occupancy * rng.uniform(0.7, 1.3))),
        }
    return draws


def simulate_once(
    data: PlanningInput,
    cfg: dict[str, Any],
    plan: list[Assignment],
    c: ScenarioConstraints,
    draws: dict[str, dict[str, Any]],
) -> tuple[dict[str, float], list[Assignment]]:
    if len(plan) != len(data.vessels):
        raise ValueError("Simulation requires one verified assignment per active vessel.")
    env = simpy.Environment()
    berths = {b["id"]: simpy.Resource(env, 1) for b in data.berths}
    pilots = simpy.Resource(env, data.pilot_count)
    staff = reviewers(data, cfg, c)
    rev_resources = {r.id: simpy.Resource(env, 1) for r in staff}
    staff_by_id = {r.id: r for r in staff}
    closures = blocked(data, c)
    vessel_by_id = {v.id: v for v in data.vessels}
    schedules: list[Assignment] = []
    work = dict.fromkeys(rev_resources, 0.0)
    shift_work: dict[tuple[str, int], float] = defaultdict(float)
    overtime = [0.0]

    def vessel_process(a: Assignment):
        v, sample = vessel_by_id[a.vessel], draws[a.vessel]
        first_review, last_review = None, None
        if v.review_duration:
            if not a.reviewer or a.reviewer not in rev_resources:
                raise ValueError("Review assignment missing from plan.")
            r = staff_by_id[a.reviewer]
            yield env.timeout(
                max(0, data.minute(a.review_start) - env.now) if a.review_start else v.review_ready
            )
            for i, duration in enumerate(sample["reviews"]):
                with rev_resources[r.id].request() as request:
                    yield request
                    window = next(
                        (
                            (wi, lo, nominal, hi)
                            for wi, (lo, nominal, hi) in enumerate(r.windows)
                            if max(lo, env.now) < nominal
                            and max(lo, env.now) + duration <= hi
                            and shift_work[r.id, wi] + duration <= r.cap
                        ),
                        None,
                    )
                    if window is None:
                        raise ValueError(
                            "Sampled review workload exceeds the scenario horizon/caps."
                        )
                    wi, lo, nominal, _ = window
                    yield env.timeout(max(0, lo - env.now))
                    if first_review is None:
                        first_review = env.now
                    yield env.timeout(duration)
                    last_review = env.now
                    overtime[0] += max(0, env.now - nominal)
                    work[r.id] += duration
                    shift_work[r.id, wi] += duration
                if i < len(sample["rework_docs"]):
                    yield env.timeout(sample["rework_docs"][i])
        ready = max(env.now + v.planning, v.arrival, data.minute(a.start))
        yield env.timeout(max(0, ready - env.now))
        with berths[a.berth].request() as berth_req:
            yield berth_req
            with pilots.request() as pilot_req:
                yield pilot_req
                start = env.now
                for lo, hi in closures[a.berth]:
                    if start + sample["pilot"] + sample["occupancy"] <= lo:
                        break
                    if start < hi:
                        start = hi
                yield env.timeout(start - env.now)
                yield env.timeout(sample["pilot"])
                cargo = env.now
            yield env.timeout(sample["occupancy"])
            schedules.append(
                Assignment(
                    vessel=v.id,
                    berth=a.berth,
                    reviewer=a.reviewer,
                    start=data.at(start),
                    cargo_start=data.at(cargo),
                    end=data.at(env.now),
                    review_start=data.at(first_review) if first_review is not None else None,
                    review_end=data.at(last_review) if last_review is not None else None,
                )
            )

    for a in sorted(plan, key=lambda a: (a.review_start or a.start, a.vessel)):
        env.process(vessel_process(a))
    env.run()
    waits, on_time = [], []
    conflicts = 0
    for a in schedules:
        v = vessel_by_id[a.vessel]
        assert a.cargo_start is not None
        cargo = (a.cargo_start - data.epoch).total_seconds() / 60
        waits.append((cargo - v.arrival) / 60)
        on_time.append(cargo <= v.deadline)
    for i, a in enumerate(schedules):
        for b in schedules[i + 1 :]:
            assert a.end is not None and b.end is not None
            conflicts += a.berth == b.berth and a.start < b.end and b.start < a.end
    horizon = c.horizon_hours * 60
    staffed = sum(max(0, min(hi, horizon) - lo) for r in staff for lo, _, hi in r.windows) / 60
    return {
        "avg_waiting_time": statistics.mean(waits),
        "window_compliance": 100 * statistics.mean(on_time),
        "berth_conflicts": float(conflicts),
        "reviewer_overtime": overtime[0] / 60,
        "workload_imbalance": (max(work.values()) - min(work.values())) / 60,
        "reviewer_staffed_hours": staffed,
    }, sorted(schedules, key=lambda a: a.vessel)


def distribution(name: str, values: list[float]) -> KpiDistribution:
    ordered = sorted(values)

    def percentile(p: float) -> float:
        return ordered[max(0, math.ceil(p * len(ordered)) - 1)]

    return KpiDistribution(
        name=name,
        unit=UNITS[name],
        mean=statistics.mean(values),
        std=statistics.pstdev(values),
        p10=percentile(0.1),
        p50=percentile(0.5),
        p90=percentile(0.9),
    )


def compare(
    data: PlanningInput,
    cfg: dict[str, Any],
    spec: ScenarioSpec,
    result: OptimizationResult,
    request: SimulationRequest,
) -> SimulationResult:
    if result.solver_status not in {"OPTIMAL", "FEASIBLE"}:
        raise ValueError("Simulation needs a feasible optimization result.")
    base_constraints = ScenarioConstraints(
        horizon_hours=spec.constraints.horizon_hours, berth_closures=spec.constraints.berth_closures
    )
    base_staff = reviewers(data, cfg, base_constraints)
    base_plan = baseline(data, base_constraints, base_staff, "no_change")
    if not base_plan:
        raise ValueError("The no-change baseline cannot be scheduled in the requested horizon.")
    seeds = [request.seed + i for i in range(request.replications)]
    samples: dict[str, dict[str, list[float]]] = {
        side: {k: [] for k in UNITS} for side in ("baseline", "optimized")
    }
    example_plans: dict[str, list[Assignment]] = {}
    for i, seed in enumerate(seeds):
        draws = random_inputs(data, cfg, seed)
        for side, plan, constraints in [
            ("baseline", base_plan, base_constraints),
            ("optimized", result.assignments, spec.constraints),
        ]:
            values, actual = simulate_once(data, cfg, plan, constraints, draws)
            for name, value in values.items():
                samples[side][name].append(value)
            if i == 0:
                example_plans[side] = actual
    distributions = {
        side: [distribution(k, v) for k, v in values.items()] for side, values in samples.items()
    }
    pairs = {
        k: (
            KpiValue(
                value=statistics.mean(samples["baseline"][k]), unit=unit, provenance="simulated"
            ),
            KpiValue(
                value=statistics.mean(samples["optimized"][k]), unit=unit, provenance="simulated"
            ),
        )
        for k, unit in UNITS.items()
    }
    return SimulationResult(
        run_id="",
        scenario_id="",
        seed=request.seed,
        replications=request.replications,
        baseline=distributions["baseline"],
        optimized=distributions["optimized"],
        headline={
            k: pairs[k] for k in ("avg_waiting_time", "window_compliance", "berth_conflicts")
        },
        tradeoffs={
            k: pairs[k]
            for k in ("reviewer_overtime", "workload_imbalance", "reviewer_staffed_hours")
        },
        replication_seeds=seeds,
        samples=samples,
        baseline_schedule=example_plans["baseline"],
        optimized_schedule=example_plans["optimized"],
        assumptions=data.assumptions
        + [
            "Baseline preserves observed berth choices and configured reviewer capacity; "
            "missing choices are completed with FIFO. Closures apply to both sides.",
            "Identical per-case random streams drive both plans, independent of execution order.",
            "Review rework uses observable missing-document counts; up to three attempts.",
            "Schedules show replication one; headline KPIs summarize every replication.",
            "Resource queues prevent overlaps on both sides; zero conflicts may remain zero.",
            "Variation intervals describe sampled outcomes, not confidence in real-world savings.",
        ],
    )

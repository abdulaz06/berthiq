"""Bounded CP-SAT joint reviewer/berth scheduling with independent verification."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

from ortools.sat.python import cp_model

from app.schemas.common import KpiValue
from app.schemas.evidence import ConstraintRef, EvidenceRecord
from app.schemas.scenarios import (
    Assignment,
    ObjectiveWeights,
    OptimizationResult,
    ScenarioConstraints,
    ScenarioSpec,
)
from app.services.planning import PlanningInput, Reviewer, blocked, compatible, reviewers, verify


def objective_terms(
    data: PlanningInput,
    plan: list[Assignment],
    c: ScenarioConstraints,
    staff: list[Reviewer],
) -> dict[str, float]:
    lookup = {v.id: v for v in data.vessels}
    loads = dict.fromkeys((r.id for r in staff), 0)
    overtime = waiting = tardiness = changes = 0
    for a in plan:
        v = lookup[a.vessel]
        cargo = data.minute(a.cargo_start or a.start)
        waiting += cargo - v.arrival
        tardiness += max(0, cargo - v.deadline) * (3 if v.id in c.priority_vessels else 1)
        changes += bool(v.original_berth and a.berth != v.original_berth)
        if a.reviewer and a.review_start and a.review_end:
            rs, re = data.minute(a.review_start), data.minute(a.review_end)
            loads[a.reviewer] += re - rs
            r = next(r for r in staff if r.id == a.reviewer)
            nominal = next(n for lo, n, hi in r.windows if lo <= rs < re <= hi)
            overtime += max(0, re - nominal)
    return {
        "waiting_time": float(waiting),
        "tardiness": float(tardiness),
        "reviewer_overtime": float(overtime),
        "workload_imbalance": float(max(loads.values()) - min(loads.values())),
        "plan_changes": float(changes),
    }


def objective(terms: dict[str, float], weights: ObjectiveWeights) -> float:
    # CP-SAT integer objective uses 0.01 precision for user weights.
    return sum(value * round(getattr(weights, key) * 100) for key, value in terms.items()) / 100


def baseline(
    data: PlanningInput,
    c: ScenarioConstraints,
    staff: list[Reviewer],
    mode: str,
) -> list[Assignment]:
    occupancy = blocked(data, c)
    rev_free = dict.fromkeys((r.id for r in staff), 0)
    rev_load: dict[tuple[str, int], int] = defaultdict(int)
    pilot_free = [0] * data.pilot_count
    order = sorted(
        data.vessels,
        key=lambda v: (
            v.deadline if mode == "greedy" else v.arrival,
            v.id,
        ),
    )
    result = []
    for v in order:
        rs = re = 0
        rid = None
        if v.review_duration:
            choices = []
            for r in staff:
                for wi, (lo, nominal, hi) in enumerate(r.windows):
                    start = max(v.review_ready, lo, rev_free[r.id])
                    if (
                        start < nominal
                        and start + v.review_duration <= hi
                        and rev_load[r.id, wi] + v.review_duration <= r.cap
                    ):
                        choices.append((start, r.id, wi))
            if not choices:
                return []
            rs, rid, wi = min(choices)
            re = rs + v.review_duration
            rev_free[rid] = re
            rev_load[rid, wi] += v.review_duration
        lock = (c.locked_berths or {}).get(v.id)
        if mode == "no_change" and v.original_berth:
            lock = v.original_berth
        candidates = []
        for b in data.berths:
            if not compatible(v, b) or (lock and lock != b["id"]):
                continue
            for pi, pfree in enumerate(pilot_free):
                start = max(0, v.arrival, re + v.planning, pfree)
                duration = v.pilot + v.occupancy
                for lo, hi in sorted(occupancy[b["id"]]):
                    if start + duration <= lo:
                        break
                    if start < hi:
                        start = hi
                candidates.append((start, b["id"], pi))
        if not candidates:
            return []
        start, bid, pilot = min(candidates)
        cargo, end = start + v.pilot, start + v.pilot + v.occupancy
        if end > c.horizon_hours * 60:
            return []
        pilot_free[pilot] = cargo
        occupancy[bid].append((start, end))
        result.append(
            Assignment(
                vessel=v.id,
                berth=bid,
                start=data.at(start),
                cargo_start=data.at(cargo),
                end=data.at(end),
                reviewer=rid,
                review_start=data.at(rs) if rid else None,
                review_end=data.at(re) if rid else None,
            )
        )
    return sorted(result, key=lambda a: a.vessel)


def solve(data: PlanningInput, cfg: dict[str, Any], spec: ScenarioSpec) -> OptimizationResult:
    began = time.perf_counter()
    c, w = spec.constraints, spec.objective_weights
    staff = reviewers(data, cfg, c)
    horizon = c.horizon_hours * 60
    occupied = blocked(data, c)
    conflicts = []
    ids = {v.id for v in data.vessels}
    if set(c.locked_berths or {}) - ids or set(c.priority_vessels) - ids:
        raise ValueError("Locks and priorities must reference active vessel case IDs.")
    allowed = {}
    for v in data.vessels:
        lock = (c.locked_berths or {}).get(v.id)
        allowed[v.id] = [
            b for b in data.berths if compatible(v, b) and (not lock or b["id"] == lock)
        ]
        if not allowed[v.id]:
            conflicts.append(
                ConstraintRef(
                    kind="berth_compatibility",
                    detail=(
                        f"{v.id}: no berth meets terminal, length ({v.loa} m), draft ({v.draft} m)"
                        + (f" and lock to {lock}." if lock else ".")
                    ),
                )
            )
    model = cp_model.CpModel()
    starts, cargo_starts, ends, rstarts, rends = {}, {}, {}, {}, {}
    choices: dict[tuple[str, str], Any] = {}
    review_choices: dict[tuple[str, str, int], Any] = {}
    berth_intervals: dict[str, list[Any]] = defaultdict(list)
    reviewer_intervals: dict[str, list[Any]] = defaultdict(list)
    shift_tasks: dict[tuple[str, int], list[Any]] = defaultdict(list)
    reviewer_loads: dict[str, list[Any]] = defaultdict(list)
    pilot_intervals = []
    terms: dict[str, list[Any]] = {key: [] for key in w.model_dump()}
    for bid, slots in occupied.items():
        for i, (lo, hi) in enumerate(slots):
            berth_intervals[bid].append(
                model.new_fixed_size_interval_var(lo, hi - lo, f"{bid}_fixed_{i}")
            )
    for v in data.vessels:
        cid = v.id
        start = starts[cid] = model.new_int_var(0, horizon, f"start_{cid}")
        cargo = cargo_starts[cid] = model.new_int_var(0, horizon, f"cargo_{cid}")
        end = ends[cid] = model.new_int_var(0, horizon, f"end_{cid}")
        model.add(cargo == start + v.pilot)
        model.add(end == cargo + v.occupancy)
        model.add(start >= max(0, v.arrival))
        terms["waiting_time"].append(cargo - v.arrival)
        late = model.new_int_var(0, horizon + max(0, -v.deadline), f"late_{cid}")
        model.add_max_equality(late, [0, cargo - v.deadline])
        terms["tardiness"].append(late * (3 if cid in c.priority_vessels else 1))
        on_berths = []
        for b in allowed[cid]:
            selected = choices[cid, b["id"]] = model.new_bool_var(f"{cid}_{b['id']}")
            on_berths.append(selected)
            berth_intervals[b["id"]].append(
                model.new_optional_interval_var(
                    start,
                    v.pilot + v.occupancy,
                    end,
                    selected,
                    f"slot_{cid}_{b['id']}",
                )
            )
            if v.original_berth and v.original_berth != b["id"]:
                terms["plan_changes"].append(selected)
        model.add_exactly_one(on_berths)
        pilot_intervals.append(model.new_interval_var(start, v.pilot, cargo, f"pilot_{cid}"))
        if v.review_duration:
            rs = rstarts[cid] = model.new_int_var(v.review_ready, horizon, f"review_start_{cid}")
            re = rends[cid] = model.new_int_var(0, horizon, f"review_end_{cid}")
            model.add(re == rs + v.review_duration)
            model.add(start >= re + v.planning)
            all_shifts = []
            for r in staff:
                for wi, (lo, nominal, hi) in enumerate(r.windows):
                    if max(lo, v.review_ready) + v.review_duration > hi:
                        continue
                    picked = model.new_bool_var(f"review_{cid}_{r.id}_{wi}")
                    review_choices[cid, r.id, wi] = picked
                    all_shifts.append(picked)
                    model.add(rs >= lo).only_enforce_if(picked)
                    model.add(rs < nominal).only_enforce_if(picked)
                    model.add(re <= hi).only_enforce_if(picked)
                    reviewer_intervals[r.id].append(
                        model.new_optional_interval_var(
                            rs,
                            v.review_duration,
                            re,
                            picked,
                            f"review_slot_{cid}_{r.id}_{wi}",
                        )
                    )
                    shift_tasks[r.id, wi].append(picked * v.review_duration)
                    reviewer_loads[r.id].append(picked * v.review_duration)
                    ot = model.new_int_var(0, max(0, hi - nominal), f"ot_{cid}_{r.id}_{wi}")
                    model.add(ot >= re - nominal).only_enforce_if(picked)
                    model.add(ot == 0).only_enforce_if(picked.Not())
                    terms["reviewer_overtime"].append(ot)
            model.add_exactly_one(all_shifts)
        else:
            model.add(start >= v.planning)
    for intervals in berth_intervals.values():
        model.add_no_overlap(intervals)
    for r in staff:
        model.add_no_overlap(reviewer_intervals[r.id])
        for wi in range(len(r.windows)):
            model.add(sum(shift_tasks[r.id, wi]) <= r.cap)
    model.add_cumulative(pilot_intervals, [1] * len(pilot_intervals), data.pilot_count)
    loads = []
    max_load = sum(v.review_duration for v in data.vessels)
    for r in staff:
        load = model.new_int_var(0, max_load, f"load_{r.id}")
        model.add(load == sum(reviewer_loads[r.id]))
        loads.append(load)
    upper, lower = (
        model.new_int_var(0, max_load, "max_load"),
        model.new_int_var(0, max_load, "min_load"),
    )
    model.add_max_equality(upper, loads)
    model.add_min_equality(lower, loads)
    terms["workload_imbalance"].append(upper - lower)
    total = sum(sum(values) * round(getattr(w, key) * 100) for key, values in terms.items())
    model.minimize(total)
    plans = {mode: baseline(data, c, staff, mode) for mode in ("no_change", "fifo", "greedy")}
    scores = {
        name: objective(objective_terms(data, p, c, staff), w) if p else None
        for name, p in plans.items()
    }
    feasible_baselines = [
        (name, value)
        for name, value in scores.items()
        if value is not None and all(verify(data, plans[name], c, staff).values())
    ]
    if feasible_baselines:
        best, baseline_value = min(feasible_baselines, key=lambda pair: pair[1])
        model.add(total <= round(baseline_value * 100))
        for a in plans[best]:
            model.add_hint(starts[a.vessel], data.minute(a.start))
            for b in allowed[a.vessel]:
                model.add_hint(choices[a.vessel, b["id"]], int(a.berth == b["id"]))
            if a.review_start and a.review_end:
                hint_start, hint_end = data.minute(a.review_start), data.minute(a.review_end)
                model.add_hint(rstarts[a.vessel], hint_start)
                for (cid, rid, wi), picked in review_choices.items():
                    if cid == a.vessel:
                        r = next(r for r in staff if r.id == rid)
                        lo, _, hi = r.windows[wi]
                        model.add_hint(
                            picked, int(rid == a.reviewer and lo <= hint_start < hint_end <= hi)
                        )
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.max_deterministic_time = 1
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = int(cfg["seed"])
    status = solver.solve(model)
    status_name = solver.status_name(status)
    plan = []
    if status in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
        for v in data.vessels:
            bid = next(b["id"] for b in allowed[v.id] if solver.value(choices[v.id, b["id"]]))
            chosen_reviewer = next(
                (
                    r
                    for (cid, r, _), picked in review_choices.items()
                    if cid == v.id and solver.value(picked)
                ),
                None,
            )
            plan.append(
                Assignment(
                    vessel=v.id,
                    berth=bid,
                    start=data.at(solver.value(starts[v.id])),
                    cargo_start=data.at(solver.value(cargo_starts[v.id])),
                    end=data.at(solver.value(ends[v.id])),
                    reviewer=chosen_reviewer,
                    review_start=data.at(solver.value(rstarts[v.id])) if chosen_reviewer else None,
                    review_end=data.at(solver.value(rends[v.id])) if chosen_reviewer else None,
                )
            )
    elif status == cp_model.MODEL_INVALID:
        raise ValueError(f"Invalid scheduling input: {model.validate()}")
    checks = verify(data, plan, c, staff) if plan else {}
    if plan and not all(checks.values()):
        raise RuntimeError("Independent schedule verification failed.")
    computed_terms = objective_terms(data, plan, c, staff) if plan else {}
    value = objective(computed_terms, w) if plan else None
    if status == cp_model.INFEASIBLE and not conflicts:
        conflicts = [
            ConstraintRef(
                kind="joint_capacity",
                detail=(
                    "No joint schedule satisfies berth availability, reviewer shifts/workload, "
                    "pilot capacity, locks and the planning horizon. "
                    "This is not a minimal unsatisfiable core."
                ),
            )
        ]
    evidence = EvidenceRecord(
        kind="recommendation",
        solver_status=status_name,
        objective_value=value,
        binding_constraints=[
            ConstraintRef(kind=k, detail="Independently verified on returned schedule.")
            for k, passed in checks.items()
            if passed
        ],
        baseline_deltas={
            name: KpiValue(
                value=round(value - score, 2), unit="weighted cost", provenance="optimized"
            )
            for name, score in scores.items()
            if score is not None and value is not None
        },
        notes=data.assumptions,
    )
    narrative = (
        f"{status_name}: weighted objective {value:.2f}. All returned hard constraints "
        "passed independent verification. Negative baseline deltas mean lower cost."
        if value is not None
        else f"{status_name}: no verified schedule returned. "
        + (conflicts[0].detail if conflicts else "The solve budget ended without an incumbent.")
    )
    originals = {v.id: v.original_berth for v in data.vessels}
    return OptimizationResult(
        run_id="",
        scenario_id="",
        solver_status=status_name,
        objective_value=value,
        runtime_ms=round((time.perf_counter() - began) * 1000),
        assignments=plan,
        changed_decisions=[
            a for a in plan if originals[a.vessel] and originals[a.vessel] != a.berth
        ],
        evidence=evidence,
        narrative=narrative,
        infeasibility=conflicts or None,
        baselines=plans,
        baseline_objectives=scores,
        constraint_checks=checks,
        objective_terms=computed_terms,
        assumptions=data.assumptions,
    )

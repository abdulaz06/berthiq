"""Observable scheduling inputs and independently executable constraint checks.

No hidden generator truth and no Case summary attributes enter this module.
Missing future durations/ETAs are explicit configured assumptions, never ML outputs.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from app.schemas.scenarios import Assignment, ScenarioConstraints
from app.services.ingestion import timestamp
from app.services.prediction import PORT_TZ, STAGES


@dataclass(frozen=True)
class Vessel:
    id: str
    vessel_type: str
    loa: float
    draft: float
    arrival: int
    deadline: int
    review_ready: int
    review_duration: int
    planning: int
    pilot: int
    occupancy: int
    original_berth: str | None
    weather: float
    missing_docs: int


@dataclass(frozen=True)
class Reviewer:
    id: str
    windows: tuple[tuple[int, int, int], ...]  # start, nominal end, allowed end
    cap: int


@dataclass
class PlanningInput:
    epoch: datetime
    vessels: list[Vessel]
    berths: list[dict[str, Any]]
    pilot_count: int
    commitments: dict[str, list[tuple[int, int]]] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)

    def at(self, minutes: float) -> datetime:
        return self.epoch + timedelta(minutes=minutes)

    def minute(self, instant: datetime) -> int:
        return round((instant - self.epoch).total_seconds() / 60)


def terminal_ok(vessel: str, terminal: str) -> bool:
    return {
        "container": "container",
        "bulk": "bulk",
        "tanker": "bulk",
        "general": "general",
        "roro": "general",
    }.get(vessel) == terminal


def compatible(v: Vessel, b: dict[str, Any]) -> bool:
    return (
        v.loa <= b["length_m"]
        and v.draft <= b["draft_m"]
        and terminal_ok(v.vessel_type, b["terminal_type"])
    )


def build_input(events: list[Any], cfg: dict[str, Any], epoch: datetime) -> PlanningInput:
    epoch = epoch.astimezone(PORT_TZ)
    groups: dict[str, list[Any]] = defaultdict(list)
    for e in events:
        if e.end_ts <= epoch:
            groups[e.case_id].append(e)
    durs = cfg["durations_minutes"]
    vessels = []
    commitments: dict[str, list[tuple[int, int]]] = defaultdict(list)
    assumptions = [
        "Active state uses observed event prefixes only; hidden ground truth is never read.",
        "Unknown ETA, review, planning, pilot and occupancy durations use configured means.",
        "Service windows not yet observed use request + mean travel + window tolerance.",
        "Berth occupancy after recorded cargo start is assumed from the configured mean.",
        "Berth occupation includes pilot approach and cargo service; targets apply to cargo start.",
        "Review is non-preemptive within configured shifts; parallel review is not modeled.",
    ]
    for cid, evs in sorted(groups.items()):
        evs.sort(key=lambda e: (e.end_ts, e.seq or 0))
        attrs = {k: val for e in evs for k, val in e.attributes.items()}
        completed = next((e for e in evs if e.activity == STAGES[-1]), None)
        if completed:
            release = completed.end_ts + timedelta(minutes=durs["berth_occupancy"]["mean"])
            if release > epoch and attrs.get("berth"):
                commitments[attrs["berth"]].append(
                    (0, math.ceil((release - epoch).total_seconds() / 60))
                )
            continue
        if not attrs.get("vessel_type") or not attrs.get("loa") or not attrs.get("draft"):
            raise ValueError(f"{cid}: optimization needs vessel_type, loa and draft.")
        request = evs[0].end_ts
        arrival = timestamp(attrs.get("ata") or attrs.get("eta")) or (
            request + timedelta(minutes=durs["travel_to_anchorage"]["mean"])
        )
        deadline = timestamp(attrs.get("service_window_end")) or (
            arrival + timedelta(hours=cfg["levers"]["service_window"]["tolerance_hours"])
        )
        approved = any(e.activity == STAGES[3] and e.status == "completed" for e in evs)
        assigned = any(e.activity == STAGES[6] for e in evs)
        missing = int(float(attrs.get("missing_doc_count", 0)))
        ready = (
            0
            if evs[-1].activity in {STAGES[2], STAGES[3]}
            else int(durs["documents_submitted"]["mean"] + durs["completeness_check"]["mean"])
        )
        if evs[-1].status in {"returned", "rejected"}:
            ready = int(durs["documents_submitted"]["mean"] + durs["completeness_check"]["mean"])
        weather = float(attrs.get("weather_severity", cfg["weather"]["base_severity"]))
        vessels.append(
            Vessel(
                id=cid,
                vessel_type=str(attrs["vessel_type"]),
                loa=float(attrs["loa"]),
                draft=float(attrs["draft"]),
                arrival=math.ceil((arrival - epoch).total_seconds() / 60),
                deadline=math.floor((deadline - epoch).total_seconds() / 60),
                review_ready=ready if not approved else 0,
                review_duration=int(cfg["reviewers"]["service_minutes"]["mean"])
                if not approved
                else 0,
                planning=0 if assigned else int(durs["berth_planning"]["mean"]),
                pilot=math.ceil(
                    (cfg["pilots"]["service_minutes"]["mean"] + durs["cargo_start"]["mean"])
                    * (1 + weather * (cfg["weather"]["service_multiplier_max"] - 1))
                ),
                occupancy=int(durs["berth_occupancy"]["mean"]),
                original_berth=str(attrs["berth"]) if assigned and attrs.get("berth") else None,
                weather=weather,
                missing_docs=missing,
            )
        )
    if not vessels:
        raise ValueError("This dataset has no active vessels to schedule.")
    if len(vessels) > 60:
        raise ValueError("Interactive scenarios support at most 60 active vessels.")
    return PlanningInput(
        epoch, vessels, cfg["berths"], len(cfg["pilots"]["pool"]), dict(commitments), assumptions
    )


def reviewers(data: PlanningInput, cfg: dict[str, Any], c: ScenarioConstraints) -> list[Reviewer]:
    pool = cfg["reviewers"]["pool"]
    if c.reviewer_count is None:
        shifts = [
            (r, shift["start_hour"], shift["end_hour"])
            for shift in cfg["reviewers"]["shifts"].values()
            for r in shift["reviewers"]
        ]
    else:
        day_count = math.ceil(c.reviewer_count * 2 / 3)
        shifts = [
            (r, 6, 18) if i < day_count else (r, 18, 6)
            for i, r in enumerate(pool[: c.reviewer_count])
        ]
    unknown = set(c.reviewer_shift_caps or {}) - {r for r, _, _ in shifts}
    if unknown:
        raise ValueError(
            f"Shift caps reference unavailable reviewers: {', '.join(sorted(unknown))}."
        )
    result = []
    midnight = data.epoch.replace(hour=0, minute=0, second=0, microsecond=0)
    for rid, start_h, end_h in shifts:
        cap = (c.reviewer_shift_caps or {}).get(rid, 720)
        windows = []
        for day in range(-1, c.horizon_hours // 24 + 2):
            start = midnight + timedelta(days=day, hours=start_h)
            end = midnight + timedelta(days=day + (end_h <= start_h), hours=end_h)
            a, b = data.minute(start), data.minute(end)
            if b > 0 and a < c.horizon_hours * 60:
                windows.append((max(0, a), b, min(c.horizon_hours * 60, b + max(0, cap - 720))))
        result.append(Reviewer(rid, tuple(windows), cap))
    return result


def blocked(data: PlanningInput, c: ScenarioConstraints) -> dict[str, list[tuple[int, int]]]:
    result = {b["id"]: list(data.commitments.get(b["id"], [])) for b in data.berths}
    for closure in c.berth_closures:
        if closure.berth not in result:
            raise ValueError(f"Unknown berth in closure: {closure.berth}.")
        a, b = max(0, data.minute(closure.start)), data.minute(closure.end)
        if b > a:
            result[closure.berth].append((a, b))
    # Merge overlapping closures/commitments, so fixed intervals don't conflict with themselves.
    for bid, slots in result.items():
        merged: list[tuple[int, int]] = []
        for a, b in sorted(slots):
            if merged and a <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
            else:
                merged.append((a, b))
        result[bid] = merged
    return result


def verify(
    data: PlanningInput,
    assignments: list[Assignment],
    c: ScenarioConstraints,
    staff: list[Reviewer],
) -> dict[str, bool]:
    """Independent check: uses only returned timestamps, never solver variables."""
    keys = (
        "exactly_once",
        "compatibility",
        "arrival_readiness",
        "approval_readiness",
        "berth_no_overlap",
        "pilot_capacity",
        "locked_berths",
        "horizon",
        "reviewer_shifts",
        "reviewer_no_overlap",
        "reviewer_workload",
        "durations",
    )
    checks = dict.fromkeys(keys, True)
    by_v = {v.id: v for v in data.vessels}
    checks["exactly_once"] = len(assignments) == len(by_v) and {
        a.vessel for a in assignments
    } == set(by_v)
    occupied = blocked(data, c)
    pilot_events = []
    review_slots: dict[str, list[tuple[int, int]]] = defaultdict(list)
    staff_by_id = {r.id: r for r in staff}
    for a in assignments:
        if a.vessel not in by_v or not a.end or not a.cargo_start:
            checks["durations"] = False
            continue
        v = by_v[a.vessel]
        start, end, cargo = data.minute(a.start), data.minute(a.end), data.minute(a.cargo_start)
        berth = next((b for b in data.berths if b["id"] == a.berth), None)
        checks["compatibility"] &= berth is not None and compatible(v, berth)
        checks["arrival_readiness"] &= start >= max(0, v.arrival)
        checks["horizon"] &= 0 <= start < end <= c.horizon_hours * 60
        checks["durations"] &= cargo - start == v.pilot and end - cargo == v.occupancy
        checks["locked_berths"] &= (c.locked_berths or {}).get(v.id, a.berth) == a.berth
        review_end = 0
        if v.review_duration:
            if not a.review_start or not a.review_end or a.reviewer not in staff_by_id:
                checks["approval_readiness"] = False
            else:
                rs, review_end = data.minute(a.review_start), data.minute(a.review_end)
                checks["durations"] &= review_end - rs == v.review_duration
                checks["approval_readiness"] &= rs >= v.review_ready
                r = staff_by_id[a.reviewer]
                checks["reviewer_shifts"] &= any(
                    lo <= rs < nominal and review_end <= hi for lo, nominal, hi in r.windows
                )
                review_slots[a.reviewer].append((rs, review_end))
        checks["approval_readiness"] &= start >= review_end + v.planning
        for lo, hi in occupied.get(a.berth, []):
            checks["berth_no_overlap"] &= end <= lo or start >= hi
        occupied.setdefault(a.berth, []).append((start, end))
        pilot_events.extend([(start, 1), (cargo, -1)])
    current = 0
    for _, change in sorted(pilot_events):
        current += change
        checks["pilot_capacity"] &= current <= data.pilot_count
    for rid, slots in review_slots.items():
        slots.sort()
        checks["reviewer_no_overlap"] &= all(
            a[1] <= b[0] for a, b in zip(slots, slots[1:], strict=False)
        )
        r = staff_by_id[rid]
        for lo, _, hi in r.windows:
            checks["reviewer_workload"] &= sum(b - a for a, b in slots if lo <= a < hi) <= r.cap
    return checks

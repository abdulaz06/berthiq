"""Synthetic Khalifa port-call dataset generator (seeded, deterministic).

Builds a valid event log for the flagship workflow in
``docs/PRODUCT_DEFINITION.md`` §5 — the nine stages from *Port call request
submitted* to *Berthed / cargo start*, with the stage-4 → stage-2 rework loop —
and loads it into Postgres so ``just seed`` produces a runnable built-in dataset.

Delays are **caused**, not sampled at random (PRODUCT_DEFINITION §12):

* **missing docs → rework** — a hidden per-case ``doc_completeness`` drives the
  probability that *Authority review* rejects and sends the call back to
  *Documents submitted*.
* **reviewer overload → queue** — reviewers are finite servers on a shift
  calendar (few at night); review tasks wait for a free reviewer, so a queue
  *emerges* from capacity rather than being injected. This is the intended
  dominant bottleneck (the golden-path scenario, §18).
* **vessel size → berth conflict** — LOA/draft must fit a berth's length/depth;
  large vessels are compatible with fewer berths and contend for them.
* **weather → longer service** — a seeded daily weather-severity series extends
  pilotage and cargo-start service times.

Everything is a pure function of the port config's ``seed``: same seed → the
same event content, byte-for-byte (see ``event_content_hash``). No wall-clock is
read in the logic; the six-month window is anchored to a fixed date in the port
config.

**Ground truth is stored separately.** The true bottleneck, the per-case true
delay cause, the hidden ``doc_completeness``, and the reference berth assignment
are written to ``backend/data/datasets/<port>/ground_truth.json`` (gitignored) —
never into ``events``, ``cases``, or ``datasets.stats``, so the application can
never read the answers through a normal query path. ``GROUND_TRUTH_KEYS`` lists
the field names that must never appear in the transactional layer; a test
enforces it.

Run directly (``just seed``) to (re)generate, write the CSV + ground-truth
sibling artifacts, load into the DB, and print a distribution summary.
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
import statistics
import sys
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# --- Paths -----------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[1]
PORTS_DIR = BACKEND_DIR / "data" / "ports"
DATASETS_DIR = BACKEND_DIR / "data" / "datasets"

# --- The nine stages (PRODUCT_DEFINITION.md §5), in order ------------------

S1_REQUEST = "Port call request submitted"
S2_DOCS = "Documents submitted"
S3_CHECK = "Completeness check"
S4_REVIEW = "Authority review"
S5_PLAN = "Arrival plan confirmed"
S6_BERTH_PLAN = "Berth planning"
S7_BERTH_ASSIGN = "Berth assigned"
S8_ANCHORAGE = "Vessel arrives / anchorage wait"
S9_BERTHED = "Berthed, cargo start"

STAGES: tuple[str, ...] = (
    S1_REQUEST, S2_DOCS, S3_CHECK, S4_REVIEW, S5_PLAN,
    S6_BERTH_PLAN, S7_BERTH_ASSIGN, S8_ANCHORAGE, S9_BERTHED,
)

# The four causal levers, used as delay-cause labels in the ground truth.
CAUSE_DOCS = "missing_docs"
CAUSE_REVIEWER = "reviewer_overload"
CAUSE_BERTH = "berth_conflict"
CAUSE_WEATHER = "weather"

# Field names that carry hidden truth. They may appear ONLY in the ground-truth
# artifact — never in events/cases/datasets rows the application can query.
GROUND_TRUTH_KEYS: frozenset[str] = frozenset(
    {
        "true_delay_cause",
        "true_bottleneck",
        "doc_completeness",
        "reference_berth",
        "reference_assignment",
        "delay_components_min",
        "delay_cause_counts",
        "is_late",
    }
)

# Stable UUID namespace so the built-in dataset id is deterministic across seeds.
_DATASET_NS = uuid.UUID("b3777100-0000-4000-8000-000000000000")

# Content columns that define an event's identity (the BIGSERIAL id is not
# content; two seed runs differ in serial ids but must match on these).
EVENT_CONTENT_FIELDS = (
    "case_id", "activity", "start_ts", "end_ts", "resource_id", "status", "seq", "attributes",
)


# --- Generated records (plain dataclasses, DB-agnostic) --------------------


@dataclass
class GenEvent:
    case_id: str
    activity: str
    start_ts: datetime | None
    end_ts: datetime
    resource_id: str | None
    status: str
    seq: int
    attributes: dict[str, Any]


@dataclass
class GenCase:
    case_id: str
    is_active: bool
    current_stage: str
    first_event_ts: datetime
    last_event_ts: datetime
    service_window_start: datetime | None
    service_window_end: datetime | None
    actual_berthing_ts: datetime | None
    outcome: str  # active | on_time | late
    rework_count: int
    vessel_type: str
    loa: float
    draft: float
    cargo_type: str
    attributes: dict[str, Any]


@dataclass
class GenResult:
    port: str
    seed: int
    dataset_id: uuid.UUID
    dataset_name: str
    window_start: datetime
    window_end: datetime
    events: list[GenEvent]
    cases: list[GenCase]
    ground_truth: dict[str, Any]
    activities: list[str] = field(default_factory=lambda: list(STAGES))
    resources: list[str] = field(default_factory=list)


# --- Small deterministic helpers -------------------------------------------


def _dur(rng: random.Random, mean: float, spread: float, lo: float) -> float:
    """A clamped Gaussian duration in minutes (deterministic given ``rng``)."""
    return max(lo, rng.gauss(mean, spread))


def _mins(m: float) -> timedelta:
    return timedelta(minutes=m)


def _weighted_choice(
    rng: random.Random, items: list[dict[str, Any]], weight_key: str
) -> dict[str, Any]:
    total = sum(float(i[weight_key]) for i in items)
    r = rng.random() * total
    upto = 0.0
    for i in items:
        upto += float(i[weight_key])
        if r <= upto:
            return i
    return items[-1]


# --- Config ----------------------------------------------------------------


def load_port_config(port: str) -> dict[str, Any]:
    path = PORTS_DIR / f"{port}.json"
    with path.open(encoding="utf-8") as fh:
        cfg: dict[str, Any] = json.load(fh)
    return cfg


def _build_weather(cfg: dict[str, Any], window_start: datetime, days: int) -> list[float]:
    """A seeded daily severity series in [0, 1], one value per day of the window."""
    w = cfg["weather"]
    rng = random.Random(int(cfg["seed"]) ^ 0x5EED_1)
    series: list[float] = []
    for _ in range(days + 2):
        sev = w["base_severity"] + rng.uniform(-w["daily_drift"], w["daily_drift"])
        if rng.random() < w["storm_probability"]:
            lo, hi = w["storm_severity"]
            sev = rng.uniform(lo, hi)
        series.append(min(1.0, max(0.0, sev)))
    return series


# --- Per-case intrinsic attributes (drawn before processing) ---------------


@dataclass
class CaseSpec:
    idx: int
    case_id: str
    rng: random.Random
    request_ts: datetime
    vessel_type: str
    cargo_type: str
    loa: float
    draft: float
    doc_completeness: float
    missing_doc_count: int
    agent: str
    travel_min: float


def _draw_arrivals(cfg: dict[str, Any], window_start: datetime, days: int) -> list[datetime]:
    """Deterministic arrival timestamps: a completed cohort spread across the
    window and an active cohort in the final two days (so ~25 calls are still
    in flight at the cutoff). Night hours are down-weighted by resampling."""
    rng = random.Random(int(cfg["seed"]) ^ 0xA22143)
    targets = cfg["targets"]
    arr = cfg["arrivals"]
    night_w = float(arr["night_hour_weight"])

    def draw_in(lo_day: float, hi_day: float) -> datetime:
        for _ in range(4):  # bounded resampling to thin out night arrivals
            offset = rng.uniform(lo_day, hi_day) * 1440.0
            ts = window_start + _mins(offset)
            hour = ts.hour
            if 6 <= hour < 18 or rng.random() < night_w:
                return ts
        return window_start + _mins(rng.uniform(lo_day, hi_day) * 1440.0)

    # A completed cohort spread across almost the whole window, plus an active
    # cohort concentrated in the final day so ~25 calls are still in flight at
    # the cutoff. The active cohort is oversampled because a few finish in time.
    active_tail_days = float(targets.get("active_tail_days", 1.0))
    completed = [draw_in(0.0, float(days) - active_tail_days)
                 for _ in range(int(targets["completed_cases"]))]
    active = [draw_in(float(days) - active_tail_days, float(days))
              for _ in range(int(targets["active_cases"]))]
    return sorted(completed + active)


def _make_specs(cfg: dict[str, Any], window_start: datetime, days: int) -> list[CaseSpec]:
    seed = int(cfg["seed"])
    durs = cfg["durations_minutes"]
    arrivals = _draw_arrivals(cfg, window_start, days)
    specs: list[CaseSpec] = []
    for idx, request_ts in enumerate(arrivals):
        rng = random.Random(seed * 1_000_003 + idx)
        vessel = _weighted_choice(rng, cfg["vessel_mix"], "weight")
        loa_lo, loa_hi = vessel["loa"]
        dr_lo, dr_hi = vessel["draft"]
        loa = round(rng.uniform(loa_lo, loa_hi), 1)
        draft = round(rng.uniform(dr_lo, dr_hi), 1)
        completeness = min(1.0, max(0.0, rng.betavariate(5.0, 2.0)))
        missing = max(0, round((1.0 - completeness) * 6))
        tt = durs["travel_to_anchorage"]
        travel = _dur(rng, tt["mean"], tt["spread"], tt["min"])
        specs.append(
            CaseSpec(
                idx=idx,
                case_id=f"KHL-{idx + 1:04d}",
                rng=rng,
                request_ts=request_ts,
                vessel_type=vessel["type"],
                cargo_type=vessel["cargo_type"],
                loa=loa,
                draft=draft,
                doc_completeness=round(completeness, 4),
                missing_doc_count=missing,
                agent=cfg["agents"]["pool"][idx % len(cfg["agents"]["pool"])],
                travel_min=travel,
            )
        )
    return specs


# --- The generator ---------------------------------------------------------


def _shift_of(ts: datetime, cfg: dict[str, Any]) -> str:
    day = cfg["reviewers"]["shifts"]["day"]
    return "day" if day["start_hour"] <= ts.hour < day["end_hour"] else "night"


def _earliest_server(
    free: dict[str, datetime], names: list[str], not_before: datetime
) -> tuple[str, datetime]:
    """Pick the server (by name) that can start soonest at/after ``not_before``.
    Ties break by pool order for determinism."""
    best_name = names[0]
    best_start = max(not_before, free.get(names[0], not_before))
    for name in names[1:]:
        start = max(not_before, free.get(name, not_before))
        if start < best_start:
            best_name, best_start = name, start
    return best_name, best_start


def generate(cfg: dict[str, Any]) -> GenResult:
    """Deterministically build the full event log, case summaries, and hidden
    ground truth for one port config. Pure: no DB, no filesystem, no clock."""
    port = str(cfg["port"])
    seed = int(cfg["seed"])
    window_start = datetime.fromisoformat(cfg["window"]["start"])
    days = int(cfg["window"]["days"])
    window_end = window_start + timedelta(days=days)
    weather = _build_weather(cfg, window_start, days)

    rev_cfg = cfg["reviewers"]
    rev_shift = {s: list(rev_cfg["shifts"][s]["reviewers"]) for s in ("day", "night")}
    rev_free: dict[str, datetime] = {r: window_start for r in rev_cfg["pool"]}
    pilots = list(cfg["pilots"]["pool"])
    pilot_free: dict[str, datetime] = {p: window_start for p in pilots}
    planners = list(cfg["planners"]["pool"])
    planner_free: dict[str, datetime] = {p: window_start for p in planners}
    berths = list(cfg["berths"])
    berth_free: dict[str, datetime] = {b["id"]: window_start for b in berths}

    durs = cfg["durations_minutes"]
    lev = cfg["levers"]
    rework_lev = lev["rework"]
    sw_lev = lev["service_window"]
    wmax = float(cfg["weather"]["service_multiplier_max"])
    rev_svc = rev_cfg["service_minutes"]
    pilot_svc = cfg["pilots"]["service_minutes"]

    specs = _make_specs(cfg, window_start, days)

    events: list[GenEvent] = []
    cases: list[GenCase] = []
    gt_cases: dict[str, Any] = {}
    reference_assignment: dict[str, Any] = {}

    def weather_at(ts: datetime) -> float:
        day_idx = (ts - window_start).days
        return weather[min(max(day_idx, 0), len(weather) - 1)]

    for spec in specs:
        rng = spec.rng
        case_events: list[GenEvent] = []
        obs = {
            "vessel_type": spec.vessel_type,
            "cargo_type": spec.cargo_type,
            "loa": spec.loa,
            "draft": spec.draft,
            "missing_doc_count": spec.missing_doc_count,
        }

        # Loop-scoped context bound as defaults so this stays a plain closure over
        # per-case state (ruff B023) rather than capturing the loop variables. seq
        # is provisional here and renumbered densely after truncation.
        def emit(activity: str, start: datetime | None, end: datetime, resource: str | None,
                 status: str, extra: dict[str, Any] | None = None,
                 _spec: CaseSpec = spec, _obs: dict[str, Any] = obs,
                 _events: list[GenEvent] = case_events) -> None:
            attrs = dict(_obs)
            if extra:
                attrs.update(extra)
            _events.append(
                GenEvent(_spec.case_id, activity, start, end, resource, status,
                         len(_events) + 1, attrs)
            )

        # Stage 1 — request submitted (instant).
        cursor = spec.request_ts
        emit(S1_REQUEST, cursor, cursor, None, "completed")

        # Rework loop over stages 2–4. Delay attribution is kept clean and
        # non-overlapping: queue waits count only toward reviewer_overload; the
        # *redone service* of failed iterations counts only toward missing_docs.
        rework_count = 0
        review_queue_delay = 0.0   # reviewer_overload: total time waiting for a reviewer
        rework_delay = 0.0         # missing_docs: service redone in failed iterations
        approved_ts = cursor
        while True:
            # Stage 2 — documents submitted (agent). Slower when incomplete.
            ds_ = durs["documents_submitted"]
            d2 = _dur(rng, ds_["mean"] * (1.6 - 0.6 * spec.doc_completeness),
                      ds_["spread"], ds_["min"])
            s2_end = cursor + _mins(d2)
            emit(S2_DOCS, cursor, s2_end, spec.agent, "completed",
                 {"rework_iteration": rework_count})
            cursor = s2_end

            # Stage 3 — completeness check (system; fast, can return).
            d3 = _dur(rng, durs["completeness_check"]["mean"], durs["completeness_check"]["spread"],
                      durs["completeness_check"]["min"])
            s3_end = cursor + _mins(d3)
            return_prob = 0.35 * (1.0 - spec.doc_completeness)
            returned = rework_count < rework_lev["max_iterations"] and rng.random() < return_prob
            emit(S3_CHECK, cursor, s3_end, "system", "returned" if returned else "completed",
                 {"rework_iteration": rework_count})
            cursor = s3_end
            if returned:
                rework_count += 1
                rework_delay += d2 + d3  # this attempt's work must be redone
                continue

            # Stage 4 — authority review (reviewer; the bottleneck).
            queue_enter = cursor
            shift = _shift_of(queue_enter, cfg)
            reviewer, review_start = _earliest_server(rev_free, rev_shift[shift], queue_enter)
            wait_min = (review_start - queue_enter).total_seconds() / 60.0
            review_queue_delay += wait_min
            d4 = _dur(rng, rev_svc["mean"], rev_svc["spread"], rev_svc["min"])
            s4_end = review_start + _mins(d4)
            rev_free[reviewer] = s4_end
            reject_prob = min(
                0.9,
                rework_lev["base_reject_prob"]
                + rework_lev["incompleteness_weight"] * (1.0 - spec.doc_completeness),
            )
            rejected = rework_count < rework_lev["max_iterations"] and rng.random() < reject_prob
            emit(S4_REVIEW, review_start, s4_end, reviewer, "rejected" if rejected else "completed",
                 {"rework_iteration": rework_count, "reviewer_shift": shift,
                  "review_wait_min": round(wait_min, 1)})
            cursor = s4_end
            if rejected:
                rework_count += 1
                rework_delay += d2 + d3 + d4  # whole failed attempt is redone
                continue
            approved_ts = s4_end
            break

        # Stage 5 — arrival plan confirmed (planner, instant). Sets the window.
        planner, _ = _earliest_server(planner_free, planners, approved_ts)
        planner_free[planner] = approved_ts + _mins(5)
        expected_arrival = spec.request_ts + _mins(spec.travel_min)
        sw_start = expected_arrival
        sw_end = sw_start + timedelta(hours=float(sw_lev["tolerance_hours"]))
        emit(S5_PLAN, approved_ts, approved_ts, planner, "completed",
             {"service_window_start": sw_start.isoformat(),
              "service_window_end": sw_end.isoformat()})
        cursor = approved_ts

        # Stage 6 — berth planning (planner, duration).
        d6 = _dur(rng, durs["berth_planning"]["mean"], durs["berth_planning"]["spread"],
                  durs["berth_planning"]["min"])
        s6_end = cursor + _mins(d6)
        emit(S6_BERTH_PLAN, cursor, s6_end, planner, "completed")
        cursor = s6_end

        # Stage 7 — berth assigned (instant). Vessel size drives contention.
        # Berthing cannot begin before the berth is assigned (s6/s7 complete),
        # docs are approved, and the vessel has arrived — so all three gate it,
        # which keeps event end-times monotonic within the case.
        vessel_arrival = expected_arrival
        earliest_berth = max(approved_ts, vessel_arrival, cursor)
        compatible = [
            b for b in berths
            if b["length_m"] >= spec.loa and b["draft_m"] >= spec.draft
            and _terminal_ok(spec.vessel_type, b["terminal_type"])
        ]
        if not compatible:  # safety net: fall back to any dimensionally-fitting berth
            compatible = [
                b for b in berths if b["length_m"] >= spec.loa and b["draft_m"] >= spec.draft
            ]
        if not compatible:  # last resort: the largest berth
            compatible = [max(berths, key=lambda b: (b["length_m"], b["draft_m"]))]
        berth_id, berthing_start = _earliest_server(
            berth_free, [b["id"] for b in compatible], earliest_berth
        )
        berth_wait = (berthing_start - earliest_berth).total_seconds() / 60.0
        emit(S7_BERTH_ASSIGN, cursor, cursor, berth_id, "completed", {"berth": berth_id})

        # Stage 8 — vessel arrives / anchorage wait (duration). The vessel may
        # arrive before or after the berth is ready; clamp so start <= end.
        sev = weather_at(berthing_start)
        anchorage_wait = max(0.0, (berthing_start - vessel_arrival).total_seconds() / 60.0)
        anchorage_start = min(vessel_arrival, berthing_start)
        emit(S8_ANCHORAGE, anchorage_start, berthing_start, None, "completed",
             {"eta": expected_arrival.isoformat(), "ata": vessel_arrival.isoformat(),
              "weather_severity": round(sev, 3),
              "anchorage_wait_min": round(max(0.0, anchorage_wait), 1)})

        # Stage 9 — berthed, cargo start (pilot + berth, instant = case end).
        pilot, pilot_ready = _earliest_server(pilot_free, pilots, berthing_start)
        cs_ = durs["cargo_start"]
        base_service = (_dur(rng, pilot_svc["mean"], pilot_svc["spread"], pilot_svc["min"])
                        + _dur(rng, cs_["mean"], cs_["spread"], cs_["min"]))
        weather_mult = 1.0 + sev * (wmax - 1.0)
        weather_delay = base_service * (weather_mult - 1.0)
        actual_berthing = pilot_ready + _mins(base_service * weather_mult)
        pilot_free[pilot] = actual_berthing
        occ = durs["berth_occupancy"]
        occupancy = _dur(rng, occ["mean"], occ["spread"], occ["min"])  # time vessel holds the berth
        berth_free[berth_id] = actual_berthing + _mins(occupancy)
        emit(S9_BERTHED, actual_berthing, actual_berthing, pilot, "completed",
             {"berth": berth_id, "etb": actual_berthing.isoformat(),
              "weather_severity": round(sev, 3)})

        # --- Truncate active cases at the window cutoff --------------------
        kept = [e for e in case_events if e.end_ts <= window_end]
        if not kept:
            continue  # arrived essentially at the cutoff; nothing observed yet
        reached_berth = any(e.activity == S9_BERTHED for e in kept)
        is_active = not reached_berth
        # renumber seq densely over kept events
        for i, e in enumerate(kept, start=1):
            e.seq = i
        events.extend(kept)

        # --- Case summary (transactional; no hidden fields) ---------------
        if is_active:
            outcome = "active"
            actual_berth_ts: datetime | None = None
        else:
            outcome = "late" if actual_berthing > sw_end else "on_time"
            actual_berth_ts = actual_berthing
        cases.append(
            GenCase(
                case_id=spec.case_id,
                is_active=is_active,
                current_stage=kept[-1].activity,
                first_event_ts=kept[0].end_ts,
                last_event_ts=kept[-1].end_ts,
                service_window_start=sw_start,
                service_window_end=sw_end,
                actual_berthing_ts=actual_berth_ts,
                outcome=outcome,
                rework_count=rework_count,
                vessel_type=spec.vessel_type,
                loa=spec.loa,
                draft=spec.draft,
                cargo_type=spec.cargo_type,
                attributes={"berth": berth_id, "missing_doc_count": spec.missing_doc_count},
            )
        )

        # --- Ground truth (hidden; sibling artifact only) -----------------
        components = {
            CAUSE_DOCS: round(rework_delay, 1),
            CAUSE_REVIEWER: round(review_queue_delay, 1),
            CAUSE_BERTH: round(max(0.0, berth_wait), 1),
            CAUSE_WEATHER: round(max(0.0, weather_delay), 1),
        }
        true_cause = max(components, key=lambda k: components[k])
        gt_cases[spec.case_id] = {
            "true_delay_cause": true_cause,
            "is_late": outcome == "late",
            "doc_completeness": spec.doc_completeness,
            "delay_components_min": components,
        }
        reference_assignment[spec.case_id] = {
            "reference_berth": berth_id,
            "berthing_start": actual_berthing.isoformat(),
        }

    resources = _collect_resources(cfg)
    dataset_id = uuid.uuid5(_DATASET_NS, f"berthiq:{port}:seed={seed}")
    dataset_name = f"{cfg['display_name']} - Built-in (6 months, synthetic)"

    ground_truth = _build_ground_truth(port, seed, window_start, window_end, gt_cases,
                                        reference_assignment, cases, events)

    return GenResult(
        port=port,
        seed=seed,
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        window_start=window_start,
        window_end=window_end,
        events=sorted(events, key=lambda e: (e.case_id, e.seq)),
        cases=sorted(cases, key=lambda c: c.case_id),
        ground_truth=ground_truth,
        resources=resources,
    )


def _terminal_ok(vessel_type: str, terminal_type: str) -> bool:
    """Coarse berth/terminal compatibility. Containers need container berths;
    everything else fits bulk/general berths."""
    if vessel_type == "container":
        return terminal_type == "container"
    return terminal_type in ("bulk", "general")


def _collect_resources(cfg: dict[str, Any]) -> list[str]:
    res: list[str] = []
    res.extend(cfg["reviewers"]["pool"])
    res.extend(cfg["planners"]["pool"])
    res.extend(cfg["pilots"]["pool"])
    res.extend(b["id"] for b in cfg["berths"])
    return res


def _build_ground_truth(
    port: str, seed: int, window_start: datetime, window_end: datetime,
    gt_cases: dict[str, Any], reference_assignment: dict[str, Any],
    cases: list[GenCase], events: list[GenEvent],
) -> dict[str, Any]:
    cause_counts = Counter(
        gt_cases[c.case_id]["true_delay_cause"] for c in cases if not c.is_active
    )
    cause_counts_late = Counter(
        gt_cases[c.case_id]["true_delay_cause"] for c in cases if gt_cases[c.case_id]["is_late"]
    )
    # Aggregate per-lever delay to identify the statistically dominant bottleneck.
    totals: Counter[str] = Counter()
    for c in cases:
        for cause, mins in gt_cases[c.case_id]["delay_components_min"].items():
            totals[cause] += mins
    dominant_cause = max(totals, key=lambda k: totals[k]) if totals else CAUSE_REVIEWER
    cause_to_stage = {
        CAUSE_DOCS: S2_DOCS,
        CAUSE_REVIEWER: S4_REVIEW,
        CAUSE_BERTH: S7_BERTH_ASSIGN,
        CAUSE_WEATHER: S9_BERTHED,
    }
    return {
        "dataset": port,
        "seed": seed,
        "window": [window_start.isoformat(), window_end.isoformat()],
        "true_bottleneck": {
            "stage": cause_to_stage[dominant_cause],
            "cause": dominant_cause,
            "total_delay_minutes_by_cause": dict(totals),
        },
        "delay_cause_counts": dict(cause_counts),
        "delay_cause_counts_late": dict(cause_counts_late),
        "cases": gt_cases,
        "reference_assignment": reference_assignment,
    }


# --- Content hashing (determinism check) -----------------------------------


def _event_row(e: GenEvent) -> dict[str, Any]:
    return {
        "case_id": e.case_id,
        "activity": e.activity,
        "start_ts": e.start_ts.isoformat() if e.start_ts else None,
        "end_ts": e.end_ts.isoformat(),
        "resource_id": e.resource_id,
        "status": e.status,
        "seq": e.seq,
        "attributes": e.attributes,
    }


def event_content_hash(events: list[GenEvent]) -> str:
    """A stable hash over the *content* columns of the event log (excludes any
    serial primary key). Two seed runs must produce the same hash."""
    rows = [_event_row(e) for e in sorted(events, key=lambda e: (e.case_id, e.seq))]
    blob = json.dumps(rows, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# --- Artifact writing (CSV + ground truth) ---------------------------------


def write_artifacts(result: GenResult) -> tuple[Path, Path]:
    out_dir = DATASETS_DIR / result.port
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "events.csv"
    gt_path = out_dir / "ground_truth.json"

    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(list(EVENT_CONTENT_FIELDS))
        for e in result.events:
            writer.writerow([
                e.case_id, e.activity,
                e.start_ts.isoformat() if e.start_ts else "",
                e.end_ts.isoformat(),
                e.resource_id or "",
                e.status, e.seq,
                json.dumps(e.attributes, sort_keys=True, separators=(",", ":")),
            ])

    with gt_path.open("w", encoding="utf-8") as fh:
        json.dump(result.ground_truth, fh, indent=2, sort_keys=True)
    return csv_path, gt_path


# --- DB loading ------------------------------------------------------------


def load_into_db(result: GenResult) -> None:
    """(Re)load the generated dataset into Postgres, rebuilding the cases table.
    Deletes any prior built-in row for this deterministic dataset id first, so a
    re-seed is idempotent."""
    import sqlalchemy as sa

    # Imports deferred so the pure generator + tests don't require app/DB deps.
    sys.path.insert(0, str(BACKEND_DIR))
    from app.config import settings
    from app.db import Case, CaseOutcome, Dataset, DatasetSource, DatasetStatus, Event
    from sqlalchemy.orm import Session

    engine = sa.create_engine(settings.DATABASE_URL, future=True)
    with Session(engine, expire_on_commit=False) as session:
        session.execute(sa.delete(Dataset).where(Dataset.id == result.dataset_id))
        session.flush()

        stats = {
            "activities": result.activities,
            "resources": result.resources,
            "active_case_count": sum(1 for c in result.cases if c.is_active),
            "completed_case_count": sum(1 for c in result.cases if not c.is_active),
            "outcome_counts": dict(Counter(c.outcome for c in result.cases)),
        }
        session.add(
            Dataset(
                id=result.dataset_id,
                name=result.dataset_name,
                source=DatasetSource.builtin,
                status=DatasetStatus.ready,
                port_config=result.port,
                seed=result.seed,
                event_count=len(result.events),
                case_count=len(result.cases),
                time_range_start=result.window_start,
                time_range_end=result.window_end,
                stats=stats,
            )
        )
        session.add_all([
            Event(
                dataset_id=result.dataset_id,
                case_id=e.case_id,
                activity=e.activity,
                start_ts=e.start_ts,
                end_ts=e.end_ts,
                resource_id=e.resource_id,
                status=e.status,
                attributes=e.attributes,
                seq=e.seq,
            )
            for e in result.events
        ])
        session.add_all([
            Case(
                dataset_id=result.dataset_id,
                case_id=c.case_id,
                is_active=c.is_active,
                current_stage=c.current_stage,
                first_event_ts=c.first_event_ts,
                last_event_ts=c.last_event_ts,
                service_window_start=c.service_window_start,
                service_window_end=c.service_window_end,
                actual_berthing_ts=c.actual_berthing_ts,
                outcome=CaseOutcome(c.outcome),
                rework_count=c.rework_count,
                vessel_type=c.vessel_type,
                loa=c.loa,
                draft=c.draft,
                cargo_type=c.cargo_type,
                attributes=c.attributes,
            )
            for c in result.cases
        ])
        session.commit()
    engine.dispose()


# --- Distribution summary --------------------------------------------------


def _median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def print_summary(result: GenResult) -> None:
    cases = result.cases
    completed = [c for c in cases if not c.is_active]
    active = [c for c in cases if c.is_active]
    reworked = sum(1 for c in completed if c.rework_count > 0)
    rework_rate = (reworked / len(completed) * 100.0) if completed else 0.0

    # Median wait per stage: gap between a stage's end and the previous stage's
    # end within each case (observed waiting/service time leading into a stage).
    per_stage_waits: dict[str, list[float]] = {s: [] for s in STAGES}
    by_case: dict[str, list[GenEvent]] = {}
    for e in result.events:
        by_case.setdefault(e.case_id, []).append(e)
    for evs in by_case.values():
        evs.sort(key=lambda e: e.seq)
        for prev, cur in zip(evs, evs[1:], strict=False):
            gap = (cur.end_ts - prev.end_ts).total_seconds() / 3600.0
            per_stage_waits[cur.activity].append(gap)

    gt = result.ground_truth
    cause_counts = gt["delay_cause_counts"]
    bottleneck = gt["true_bottleneck"]

    print("\n" + "=" * 68)
    print(f"  {result.dataset_name}")
    print(f"  seed={result.seed}  events={len(result.events)}  cases={len(cases)}")
    print("=" * 68)
    print(f"  active vs completed        : {len(active)} active / {len(completed)} completed")
    print(f"  rework rate (completed)    : {rework_rate:.1f}%  ({reworked}/{len(completed)})")
    print(f"  outcome (completed)        : "
          f"{sum(1 for c in completed if c.outcome == 'late')} late / "
          f"{sum(1 for c in completed if c.outcome == 'on_time')} on_time")
    print("\n  median wait/service into each stage (hours):")
    for s in STAGES:
        print(f"    {s:<34}: {_median(per_stage_waits[s]):6.2f}")
    print("\n  cases by true delay cause (completed):")
    for cause, n in sorted(cause_counts.items(), key=lambda kv: -kv[1]):
        print(f"    {cause:<20}: {n}")
    print("  cases by true delay cause (late only):")
    for cause, n in sorted(gt["delay_cause_counts_late"].items(), key=lambda kv: -kv[1]):
        print(f"    {cause:<20}: {n}")
    print(f"\n  dominant bottleneck        : {bottleneck['stage']}  ({bottleneck['cause']})")
    print("  total delay by cause (min) :")
    for cause, mins in sorted(
        bottleneck["total_delay_minutes_by_cause"].items(), key=lambda kv: -kv[1]
    ):
        print(f"    {cause:<20}: {mins:,.0f}")
    print("=" * 68 + "\n")


# --- Entry point -----------------------------------------------------------


def main(port: str = "khalifa") -> int:
    cfg = load_port_config(port)
    result = generate(cfg)
    csv_path, gt_path = write_artifacts(result)
    print(f"generate_dataset: wrote {len(result.events)} events -> {csv_path}")
    print(f"generate_dataset: wrote ground truth -> {gt_path}  (gitignored, never DB-queryable)")
    try:
        load_into_db(result)
        print(f"generate_dataset: loaded dataset {result.dataset_id} into the database.")
    except Exception as exc:  # noqa: BLE001 — seeding is a dev convenience; surface, don't crash tests
        print(f"generate_dataset: DB load skipped ({exc.__class__.__name__}: {exc}).")
        print("  Ensure Postgres is running and `just migrate` has been applied.")
    print_summary(result)
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))

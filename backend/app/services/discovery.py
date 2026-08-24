"""Process discovery — the DFG, variants, and bottleneck ranking (M1-04).

Turns a case-ordered event log into a :class:`ProcessModel` (docs/DATA_CONTRACTS
§5.2): a directly-follows graph with timing, ranked trace variants, a ranked
bottleneck board, and headline metrics. Everything is ``observed`` provenance —
these are direct aggregations of the event log, not predictions or simulations
(docs/DATABASE.md §8).

**Determinism (CLAUDE.md rule #2).** The topology (edge set + frequencies and
the trace variants) comes from PM4Py, fed a log ordered strictly by each case's
``seq`` so that instant stages sharing a timestamp can never reorder. All timing
(durations, waits, p90s, variant totals) is computed directly from the real
event timestamps in ``seq`` order. Same event log in → identical model out.

**The bottleneck ranking is causal, not raw wait.** The single largest *duration*
in the Khalifa log is anchorage — but anchorage is a passive buffer with no
server: the vessel sits idle because upstream approval and the berth aren't ready.
A bottleneck is a *capacity constraint*: a stage where work queues for a finite
resource, or is redone because of a rework loop. So stages are ranked by their
**controllable delay contribution** — inbound queue wait (time cases spend
waiting to begin the stage) plus rework redo time (service burned in failed
iterations) — which surfaces reviewer overload (Authority review), the injected
dominant bottleneck, ahead of the anchorage symptom.
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Protocol

from app.core.provenance import Provenance
from app.schemas.common import KpiValue
from app.schemas.discovery import Bottleneck, DfgEdge, DfgNode, ProcessModel, Variant
from app.schemas.evidence import EvidenceRecord

# Resource ids that name a system actor rather than a finite human/berth server;
# excluded from resource-load reasoning (they don't queue).
_NON_RESOURCE = frozenset({"system"})

# A stage is flagged as a rework bottleneck when at least this fraction of the
# cases that reach it pass through it more than once.
_REWORK_MIN_RATE = 0.10

# How many bottlenecks the ranked board returns.
_MAX_BOTTLENECKS = 5


class EventLike(Protocol):
    """The event columns discovery reads. Satisfied by ORM ``Event`` rows and by
    the test's hand-built events alike."""

    case_id: str
    activity: str
    start_ts: datetime | None
    end_ts: datetime
    resource_id: str | None
    status: str | None
    seq: int | None
    attributes: dict[str, Any]


@dataclass
class EventLite:
    """A minimal event row — used by tests and by the ``discover`` DB path."""

    case_id: str
    activity: str
    start_ts: datetime | None
    end_ts: datetime
    resource_id: str | None = None
    status: str | None = None
    seq: int | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


# --- Small deterministic stats helpers -------------------------------------


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _p90(values: list[float]) -> float:
    """The 90th percentile (nearest-rank). Deterministic; no interpolation."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, -(-9 * len(ordered) // 10))  # ceil(0.9 * n), 1-based
    return float(ordered[rank - 1])


def _minutes(later: datetime, earlier: datetime) -> float:
    return (later - earlier).total_seconds() / 60.0


def _round(x: float, n: int = 1) -> float:
    return round(float(x), n)


# --- Log grouping ----------------------------------------------------------


def _group_by_case(events: list[EventLike]) -> dict[str, list[EventLike]]:
    """Group events by case and order each case by ``seq`` (falling back to
    ``end_ts`` when seq is absent). ``seq`` is authoritative because instant
    stages can share a timestamp."""
    by_case: dict[str, list[EventLike]] = defaultdict(list)
    for e in events:
        by_case[e.case_id].append(e)
    for evs in by_case.values():
        evs.sort(key=lambda e: (e.seq if e.seq is not None else 0, e.end_ts))
    return dict(by_case)


# --- PM4Py topology (edge set + variants) ----------------------------------


def _discover_topology(
    by_case: dict[str, list[EventLike]],
) -> tuple[dict[tuple[str, str], int], dict[tuple[str, ...], int]]:
    """Use PM4Py to discover the directly-follows edge frequencies and the trace
    variants. The log is fed a synthetic strictly-increasing timestamp that
    preserves each case's ``seq`` order, so PM4Py's topology is deterministic and
    identical to the event log's own ordering."""
    import pandas as pd
    import pm4py

    base = datetime(2000, 1, 1)
    records: list[dict[str, Any]] = []
    tick = 0
    for case_id in sorted(by_case):
        for e in by_case[case_id]:
            records.append(
                {
                    "case_id": case_id,
                    "activity": e.activity,
                    "ts": base + timedelta(seconds=tick),
                }
            )
            tick += 1

    frame = pd.DataFrame.from_records(records, columns=["case_id", "activity", "ts"])
    log = pm4py.format_dataframe(
        frame, case_id="case_id", activity_key="activity", timestamp_key="ts"
    )
    dfg, _start, _end = pm4py.discover_dfg(log)
    edge_freq: dict[tuple[str, str], int] = {(a, b): int(f) for (a, b), f in dfg.items()}

    variants_raw = pm4py.get_variants(log)
    variant_counts: dict[tuple[str, ...], int] = {}
    for key, traces in variants_raw.items():
        seq = tuple(key) if isinstance(key, tuple | list) else tuple(str(key).split(","))
        variant_counts[seq] = int(len(traces)) if hasattr(traces, "__len__") else int(traces)
    return edge_freq, variant_counts


# --- Nodes -----------------------------------------------------------------


def _build_nodes(by_case: dict[str, list[EventLike]]) -> list[DfgNode]:
    freq: Counter[str] = Counter()
    durations: dict[str, list[float]] = defaultdict(list)
    for evs in by_case.values():
        for e in evs:
            freq[e.activity] += 1
            if e.start_ts is not None:
                durations[e.activity].append(max(0.0, _minutes(e.end_ts, e.start_ts)))
    return [
        DfgNode(
            activity=act,
            frequency=freq[act],
            median_duration_min=_round(_median(durations.get(act, []))),
        )
        for act in sorted(freq, key=lambda a: (-freq[a], a))
    ]


# --- Edges (timing from real timestamps, frequencies from PM4Py) -----------


def _edge_start(e: EventLike) -> datetime:
    return e.start_ts if e.start_ts is not None else e.end_ts


def _build_edges(
    by_case: dict[str, list[EventLike]], edge_freq: dict[tuple[str, str], int]
) -> tuple[list[DfgEdge], dict[tuple[str, str], list[float]]]:
    """Edge frequencies come from PM4Py; the wait statistics are computed from the
    real timestamps as ``max(0, next.start - prev.end)`` — waiting time between
    stages, clamped at zero (the generator lets a vessel physically arrive before
    its berth frees, which would otherwise read as a negative wait)."""
    waits: dict[tuple[str, str], list[float]] = defaultdict(list)
    for evs in by_case.values():
        for prev, cur in zip(evs, evs[1:], strict=False):
            wait = max(0.0, _minutes(_edge_start(cur), prev.end_ts))
            waits[(prev.activity, cur.activity)].append(wait)

    edges: list[DfgEdge] = []
    for (src, tgt), freq in sorted(edge_freq.items(), key=lambda kv: (-kv[1], kv[0])):
        w = waits.get((src, tgt), [])
        edges.append(
            DfgEdge(
                source=src,
                target=tgt,
                frequency=freq,
                median_wait_min=_round(_median(w)),
                p90_wait_min=_round(_p90(w)),
            )
        )
    return edges, waits


# --- Variants --------------------------------------------------------------


def _build_variants(
    by_case: dict[str, list[EventLike]], variant_counts: dict[tuple[str, ...], int]
) -> list[Variant]:
    """Rank trace variants by count (desc), then by sequence for a stable order.
    Totals are the real end-to-end elapsed time per case, grouped by sequence."""
    totals: dict[tuple[str, ...], list[float]] = defaultdict(list)
    for evs in by_case.values():
        seq = tuple(e.activity for e in evs)
        total = _minutes(evs[-1].end_ts, _edge_start(evs[0]))
        totals[seq].append(max(0.0, total))

    variants: list[Variant] = []
    for seq in sorted(variant_counts, key=lambda s: (-variant_counts[s], s)):
        variants.append(
            Variant(
                sequence=list(seq),
                count=variant_counts[seq],
                median_total_min=_round(_median(totals.get(seq, []))),
            )
        )
    return variants


# --- Bottlenecks -----------------------------------------------------------


@dataclass
class _StageStats:
    activity: str
    visits: int
    cases: int
    reworked_cases: int
    inbound_wait_total: float
    inbound_waits: list[float]
    rework_redo_min: float
    resources: set[str]
    busy_min: float

    @property
    def rework_rate(self) -> float:
        return self.reworked_cases / self.cases if self.cases else 0.0

    @property
    def is_resource_served(self) -> bool:
        return bool(self.resources)

    @property
    def delay_contribution(self) -> float:
        """Controllable delay this stage imposes: queueing to enter it plus the
        service redone in failed rework iterations."""
        return self.inbound_wait_total + self.rework_redo_min


def _stage_stats(
    by_case: dict[str, list[EventLike]], waits: dict[tuple[str, str], list[float]]
) -> dict[str, _StageStats]:
    stats: dict[str, _StageStats] = {}

    def stat(act: str) -> _StageStats:
        if act not in stats:
            stats[act] = _StageStats(act, 0, 0, 0, 0.0, [], 0.0, set(), 0.0)
        return stats[act]

    for evs in by_case.values():
        per_case: Counter[str] = Counter()
        service: dict[str, list[float]] = defaultdict(list)
        for e in evs:
            s = stat(e.activity)
            s.visits += 1
            per_case[e.activity] += 1
            if e.resource_id and e.resource_id not in _NON_RESOURCE:
                s.resources.add(e.resource_id)
                if e.start_ts is not None:
                    dur = max(0.0, _minutes(e.end_ts, e.start_ts))
                    s.busy_min += dur
            if e.start_ts is not None:
                service[e.activity].append(max(0.0, _minutes(e.end_ts, e.start_ts)))
        for act, n in per_case.items():
            s = stat(act)
            s.cases += 1
            if n > 1:
                s.reworked_cases += 1
                # All-but-the-last visit is redone work: sum the earliest n-1 durations.
                redone = sorted(service.get(act, []))[: n - 1]
                s.rework_redo_min += sum(redone)

    # Inbound waits (time queued before entering a stage) from the edge waits.
    for (_src, tgt), wlist in waits.items():
        s = stat(tgt)
        s.inbound_waits.extend(wlist)
        s.inbound_wait_total += sum(wlist)

    return stats


def _bottleneck_metric(s: _StageStats) -> tuple[str, KpiValue]:
    """Characterise a stage by its dominant delay driver, as one of the contract's
    three metric kinds ('resource_load' | 'rework_rate' | 'median_wait')."""
    mean_wait_h = (s.inbound_wait_total / len(s.inbound_waits) / 60.0) if s.inbound_waits else 0.0
    if s.rework_redo_min > s.inbound_wait_total and s.rework_rate >= _REWORK_MIN_RATE:
        return "rework_rate", KpiValue(
            value=_round(s.rework_rate * 100.0), unit="percent", provenance=Provenance.observed
        )
    if s.is_resource_served and s.inbound_wait_total > 0.0:
        return "resource_load", KpiValue(
            value=_round(mean_wait_h), unit="hours", provenance=Provenance.observed
        )
    return "median_wait", KpiValue(
        value=_round(_median(s.inbound_waits) / 60.0, 2),
        unit="hours",
        provenance=Provenance.observed,
    )


def _bottleneck_notes(s: _StageStats, metric: str, rank: int) -> list[str]:
    """Structured, template-fillable evidence lines (numbers, not prose)."""
    notes: list[str] = []
    if metric == "resource_load":
        mean_wait_h = s.inbound_wait_total / len(s.inbound_waits) / 60.0 if s.inbound_waits else 0.0
        notes.append(
            f"{len(s.resources)} resources serve {s.visits} {s.activity} tasks; "
            f"cases wait a mean of {mean_wait_h:.1f}h "
            f"(p90 {_p90(s.inbound_waits) / 60.0:.1f}h) to begin"
        )
        superlative = " - the largest controllable delay in the process" if rank == 1 else ""
        notes.append(
            f"Total queue for this stage is {s.inbound_wait_total / 60.0:,.0f}h{superlative}"
        )
    elif metric == "rework_rate":
        notes.append(
            f"{s.reworked_cases} of {s.cases} cases pass through {s.activity} "
            f"more than once ({s.rework_rate * 100.0:.1f}% rework)"
        )
        notes.append(
            f"Redone work in failed iterations adds {s.rework_redo_min / 60.0:,.0f}h of service"
        )
    else:
        notes.append(
            f"Median wait to begin {s.activity} is {_median(s.inbound_waits) / 60.0:.1f}h "
            f"(p90 {_p90(s.inbound_waits) / 60.0:.1f}h) across {len(s.inbound_waits)} cases"
        )
    return notes


def _build_bottlenecks(stats: dict[str, _StageStats]) -> list[Bottleneck]:
    ranked = sorted(
        (s for s in stats.values() if s.delay_contribution > 0.0),
        key=lambda s: (-s.delay_contribution, s.activity),
    )[:_MAX_BOTTLENECKS]

    bottlenecks: list[Bottleneck] = []
    for rank, s in enumerate(ranked, start=1):
        metric, value = _bottleneck_metric(s)
        bottlenecks.append(
            Bottleneck(
                activity=s.activity,
                metric=metric,
                value=value,
                rank=rank,
                evidence=EvidenceRecord(
                    kind="bottleneck", notes=_bottleneck_notes(s, metric, rank)
                ),
            )
        )
    return bottlenecks


# --- Headline metrics ------------------------------------------------------


def _build_metrics(
    by_case: dict[str, list[EventLike]],
    stats: dict[str, _StageStats],
    terminal_activity: str | None,
) -> dict[str, KpiValue]:
    firsts = [evs[0].end_ts for evs in by_case.values() if evs]
    lasts = [evs[-1].end_ts for evs in by_case.values() if evs]
    span_min = (max(lasts) - min(firsts)).total_seconds() / 60.0 if firsts else 0.0
    span_weeks = span_min / (7 * 1440.0) if span_min else 0.0

    # A completed call is one that reached the process's terminal stage; cases
    # still in flight at the window cutoff don't count toward throughput.
    completed = sum(
        1 for evs in by_case.values() if evs and evs[-1].activity == terminal_activity
    )
    throughput = completed / span_weeks if span_weeks > 0 else 0.0

    reworked_cases = sum(
        1
        for evs in by_case.values()
        if any(cnt > 1 for cnt in Counter(e.activity for e in evs).values())
    )
    rework_rate = reworked_cases / len(by_case) * 100.0 if by_case else 0.0

    utils = [
        s.busy_min / (len(s.resources) * span_min) * 100.0
        for s in stats.values()
        if s.is_resource_served and span_min > 0.0 and s.busy_min > 0.0
    ]
    avg_util = sum(utils) / len(utils) if utils else 0.0

    return {
        "throughput_per_week": KpiValue(
            value=_round(throughput, 2), unit="count", provenance=Provenance.observed
        ),
        "rework_rate": KpiValue(
            value=_round(rework_rate), unit="percent", provenance=Provenance.observed
        ),
        "avg_utilization": KpiValue(
            value=_round(avg_util), unit="percent", provenance=Provenance.observed
        ),
    }


# --- Public entry point ----------------------------------------------------


def discover_process_model(events: list[EventLike], dataset_id: str) -> ProcessModel:
    """Discover the full :class:`ProcessModel` for one dataset's event log."""
    if not events:
        raise ValueError("cannot discover a process model from an empty event log")

    by_case = _group_by_case(events)
    edge_freq, variant_counts = _discover_topology(by_case)

    nodes = _build_nodes(by_case)
    edges, waits = _build_edges(by_case, edge_freq)
    variants = _build_variants(by_case, variant_counts)

    stats = _stage_stats(by_case, waits)
    bottlenecks = _build_bottlenecks(stats)

    # The terminal stage is the most common last activity across all cases.
    end_counts = Counter(evs[-1].activity for evs in by_case.values() if evs)
    terminal_activity = end_counts.most_common(1)[0][0] if end_counts else None
    metrics = _build_metrics(by_case, stats, terminal_activity)

    return ProcessModel(
        dataset_id=dataset_id,
        nodes=nodes,
        edges=edges,
        variants=variants,
        bottlenecks=bottlenecks,
        metrics=metrics,
    )


# --- Persistence (docs/DATABASE.md §5.1) -----------------------------------


def _to_row_columns(model: ProcessModel) -> dict[str, Any]:
    """Serialize a ProcessModel into the four ``process_models`` JSONB columns."""
    dumped = model.model_dump(mode="json")
    return {
        "dfg": {"nodes": dumped["nodes"], "edges": dumped["edges"]},
        "variants": dumped["variants"],
        "bottlenecks": dumped["bottlenecks"],
        "metrics": dumped["metrics"],
    }


def _from_row(row: Any) -> ProcessModel:
    """Reconstruct a ProcessModel from a stored ``process_models`` row."""
    return ProcessModel.model_validate(
        {
            "dataset_id": str(row.dataset_id),
            "nodes": row.dfg["nodes"],
            "edges": row.dfg["edges"],
            "variants": row.variants,
            "bottlenecks": row.bottlenecks,
            "metrics": row.metrics,
        }
    )


def run_discovery(session: Any, dataset_id: str) -> ProcessModel:
    """Discover the process model for a dataset from its stored events and cache it
    (replacing any prior model). Synchronous — discovery is fast (<5s); the async
    job envelope is deferred to M1-09 where operations are genuinely slow."""
    import sqlalchemy as sa

    from app.db import Event, ProcessModelRow

    events = list(
        session.execute(
            sa.select(Event)
            .where(Event.dataset_id == dataset_id)
            .order_by(Event.case_id, Event.seq)
        )
        .scalars()
        .all()
    )
    if not events:
        raise ValueError(f"dataset {dataset_id} has no events to discover")

    model = discover_process_model(events, str(dataset_id))
    cols = _to_row_columns(model)

    session.execute(sa.delete(ProcessModelRow).where(ProcessModelRow.dataset_id == dataset_id))
    session.add(ProcessModelRow(dataset_id=dataset_id, **cols))
    session.flush()
    return model


def get_saved_process_model(session: Any, dataset_id: str) -> ProcessModel | None:
    """Return the cached process model for a dataset, or ``None`` if not yet
    discovered."""
    import sqlalchemy as sa

    from app.db import ProcessModelRow

    row = session.execute(
        sa.select(ProcessModelRow).where(ProcessModelRow.dataset_id == dataset_id)
    ).scalar_one_or_none()
    return _from_row(row) if row is not None else None

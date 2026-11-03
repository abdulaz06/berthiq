"""Regression: the discovery topology (DFG edges + trace variants) is unchanged.

The expected values in ``fixtures/discovery_topology.expected.json`` were
recorded from PM4Py's ``discover_dfg`` / ``get_variants`` on the same logs and
matched the pure-Python counter exactly before PM4Py was removed. Any change
here changes the process graph the product shows.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from app.services.discovery import EventLike, EventLite, _discover_topology, _group_by_case

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

import generate_dataset as g  # noqa: E402 — path set above

EXPECTED = json.loads(
    (BACKEND_DIR / "tests" / "fixtures" / "discovery_topology.expected.json").read_text(
        encoding="utf-8"
    )
)

_BASE = datetime(2026, 1, 1)


def _ev(case: str, act: str, minute: float, seq: int) -> EventLite:
    at = _BASE + timedelta(minutes=minute)
    return EventLite(case_id=case, activity=act, start_ts=at, end_ts=at, seq=seq)


TINY = [
    _ev("c1", "A", 0, 1), _ev("c1", "B", 15, 2), _ev("c1", "C", 25, 3),
    _ev("c2", "A", 0, 1), _ev("c2", "B", 30, 2), _ev("c2", "C", 60, 3),
    _ev("c3", "A", 0, 1), _ev("c3", "B", 10, 2), _ev("c3", "A", 12, 3),
    _ev("c3", "B", 40, 4), _ev("c3", "C", 50, 5),
]
# Instant stages sharing one timestamp, a single-event case, and a self-loop.
SAME_TIME = [
    _ev("s1", "X", 0, 1), _ev("s1", "Y", 0, 2), _ev("s1", "Z", 0, 3),
    _ev("s2", "X", 5, 1),
    _ev("s3", "X", 1, 1), _ev("s3", "X", 1, 2), _ev("s3", "Y", 1, 3),
]


def _log(name: str) -> list[EventLike]:
    if name == "khalifa":
        return list(g.generate(g.load_port_config("khalifa")).events)
    return list({"tiny": TINY, "same_time": SAME_TIME}[name])


@pytest.mark.parametrize("name", ["khalifa", "tiny", "same_time"])
def test_topology_matches_recorded_values(name: str) -> None:
    edge_freq, variant_counts = _discover_topology(_group_by_case(_log(name)))
    expected = EXPECTED[name]
    assert edge_freq == {(a, b): n for a, b, n in expected["edges"]}
    assert variant_counts == {tuple(trace): n for trace, n in expected["variants"]}

"""M0-6 acceptance tests for the synthetic Khalifa generator.

Covers the properties the task and roadmap require:

* **Determinism** — same seed → byte-identical event content (``event_content_hash``),
  identical ground truth, stable dataset id; and the DB load is idempotent
  (two seeds → byte-identical rows).
* **Structural validity** — every case has contiguous, monotonic, ordered events
  starting at stage 1 and a valid outcome; active ⇔ no berthing event.
* **Ground-truth separation** — the hidden truth is written to a gitignored
  sibling artifact and never appears in ``events`` / ``cases`` / ``datasets.stats``
  (the only surfaces the application can query).
* **Injected bottleneck dominates** — Authority review (reviewer overload) is the
  statistically clear bottleneck, which M1-04's discovery test will assert on.

The pure-generation tests need no database. The DB tests reuse the shared
``session`` fixture and skip when no PostgreSQL is reachable.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

import generate_dataset as g  # noqa: E402 — path set above


@pytest.fixture(scope="module")
def cfg() -> dict:
    return g.load_port_config("khalifa")


@pytest.fixture(scope="module")
def result(cfg: dict) -> g.GenResult:
    return g.generate(cfg)


# --- Determinism -----------------------------------------------------------


def test_generation_is_deterministic(cfg: dict) -> None:
    r1 = g.generate(cfg)
    r2 = g.generate(cfg)
    assert g.event_content_hash(r1.events) == g.event_content_hash(r2.events)
    assert json.dumps(r1.ground_truth, sort_keys=True) == json.dumps(
        r2.ground_truth, sort_keys=True
    )
    assert r1.dataset_id == r2.dataset_id
    assert len(r1.events) == len(r2.events)


# --- Structural validity ---------------------------------------------------


def test_every_case_has_ordered_events_and_valid_outcome(result: g.GenResult) -> None:
    by_case: dict[str, list[g.GenEvent]] = {}
    for e in result.events:
        by_case.setdefault(e.case_id, []).append(e)

    case_ids = {c.case_id for c in result.cases}
    assert case_ids == set(by_case), "every case must have events and vice versa"

    for case in result.cases:
        evs = sorted(by_case[case.case_id], key=lambda e: e.seq)
        # Contiguous seq starting at 1.
        assert [e.seq for e in evs] == list(range(1, len(evs) + 1))
        # Starts at the case-start stage.
        assert evs[0].activity == g.S1_REQUEST
        # Monotonic end timestamps; each start <= its own end (no impossible order).
        for prev, cur in zip(evs, evs[1:], strict=False):
            assert cur.end_ts >= prev.end_ts
        for e in evs:
            if e.start_ts is not None:
                assert e.start_ts <= e.end_ts
        # Valid outcome, consistent with whether berthing was reached.
        assert case.outcome in {"active", "on_time", "late"}
        reached_berth = any(e.activity == g.S9_BERTHED for e in evs)
        if case.is_active:
            assert case.outcome == "active"
            assert not reached_berth
            assert case.actual_berthing_ts is None
        else:
            assert case.outcome in {"on_time", "late"}
            assert reached_berth
            assert case.actual_berthing_ts is not None


def test_activities_are_the_nine_defined_stages(result: g.GenResult) -> None:
    seen = {e.activity for e in result.events}
    assert seen <= set(g.STAGES)
    # The full flow (including the case-end stage) is exercised somewhere.
    assert {g.S1_REQUEST, g.S4_REVIEW, g.S9_BERTHED} <= seen


def test_volumes_are_in_the_target_range(result: g.GenResult) -> None:
    active = [c for c in result.cases if c.is_active]
    completed = [c for c in result.cases if not c.is_active]
    assert 15 <= len(active) <= 40, f"~25 active expected, got {len(active)}"
    assert 560 <= len(completed) <= 660, f"~600 completed expected, got {len(completed)}"
    assert 5500 <= len(result.events) <= 8500, f"~7k events expected, got {len(result.events)}"
    # Rework must be present and in a sane range (not zero, not runaway).
    reworked = sum(1 for c in completed if c.rework_count > 0)
    assert 0.15 <= reworked / len(completed) <= 0.55


# --- Ground-truth separation ----------------------------------------------


def test_ground_truth_keys_never_leak_into_transactional_records(result: g.GenResult) -> None:
    forbidden = g.GROUND_TRUTH_KEYS
    for e in result.events:
        assert not (forbidden & set(e.attributes)), f"event {e.case_id} leaks hidden truth"
    for c in result.cases:
        assert not (forbidden & set(c.attributes)), f"case {c.case_id} leaks hidden truth"


def test_ground_truth_artifact_holds_the_hidden_fields(result: g.GenResult) -> None:
    gt = result.ground_truth
    assert set(gt["cases"]) == {c.case_id for c in result.cases}
    a_case = next(iter(gt["cases"].values()))
    # The hidden fields live ONLY here.
    assert "true_delay_cause" in a_case
    assert "doc_completeness" in a_case
    assert "reference_berth" in next(iter(gt["reference_assignment"].values()))


def test_ground_truth_directory_is_gitignored() -> None:
    """The sibling artifact must sit under a gitignored path, so it is never
    committed and never served through the app's data directory."""
    gitignore = (BACKEND_DIR.parent / ".gitignore").read_text(encoding="utf-8")
    assert "backend/data/datasets/" in gitignore
    assert g.DATASETS_DIR.name == "datasets"
    assert g.DATASETS_DIR.parent.parent.name == "backend"


def test_write_artifacts_emits_clean_csv_and_hidden_ground_truth(
    result: g.GenResult, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(g, "DATASETS_DIR", tmp_path)
    csv_path, gt_path = g.write_artifacts(result)
    assert csv_path.exists() and gt_path.exists()

    header = csv_path.read_text(encoding="utf-8").splitlines()[0]
    assert "attributes" in header
    # No hidden column names surface in the event CSV.
    for key in g.GROUND_TRUTH_KEYS:
        assert key not in header

    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    assert gt["true_bottleneck"]["cause"] == g.CAUSE_REVIEWER


# --- Injected bottleneck dominates ----------------------------------------


def test_reviewer_overload_is_the_dominant_bottleneck(result: g.GenResult) -> None:
    gt = result.ground_truth
    bottleneck = gt["true_bottleneck"]
    assert bottleneck["cause"] == g.CAUSE_REVIEWER
    assert bottleneck["stage"] == g.S4_REVIEW

    totals = bottleneck["total_delay_minutes_by_cause"]
    ranked = sorted(totals.values(), reverse=True)
    assert totals[g.CAUSE_REVIEWER] == ranked[0], "reviewer overload must be the #1 delay source"
    # Clear margin over the runner-up so the bottleneck is unambiguous.
    assert ranked[0] >= 1.15 * ranked[1], f"bottleneck margin too thin: {totals}"

    # It is also the most common per-case cause among completed calls.
    counts = gt["delay_cause_counts"]
    assert max(counts, key=lambda k: counts[k]) == g.CAUSE_REVIEWER


# --- DB load (idempotent, separation preserved) ---------------------------


def _db_event_hash(conn, dataset_id) -> tuple[str, int]:
    import sqlalchemy as sa

    rows = conn.execute(
        sa.text(
            "select case_id, activity, start_ts, end_ts, resource_id, status, seq, attributes "
            "from events where dataset_id=:d order by case_id, seq"
        ),
        {"d": str(dataset_id)},
    ).all()
    blob = json.dumps([[str(x) for x in row] for row in rows], sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest(), len(rows)


def test_seed_load_is_idempotent_and_byte_identical(session, result: g.GenResult) -> None:
    """Two seeds into a clean schema produce byte-identical event rows, and the
    built-in dataset is marked ready. Uses the shared ``session`` fixture only to
    guarantee a fresh schema + teardown; the loader opens its own connection to
    the same database."""
    import sqlalchemy as sa
    from app.db import Dataset

    engine = session.get_bind()

    g.load_into_db(result)
    with engine.connect() as conn:
        h1, n1 = _db_event_hash(conn, result.dataset_id)
    g.load_into_db(result)
    with engine.connect() as conn:
        h2, n2 = _db_event_hash(conn, result.dataset_id)

    assert (h1, n1) == (h2, n2), "re-seeding must reproduce byte-identical event rows"
    assert n1 == len(result.events)

    ds = session.get(Dataset, result.dataset_id)
    assert ds is not None
    assert ds.status.value == "ready"
    assert ds.source.value == "builtin"
    assert ds.event_count == len(result.events)
    assert ds.case_count == len(result.cases)
    # Clean up the row this test loaded (schema is dropped by the fixture anyway).
    session.execute(sa.delete(Dataset).where(Dataset.id == result.dataset_id))
    session.commit()


def test_no_ground_truth_keys_reachable_through_db(session, result: g.GenResult) -> None:
    import sqlalchemy as sa
    from app.db import Dataset

    engine = session.get_bind()
    g.load_into_db(result)
    forbidden = g.GROUND_TRUTH_KEYS
    with engine.connect() as conn:
        ev_attrs = conn.execute(
            sa.text("select attributes from events where dataset_id=:d"),
            {"d": str(result.dataset_id)},
        ).scalars().all()
        case_attrs = conn.execute(
            sa.text("select attributes from cases where dataset_id=:d"),
            {"d": str(result.dataset_id)},
        ).scalars().all()
        stats = conn.execute(
            sa.text("select stats from datasets where id=:d"), {"d": str(result.dataset_id)}
        ).scalar_one()

    for a in ev_attrs:
        assert not (forbidden & set(a))
    for a in case_attrs:
        assert not (forbidden & set(a))
    assert not (forbidden & set(stats))

    session.execute(sa.delete(Dataset).where(Dataset.id == result.dataset_id))
    session.commit()

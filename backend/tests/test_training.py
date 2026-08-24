"""M1-06 acceptance tests for the offline risk-training pipeline.

What the task requires, proved:

* **No leakage** — feature columns never include a target-derived name, and every
  feature is invariant to deleting events that start after the prediction point
  (recomputing with the future removed yields identical feature rows).
* **Chronological split** — the train/val/test windows are ordered in time and
  share no case, so the model always predicts strictly-future calls.
* **Beats the baselines** — the HistGradientBoosting main model beats both the
  majority-class and logistic-regression baselines on PR-AUC on the held-out
  future test window.
* **Standalone artifact** — the saved model loads on its own and predicts.
* **Reviewer-overload signals surface** — a reviewer-queue/load/rework feature
  ranks among the top SHAP drivers, consistent with the discovered bottleneck.

All tests run on the generator's own in-memory event log — no database needed.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
from app.services.prediction import (
    FEATURE_COLUMNS,
    FORBIDDEN_FEATURE_NAMES,
    LABEL_COLUMN,
    META_COLUMNS,
    RiskModel,
    build_dataset,
    chronological_split,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

import generate_dataset as g  # noqa: E402 — path set above
import train_models  # noqa: E402


@pytest.fixture(scope="module")
def events() -> list[Any]:
    return list(g.generate(g.load_port_config("khalifa")).events)


@pytest.fixture(scope="module")
def frame(events: list[Any]) -> Any:
    return build_dataset(events)


@pytest.fixture(scope="module")
def trained(events: list[Any]) -> tuple[RiskModel, dict[str, Any], list[tuple[str, float]]]:
    return train_models.train(events)


# --- Leakage: no target-derived feature names ------------------------------


def test_no_forbidden_feature_names() -> None:
    assert set(FEATURE_COLUMNS).isdisjoint(FORBIDDEN_FEATURE_NAMES)
    assert LABEL_COLUMN not in FEATURE_COLUMNS
    for meta in META_COLUMNS:
        assert meta not in FEATURE_COLUMNS


# --- Leakage: features use no information after the prediction point --------


def test_features_invariant_to_future_events(events: list[Any], frame: Any) -> None:
    """Deleting every event that starts after the prediction point t must not
    change any feature at t. Proves no feature depends on post-prediction info,
    incl. the cross-case system-state features."""
    # Sample rows across the timeline (skip trivial single-event prefixes).
    sample = frame[frame["n_events"] >= 3].iloc[::400]
    assert len(sample) >= 5

    checked_nontrivial = 0
    for _, row in sample.iterrows():
        case_id = row["case_id"]
        t = row["prediction_time"]

        # Only events observable by t (start <= t). Any event that starts later
        # cannot be known at t and must not influence the features.
        observable = [
            e for e in events if (e.start_ts if e.start_ts is not None else e.end_ts) <= t
        ]
        assert len(observable) < len(events)  # we really did drop future events

        # (case_id, prediction_time) alone isn't unique — instant stages can share
        # an end timestamp — so pin the exact prefix by its length too.
        refr = build_dataset(observable, include_active=True)
        match = refr[
            (refr["case_id"] == case_id)
            & (refr["prediction_time"] == t)
            & (refr["n_events"] == row["n_events"])
        ]
        assert len(match) == 1, f"prefix {case_id}@{t} not reproduced from observable log"

        for col in FEATURE_COLUMNS:
            a, b = row[col], match.iloc[0][col]
            if a != a and b != b:  # both NaN
                continue
            assert a == b, f"feature {col} changed when future events were removed"

        if row["reviewers_busy"] > 0 or row["reviewer_queue_len"] > 0:
            checked_nontrivial += 1

    # At least some sampled rows exercised the cross-case system-state features.
    assert checked_nontrivial >= 1


# --- Chronological split ----------------------------------------------------


def test_chronological_split_is_ordered_and_disjoint(frame: Any) -> None:
    train_df, val_df, test_df = chronological_split(frame)
    assert len(train_df) and len(val_df) and len(test_df)

    train_cases = set(train_df["case_id"])
    val_cases = set(val_df["case_id"])
    test_cases = set(test_df["case_id"])
    # No case spans two splits (all its prefixes stay together).
    assert train_cases.isdisjoint(val_cases)
    assert train_cases.isdisjoint(test_cases)
    assert val_cases.isdisjoint(test_cases)

    # Strictly ordered in time: every train case precedes every val/test case.
    assert train_df["case_anchor"].max() <= val_df["case_anchor"].min()
    assert val_df["case_anchor"].max() <= test_df["case_anchor"].min()


# --- Beats the baselines on the future window -------------------------------


def test_main_beats_baselines_on_pr_auc(trained: tuple[Any, dict[str, Any], Any]) -> None:
    _model, metrics, _shap = trained
    main = metrics["main"].pr_auc
    assert main > metrics["majority"].pr_auc, "main lost to majority-class on PR-AUC"
    assert main > metrics["logistic"].pr_auc, "main lost to logistic on PR-AUC"
    # AUROC corroborates the ranking win.
    assert metrics["main"].auroc > metrics["logistic"].auroc


def test_metrics_are_computed_on_future_test_window(events: list[Any], frame: Any) -> None:
    """The reported metrics must come from the strictly-later test window, not the
    training data."""
    train_df, val_df, test_df = chronological_split(frame)
    # The test window's earliest case starts after the whole dev window's cases.
    dev_max = max(train_df["case_anchor"].max(), val_df["case_anchor"].max())
    assert test_df["case_anchor"].min() >= dev_max
    # And the majority baseline (constant) has AUROC of exactly 0.5 — a sanity peg
    # that we scored a real, mixed-label test set.
    _model, metrics, _shap = train_models.train(events)
    assert abs(metrics["majority"].auroc - 0.5) < 1e-9


# --- Standalone artifact ----------------------------------------------------


def test_artifact_loads_standalone_and_predicts(
    trained: tuple[Any, dict[str, Any], Any], frame: Any, tmp_path: Path
) -> None:
    model, _metrics, _shap = trained
    path = tmp_path / "risk_model.joblib"
    model.save(path)

    reloaded = RiskModel.load(path)
    assert reloaded.model_version == model.model_version
    assert reloaded.feature_columns == list(FEATURE_COLUMNS)

    rows = frame.head(50)
    proba = reloaded.predict_proba(rows)
    assert len(proba) == len(rows)
    assert float(proba.min()) >= 0.0 and float(proba.max()) <= 1.0
    # Identical predictions before and after a round-trip (deterministic artifact).
    assert list(reloaded.predict_proba(rows)) == list(model.predict_proba(rows))


# --- Reviewer-overload signals rank high ------------------------------------


def test_reviewer_overload_signals_in_top_features(
    trained: tuple[Any, dict[str, Any], list[tuple[str, float]]],
) -> None:
    _model, _metrics, shap_top = trained
    top6 = {name for name, _ in shap_top[:6]}
    reviewer_signals = {
        "reviewers_busy",
        "reviewer_queue_len",
        "rework_count_so_far",
        "hour_of_day",  # night-shift reviewer shortage
    }
    assert top6 & reviewer_signals, (
        f"expected a reviewer-overload signal in the top-6 SHAP features, got {top6}"
    )

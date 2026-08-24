"""Risk prediction — leakage-safe prefix features + the miss-risk model (M1-06).

The prediction target (docs/PRODUCT_DEFINITION §14): *will this active port call
miss its service window?* — binary, recomputed at every completed event for every
active case.

This module is the **shared** half used by both the offline trainer
(``backend/scripts/train_models.py``) and, later, the inference service (M1-07):

* :func:`build_dataset` turns an event log into one row per *prefix* (the state
  of a case at each completed event), with strictly leakage-safe features.
* :class:`RiskModel` wraps the calibrated HistGradientBoosting classifier plus its
  ordinal encoding and a SHAP explainer, and saves/loads a standalone artifact.

**Leakage discipline (docs/PRODUCT_DEFINITION §14 / CLAUDE.md rule #2).** A feature
at prediction time ``t`` (the ``end_ts`` of the prefix's last event) may depend
only on information observable by ``t``: the case's own events up to ``t``, and,
for system-state features, other cases' event *times* that fall at or before ``t``.
No feature reads an event that starts after ``t``, the case's final outcome, its
actual berthing time, or its final rework count. :func:`build_dataset` is written
so that deleting every event with ``start_ts > t`` leaves every feature unchanged
— which the leakage test asserts directly.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

# --- The nine stages, in canonical order (mirrors the generator) -----------

STAGES: tuple[str, ...] = (
    "Port call request submitted",
    "Documents submitted",
    "Completeness check",
    "Authority review",
    "Arrival plan confirmed",
    "Berth planning",
    "Berth assigned",
    "Vessel arrives / anchorage wait",
    "Berthed, cargo start",
)
_STAGE_INDEX = {s: i for i, s in enumerate(STAGES)}
_TERMINAL_STAGE = STAGES[-1]

# --- Feature schema (the ONLY columns the model sees) ----------------------

NUMERIC_FEATURES: tuple[str, ...] = (
    "total_elapsed_min",
    "time_in_current_stage_min",
    "last_stage_duration_min",
    "n_events",
    "max_stage_index",
    "rework_count_so_far",
    "n_reviews_so_far",
    "missing_doc_count",
    "loa",
    "draft",
    "reviewer_queue_len",
    "reviewers_busy",
    "cases_awaiting_berth",
    "active_cases",
    "weather_severity",
    "window_slack_min",
    "hour_of_day",
    "is_night",
)
CATEGORICAL_FEATURES: tuple[str, ...] = (
    "current_stage",
    "vessel_type",
    "cargo_type",
)
FEATURE_COLUMNS: tuple[str, ...] = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Names that would leak the label if they ever became features. The leakage test
# asserts none of them appear in FEATURE_COLUMNS.
FORBIDDEN_FEATURE_NAMES: frozenset[str] = frozenset(
    {
        "outcome",
        "is_late",
        "label",
        "miss",
        "actual_berthing_ts",
        "actual_berthing",
        "rework_count",  # the FINAL count; only *_so_far is allowed
        "service_window_end",  # only window_slack (sw_end - t) is derived, at t
    }
)

LABEL_COLUMN = "label"
META_COLUMNS: tuple[str, ...] = ("case_id", "prediction_time", "case_anchor")

MODEL_VERSION = "risk-hgb-v1"

# HistGradientBoosting hyperparameters. Chosen on the validation window then refit
# on train+val (see backend/scripts/train_models.py). Deliberately shallow + well
# regularized: the chronological (future) test window is distribution-shifted, and
# an over-flexible model overfits the training period and loses to plain logistic.
HGB_PARAMS: dict[str, Any] = {
    "learning_rate": 0.03,
    "max_iter": 400,
    "max_depth": 3,
    "min_samples_leaf": 40,
    "l2_regularization": 3.0,
    "early_stopping": False,
}
RANDOM_STATE = 20260601


class EventLike(Protocol):
    """The event columns prediction reads (ORM ``Event`` rows satisfy it)."""

    case_id: str
    activity: str
    start_ts: datetime | None
    end_ts: datetime
    resource_id: str | None
    status: str | None
    seq: int | None
    attributes: dict[str, Any]


@dataclass
class _Ev:
    """A normalized event; ``start`` falls back to ``end`` for instant stages."""

    case_id: str
    activity: str
    start: datetime
    end: datetime
    resource_id: str | None
    status: str | None
    seq: int
    attributes: dict[str, Any]


def _normalize(events: list[EventLike]) -> dict[str, list[_Ev]]:
    by_case: dict[str, list[_Ev]] = {}
    for e in events:
        ev = _Ev(
            case_id=e.case_id,
            activity=e.activity,
            start=e.start_ts if e.start_ts is not None else e.end_ts,
            end=e.end_ts,
            resource_id=e.resource_id,
            status=e.status,
            seq=e.seq if e.seq is not None else 0,
            attributes=e.attributes or {},
        )
        by_case.setdefault(ev.case_id, []).append(ev)
    for evs in by_case.values():
        evs.sort(key=lambda x: (x.seq, x.end))
    return by_case


# --- System state as of time t (all leakage-safe: times <= t only) ---------


def _mins(a: datetime, b: datetime) -> float:
    return (a - b).total_seconds() / 60.0


class _Counter:
    """Counts half-open intervals [start, exit) active at t = (#start<=t) -
    (#exit<=t). Both bounds are event *times*; querying with times <= t makes the
    count invariant to removing any event that starts after t."""

    def __init__(self, starts: list[datetime], exits: list[datetime]) -> None:
        self._starts = sorted(starts)
        self._exits = sorted(exits)

    def at(self, t: datetime) -> int:
        return bisect.bisect_right(self._starts, t) - bisect.bisect_right(self._exits, t)


@dataclass
class _SystemState:
    reviewers_busy: _Counter
    reviewer_queue: _Counter
    awaiting_berth: _Counter
    active_cases: _Counter

    def features(self, t: datetime) -> dict[str, float]:
        return {
            "reviewers_busy": float(max(0, self.reviewers_busy.at(t))),
            "reviewer_queue_len": float(max(0, self.reviewer_queue.at(t))),
            "cases_awaiting_berth": float(max(0, self.awaiting_berth.at(t))),
            "active_cases": float(max(0, self.active_cases.at(t))),
        }


def _build_system_state(by_case: dict[str, list[_Ev]]) -> _SystemState:
    review_starts: list[datetime] = []
    review_ends: list[datetime] = []
    passed_check_ends: list[datetime] = []  # completed completeness checks -> a review follows
    berth_assigned_ends: list[datetime] = []
    berthed_starts: list[datetime] = []
    first_ends: list[datetime] = []

    for evs in by_case.values():
        first_ends.append(evs[0].end)
        for e in evs:
            if e.activity == "Authority review":
                review_starts.append(e.start)
                review_ends.append(e.end)
            elif e.activity == "Completeness check" and e.status == "completed":
                passed_check_ends.append(e.end)
            elif e.activity == "Berth assigned":
                berth_assigned_ends.append(e.end)
            elif e.activity == _TERMINAL_STAGE:
                berthed_starts.append(e.start)

    return _SystemState(
        reviewers_busy=_Counter(review_starts, review_ends),
        # A passed completeness check enters the reviewer queue; the review start
        # leaves it. Both are times <= t, so no future review is referenced.
        reviewer_queue=_Counter(passed_check_ends, review_starts),
        awaiting_berth=_Counter(berth_assigned_ends, berthed_starts),
        # In the system from first event until it berths (the terminal stage).
        active_cases=_Counter(first_ends, berthed_starts),
    )


# --- Per-prefix case features (from the prefix events only) -----------------


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _prefix_features(prefix: list[_Ev], t: datetime) -> dict[str, Any]:
    first = prefix[0]
    last = prefix[-1]
    attrs = last.attributes
    prev_end = prefix[-2].end if len(prefix) >= 2 else first.end

    rework = sum(1 for e in prefix if e.status in ("returned", "rejected"))
    n_reviews = sum(1 for e in prefix if e.activity == "Authority review")
    max_stage = max((_STAGE_INDEX.get(e.activity, 0) for e in prefix), default=0)

    # Service window end is set at stage 5; usable only once seen in the prefix.
    window_slack: float = float("nan")
    for e in prefix:
        sw_end = e.attributes.get("service_window_end")
        if sw_end:
            window_slack = _mins(datetime.fromisoformat(sw_end), t)
            break

    # Weather severity is recorded from the anchorage stage on; latest seen value.
    weather: float = float("nan")
    for e in reversed(prefix):
        if "weather_severity" in e.attributes:
            weather = _num(e.attributes["weather_severity"])
            break

    return {
        "current_stage": last.activity,
        "vessel_type": attrs.get("vessel_type"),
        "cargo_type": attrs.get("cargo_type"),
        "total_elapsed_min": _mins(t, first.end),
        "time_in_current_stage_min": _mins(t, prev_end),
        "last_stage_duration_min": _mins(last.end, last.start),
        "n_events": float(len(prefix)),
        "max_stage_index": float(max_stage),
        "rework_count_so_far": float(rework),
        "n_reviews_so_far": float(n_reviews),
        "missing_doc_count": _num(attrs.get("missing_doc_count")),
        "loa": _num(attrs.get("loa")),
        "draft": _num(attrs.get("draft")),
        "weather_severity": weather,
        "window_slack_min": window_slack,
        "hour_of_day": float(t.hour),
        "is_night": 1.0 if (t.hour < 6 or t.hour >= 18) else 0.0,
    }


def build_dataset(events: list[EventLike], *, include_active: bool = False) -> Any:
    """Build the leakage-safe prefix dataset as a pandas DataFrame.

    One row per (completed case, prefix ending before the terminal berthing event)
    — mirroring how an *active* case is scored in real time. Columns:
    ``FEATURE_COLUMNS`` + ``label`` + ``META_COLUMNS``. With ``include_active`` the
    still-in-flight cases are emitted too (label ``NaN``) for inference/debugging.
    """
    import pandas as pd

    by_case = _normalize(events)
    state = _build_system_state(by_case)

    rows: list[dict[str, Any]] = []
    for case_id in sorted(by_case):
        evs = by_case[case_id]
        berthed = any(e.activity == _TERMINAL_STAGE for e in evs)
        if not berthed and not include_active:
            continue  # no final label -> not training data
        label = 1 if _case_is_late(evs) else 0
        anchor = evs[0].end
        # Prefixes ending at each event EXCEPT the terminal berthing (an active
        # case is, by definition, not yet berthed).
        last_idx = len(evs) - 1
        upper = last_idx if evs[last_idx].activity == _TERMINAL_STAGE else len(evs)
        for i in range(upper):
            prefix = evs[: i + 1]
            t = prefix[-1].end
            row = _prefix_features(prefix, t)
            row.update(state.features(t))
            row[LABEL_COLUMN] = label if berthed else float("nan")
            row["case_id"] = case_id
            row["prediction_time"] = t
            row["case_anchor"] = anchor
            rows.append(row)

    frame = pd.DataFrame.from_records(rows)
    # Stable column order.
    ordered = [*FEATURE_COLUMNS, LABEL_COLUMN, *META_COLUMNS]
    return frame[ordered]


def _case_is_late(evs: list[_Ev]) -> bool:
    """Recompute the label from events alone: actual berthing (terminal stage
    time) after the service-window end. Used for training targets only — never a
    feature."""
    sw_end: datetime | None = None
    berth_ts: datetime | None = None
    for e in evs:
        raw = e.attributes.get("service_window_end")
        if raw and sw_end is None:
            sw_end = datetime.fromisoformat(raw)
        if e.activity == _TERMINAL_STAGE:
            berth_ts = e.end
    if sw_end is None or berth_ts is None:
        return False
    return berth_ts > sw_end


# --- Chronological split (predict future cases from past ones) --------------


def chronological_split(
    frame: Any, *, train: float = 0.6, val: float = 0.2
) -> tuple[Any, Any, Any]:
    """Split rows by *case* along the case-anchor timeline, so all prefixes of a
    case share a split and every test case is strictly later than every train
    case. Returns (train_df, val_df, test_df)."""
    case_anchor = (
        frame[["case_id", "case_anchor"]].drop_duplicates().sort_values("case_anchor")
    )
    cases = list(case_anchor["case_id"])
    n = len(cases)
    n_train = int(n * train)
    n_val = int(n * (train + val))
    train_ids = set(cases[:n_train])
    val_ids = set(cases[n_train:n_val])
    test_ids = set(cases[n_val:])
    return (
        frame[frame["case_id"].isin(train_ids)].copy(),
        frame[frame["case_id"].isin(val_ids)].copy(),
        frame[frame["case_id"].isin(test_ids)].copy(),
    )


# --- The model artifact -----------------------------------------------------


@dataclass
class RiskModel:
    """The miss-risk classifier + its ordinal encoding, saveable as a single
    standalone joblib artifact. The HistGradientBoosting model is used directly:
    on this data it is already well-calibrated (Brier ~0.11) and post-hoc
    calibration (isotonic/sigmoid) only degraded ranking, so none is applied —
    the calibration *curve* is reported as a diagnostic instead. SHAP attributions
    come from the same tree model."""

    model: Any  # HistGradientBoostingClassifier
    encoder: Any  # OrdinalEncoder for CATEGORICAL_FEATURES
    feature_columns: list[str]
    categorical_features: list[str]
    model_version: str = MODEL_VERSION

    def _encode(self, frame: Any) -> Any:
        x = frame[self.feature_columns].copy()
        x[self.categorical_features] = self.encoder.transform(
            frame[self.categorical_features].astype("object")
        )
        return x.astype(float)

    @classmethod
    def fit(cls, train_frame: Any, *, random_state: int = RANDOM_STATE) -> RiskModel:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.preprocessing import OrdinalEncoder

        feature_columns = list(FEATURE_COLUMNS)
        categorical = list(CATEGORICAL_FEATURES)
        encoder = OrdinalEncoder(
            handle_unknown="use_encoded_value", unknown_value=-1
        ).fit(train_frame[categorical].astype("object"))

        x = train_frame[feature_columns].copy()
        x[categorical] = encoder.transform(train_frame[categorical].astype("object"))
        x = x.astype(float)
        y = train_frame[LABEL_COLUMN].astype(int)

        cat_mask = [c in categorical for c in feature_columns]
        model = HistGradientBoostingClassifier(
            categorical_features=cat_mask, random_state=random_state, **HGB_PARAMS
        ).fit(x, y)

        return cls(
            model=model,
            encoder=encoder,
            feature_columns=feature_columns,
            categorical_features=categorical,
        )

    def predict_proba(self, frame: Any) -> Any:
        """Miss probability (P[label=1]) for each row."""
        return self.model.predict_proba(self._encode(frame))[:, 1]

    def shap_values(self, frame: Any) -> Any:
        """Per-row SHAP attributions (n_rows × n_features) from the tree model."""
        import numpy as np
        import shap

        explainer = shap.TreeExplainer(self.model)
        values = explainer.shap_values(self._encode(frame))
        arr = np.asarray(values)
        if arr.ndim == 3:  # (n, features, classes) -> positive class
            arr = arr[..., -1]
        return arr

    def mean_abs_shap(self, frame: Any) -> list[tuple[str, float]]:
        """Global feature importance = mean |SHAP| over ``frame``, descending."""
        import numpy as np

        arr = np.abs(self.shap_values(frame)).mean(axis=0)
        ranked = sorted(zip(self.feature_columns, arr, strict=True), key=lambda kv: -kv[1])
        return [(name, float(v)) for name, v in ranked]

    def save(self, path: Any) -> None:
        import joblib

        joblib.dump(
            {
                "model": self.model,
                "encoder": self.encoder,
                "feature_columns": self.feature_columns,
                "categorical_features": self.categorical_features,
                "model_version": self.model_version,
            },
            path,
        )

    @classmethod
    def load(cls, path: Any) -> RiskModel:
        import joblib

        d = joblib.load(path)
        return cls(
            model=d["model"],
            encoder=d["encoder"],
            feature_columns=d["feature_columns"],
            categorical_features=d["categorical_features"],
            model_version=d["model_version"],
        )

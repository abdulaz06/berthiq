"""Offline training pipeline for the miss-risk model (M1-06).

Not an app endpoint — a script you run offline. It:

1. loads the event log (from the DB, or a supplied port config with ``--generate``),
2. builds the leakage-safe, prefix-based dataset (:mod:`app.services.prediction`),
3. splits it **chronologically** by case (predict future calls from past ones),
4. trains two baselines (majority class, logistic regression) and the
   HistGradientBoosting main model,
5. reports PR-AUC (primary — delays are the minority class), AUROC, Brier, and a
   calibration curve on the held-out *future* test window,
6. prints the top SHAP features (expect reviewer-overload / rework signals high),
7. writes ``backend/models/risk_model.joblib`` — a standalone artifact.

Training is deterministic (fixed seeds) and offline; slowness is fine.

    python backend/scripts/train_models.py            # from the seeded DB
    python backend/scripts/train_models.py --generate # from khalifa.json, no DB
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BACKEND_DIR / "models"
DEFAULT_ARTIFACT = MODELS_DIR / "risk_model.joblib"

sys.path.insert(0, str(BACKEND_DIR))

from app.services.prediction import (  # noqa: E402 — path set above
    LABEL_COLUMN,
    RiskModel,
    build_dataset,
    chronological_split,
)


@dataclass
class Metrics:
    name: str
    pr_auc: float
    auroc: float
    brier: float

    def row(self) -> str:
        return (
            f"  {self.name:<26} PR-AUC={self.pr_auc:.4f}  "
            f"AUROC={self.auroc:.4f}  Brier={self.brier:.4f}"
        )


def evaluate(name: str, y_true: Any, p_pred: Any) -> Metrics:
    import numpy as np
    from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

    y = np.asarray(y_true).astype(int)
    p = np.clip(np.asarray(p_pred, dtype=float), 0.0, 1.0)
    # AUROC is undefined with a single class present; guard for tiny splits.
    auroc = roc_auc_score(y, p) if len(np.unique(y)) > 1 else float("nan")
    return Metrics(
        name=name,
        pr_auc=float(average_precision_score(y, p)),
        auroc=float(auroc),
        brier=float(brier_score_loss(y, p)),
    )


def _majority_proba(train_y: Any, n: int) -> Any:
    import numpy as np

    rate = float(np.asarray(train_y).astype(int).mean())
    return np.full(n, rate, dtype=float)


def _fit_logistic(train_frame: Any) -> Any:
    from app.services.prediction import CATEGORICAL_FEATURES, FEATURE_COLUMNS, NUMERIC_FEATURES
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    pre = ColumnTransformer(
        [
            (
                "num",
                Pipeline(
                    [("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]
                ),
                list(NUMERIC_FEATURES),
            ),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                list(CATEGORICAL_FEATURES),
            ),
        ]
    )
    pipe = Pipeline(
        [
            ("pre", pre),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    pipe.fit(train_frame[list(FEATURE_COLUMNS)], train_frame[LABEL_COLUMN].astype(int))
    return pipe


def _load_events(use_generate: bool) -> list[Any]:
    if use_generate:
        sys.path.insert(0, str(BACKEND_DIR / "scripts"))
        import generate_dataset as g

        return list(g.generate(g.load_port_config("khalifa")).events)

    import sqlalchemy as sa
    from app.config import settings
    from app.db import Event
    from sqlalchemy.orm import Session

    engine = sa.create_engine(settings.DATABASE_URL, future=True)
    with Session(engine) as session:
        dataset_id = session.execute(
            sa.text("SELECT id FROM datasets ORDER BY created_at")
        ).scalar()
        if dataset_id is None:
            raise SystemExit("No dataset in the DB. Run `just seed` first, or use --generate.")
        events = list(
            session.execute(
                sa.select(Event).where(Event.dataset_id == dataset_id).order_by(
                    Event.case_id, Event.seq
                )
            )
            .scalars()
            .all()
        )
    engine.dispose()
    return events


def train(events: list[Any]) -> tuple[RiskModel, dict[str, Metrics], list[tuple[str, float]]]:
    """Build the dataset, split chronologically, train all three models, and
    evaluate on the future test window. Returns (main_model, metrics, shap_top).

    Protocol: hyperparameters were selected on the validation window during
    development; the final models are refit on train+val (the development set) and
    evaluated once on the strictly-later test window.
    """
    import pandas as pd
    from app.services.prediction import FEATURE_COLUMNS

    frame = build_dataset(events)
    train_df, val_df, test_df = chronological_split(frame)
    dev_df = pd.concat([train_df, val_df])

    y_test = test_df[LABEL_COLUMN].astype(int)

    # Baseline 1: majority-class constant (the development-set positive rate).
    maj = evaluate("majority-class", y_test, _majority_proba(dev_df[LABEL_COLUMN], len(test_df)))

    # Baseline 2: logistic regression.
    logit = _fit_logistic(dev_df)
    p_logit = logit.predict_proba(test_df[list(FEATURE_COLUMNS)])[:, 1]
    log_m = evaluate("logistic-regression", y_test, p_logit)

    # Main model: HistGradientBoosting.
    model = RiskModel.fit(dev_df)
    p_main = model.predict_proba(test_df)
    main_m = evaluate("hist-gradient-boosting", y_test, p_main)

    shap_top = model.mean_abs_shap(test_df)

    metrics = {"majority": maj, "logistic": log_m, "main": main_m}
    return model, metrics, shap_top


def _calibration_report(model: RiskModel, test_df: Any) -> str:
    from sklearn.calibration import calibration_curve

    p = model.predict_proba(test_df)
    y = test_df[LABEL_COLUMN].astype(int)
    frac_pos, mean_pred = calibration_curve(y, p, n_bins=5, strategy="quantile")
    lines = ["  calibration (5 quantile bins)  predicted -> observed:"]
    for mp, fp in zip(mean_pred, frac_pos, strict=False):
        lines.append(f"    {mp:.3f} -> {fp:.3f}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    use_generate = "--generate" in argv

    events = _load_events(use_generate)
    frame = build_dataset(events)
    train_df, val_df, test_df = chronological_split(frame)

    model, metrics, shap_top = train(events)

    print("\n" + "=" * 70)
    print("  BerthIQ miss-risk model — training report")
    print("=" * 70)
    print(
        f"  samples: {len(frame)}  (train {len(train_df)} / val {len(val_df)} / "
        f"test {len(test_df)})"
    )
    pos = int(frame[LABEL_COLUMN].sum())
    print(f"  positive (late) rate: {pos / len(frame) * 100:.1f}%  ({pos}/{len(frame)})")
    print(
        f"  chronological test window: {test_df['case_anchor'].min()} .. "
        f"{test_df['case_anchor'].max()}"
    )
    print("\n  metrics on the held-out FUTURE test window:")
    print(metrics["majority"].row())
    print(metrics["logistic"].row())
    print(metrics["main"].row())
    print(
        f"\n  main vs baselines (PR-AUC): "
        f"+{metrics['main'].pr_auc - metrics['majority'].pr_auc:.4f} over majority, "
        f"+{metrics['main'].pr_auc - metrics['logistic'].pr_auc:.4f} over logistic"
    )
    print("\n" + _calibration_report(model, test_df))
    print("\n  top SHAP features (mean |SHAP| on the test window):")
    for name, val in shap_top[:12]:
        print(f"    {name:<28} {val:.4f}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model.save(DEFAULT_ARTIFACT)
    print(f"\n  saved artifact -> {DEFAULT_ARTIFACT}")
    print("=" * 70 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

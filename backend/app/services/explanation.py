"""TemplateExplainer — deterministic phrasing of an EvidenceRecord (M1-07).

CLAUDE.md rule #4 / docs/DATA_CONTRACTS §4: explanations are *rendered*, never
generated. This module turns the structured evidence (a miss probability and the
signed SHAP factors) into a sentence with a fixed template. It invents no numbers —
every figure it prints comes from the evidence passed in — and uses no LLM.
"""

from __future__ import annotations

from app.schemas.evidence import EvidenceRecord, ShapFactor

# Human-readable phrases for each model feature. Kept in sync with
# ``prediction.FEATURE_COLUMNS``; an unknown feature falls back to a de-slugged name.
FEATURE_LABELS: dict[str, str] = {
    "current_stage": "the current stage",
    "vessel_type": "the vessel type",
    "cargo_type": "the cargo type",
    "total_elapsed_min": "total time elapsed so far",
    "time_in_current_stage_min": "time spent in the current stage",
    "last_stage_duration_min": "the duration of the last stage",
    "n_events": "the number of steps completed",
    "max_stage_index": "how far through the process the call is",
    "rework_count_so_far": "document rework so far",
    "n_reviews_so_far": "the number of authority reviews so far",
    "missing_doc_count": "the missing-document count",
    "loa": "the vessel length (LOA)",
    "draft": "the vessel draft",
    "reviewer_queue_len": "the reviewer queue length",
    "reviewers_busy": "how many reviewers are currently busy",
    "cases_awaiting_berth": "the number of calls awaiting a berth",
    "active_cases": "how many calls are active in the port",
    "weather_severity": "weather severity",
    "window_slack_min": "the time left in the service window",
    "hour_of_day": "the time of day",
    "is_night": "being on the night shift",
}


def _label(feature: str) -> str:
    return FEATURE_LABELS.get(feature, feature.replace("_", " "))


def _join(labels: list[str]) -> str:
    """Oxford-comma join: 'a', 'a and b', 'a, b and c'."""
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return f"{', '.join(labels[:-1])} and {labels[-1]}"


class TemplateExplainer:
    """Deterministic renderer. Same evidence in → same sentence out."""

    @staticmethod
    def render_risk(case_id: str, miss_probability: float, factors: list[ShapFactor]) -> str:
        pct = round(miss_probability * 100)
        raising = [_label(f.feature) for f in factors if f.direction == "increases_risk"]
        lowering = [_label(f.feature) for f in factors if f.direction == "decreases_risk"]

        if miss_probability >= 0.66:
            band = "a high"
        elif miss_probability >= 0.33:
            band = "a moderate"
        else:
            band = "a low"

        parts = [
            f"Port call {case_id} has {band} predicted risk of missing its service "
            f"window ({pct}%)."
        ]
        if raising:
            parts.append(f"Risk is driven up mainly by {_join(raising[:3])}.")
        if lowering:
            shown = lowering[:2]
            subject = _join(shown).capitalize()
            plural = len(shown) > 1
            if raising:
                parts.append(f"{subject} {'pull' if plural else 'pulls'} it back down.")
            else:
                parts.append(f"{subject} {'keep' if plural else 'keeps'} the risk low.")
        return " ".join(parts)


def build_risk_evidence(factors: list[ShapFactor]) -> EvidenceRecord:
    """The structured evidence behind a risk explanation: kind='risk', the full
    SHAP factor list, plus template-fillable summary notes (not prose)."""
    up = sum(1 for f in factors if f.direction == "increases_risk")
    down = len(factors) - up
    return EvidenceRecord(
        kind="risk",
        top_factors=factors,
        notes=[
            f"{len(factors)} SHAP drivers: {up} increasing risk, {down} decreasing it",
        ],
    )

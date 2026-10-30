from __future__ import annotations

import copy
import json
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import validate_simulator as validation  # noqa: E402


def test_forecast_is_prefix_only_even_when_future_events_are_poisoned():
    cfg = validation.generator.load_port_config("khalifa")
    generated = validation.generator.generate(cfg)
    cutoff = generated.window_end - timedelta(days=28)
    reference = validation.forecast(generated.events, cfg, cutoff, replications=3)
    changed = copy.deepcopy(generated.events)
    for event in changed:
        if event.end_ts > cutoff:
            event.attributes = {"loa": 99999, "hidden_truth": "must never be read"}
            event.activity = "POISONED FUTURE"
    assert validation.forecast(changed, cfg, cutoff, replications=3) == reference
    prefix = [e for e in generated.events if e.end_ts <= cutoff]
    assert validation.forecast(prefix, cfg, cutoff, replications=3) == reference


def test_committed_backtest_reproduces_including_failed_window():
    report = validation.evaluate()
    committed = json.loads(
        (Path(__file__).resolve().parents[2] / "DOCS/SIMULATOR_VALIDATION.json").read_text()
    )
    assert report == committed
    assert len(report["windows"]) == 8
    # Report failures as part of the denominator, never silently cherry-pick them.
    assert sum("forecast_failure" in w for w in report["windows"]) == 1
    for window in report["windows"]:
        if "forecast_failure" not in window:
            assert window["latest_input"] <= window["cutoff"]
            assert not window["failed_replications"]
            assert all(c["historical_hours"] > 0 for c in window["cases"])

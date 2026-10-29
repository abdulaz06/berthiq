"""Rebuild paired contract fixtures from the actual deterministic Khalifa pipeline.

Offline only: does not change the model artifact or read/write the database.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import generate_dataset as g  # noqa: E402
from app.schemas.risk import CaseExplanation  # noqa: E402
from app.schemas.scenarios import ScenarioSpec, SimulationRequest  # noqa: E402
from app.services.discovery import discover_process_model  # noqa: E402
from app.services.explanation import TemplateExplainer, build_risk_evidence  # noqa: E402
from app.services.ingestion import normalize, suggest_mapping  # noqa: E402
from app.services.optimization import solve  # noqa: E402
from app.services.planning import build_input  # noqa: E402
from app.services.prediction import (  # noqa: E402
    LABEL_COLUMN,
    build_dataset,
    chronological_split,
    load_default_model,
    score_case,
    score_risk_board,
)
from app.services.simulation import compare  # noqa: E402
from train_models import evaluate  # noqa: E402


def write(stem: str, value) -> None:
    body = value.model_dump(mode="json") if hasattr(value, "model_dump") else value
    text = json.dumps(body, indent=2, ensure_ascii=False) + "\n"
    for root in [BACKEND / "tests" / "fixtures", BACKEND.parent / "frontend" / "lib" / "fixtures"]:
        (root / f"{stem}.example.json").write_text(text, encoding="utf-8")


def main():
    cfg = g.load_port_config("khalifa")
    generated = g.generate(cfg)
    events, did = generated.events, str(generated.dataset_id)
    rows = [
        {
            "case_id": e.case_id,
            "activity": e.activity,
            "end_ts": e.end_ts.isoformat(),
            "start_ts": e.start_ts.isoformat() if e.start_ts else "",
            "resource_id": e.resource_id or "",
            "status": e.status or "",
            "attributes": json.dumps(e.attributes),
        }
        for e in events
    ]
    _, quality = normalize(rows, suggest_mapping(list(rows[0])), did)
    write("data_quality_report", quality)
    model = load_default_model()
    discovery = discover_process_model(events, did)
    risk = score_risk_board(model, events, did)
    spec = ScenarioSpec(
        dataset_id=did,
        name="Khalifa / five-reviewer capacity experiment",
        constraints={"reviewer_count": 5},
    )
    data = build_input(events, cfg, generated.window_end)
    opt = solve(data, cfg, spec)
    opt.run_id, opt.scenario_id, opt.runtime_ms = "1", "1", 0
    # Runtime fixture is intentionally zero: execution latency is not deterministic data.
    sim = compare(data, cfg, spec, opt, SimulationRequest(optimization_run_id="1", replications=20))
    sim.run_id, sim.scenario_id = "2", "1"
    for stem, value in [
        ("process_model", discovery),
        ("risk_board", risk),
        ("scenario_spec", spec),
        ("optimization_result", opt),
        ("simulation_result", sim),
        ("evidence_record", opt.evidence),
    ]:
        write(stem, value)
    cid = risk.cases[0].case_id
    probability, _, factors = score_case(model, events, cid)
    write(
        "case_explanation",
        CaseExplanation(
            case_id=cid,
            miss_probability=round(probability, 4),
            evidence=build_risk_evidence(factors),
            narrative=TemplateExplainer.render_risk(cid, probability, factors),
        ),
    )
    write(
        "dataset_summary",
        {
            "id": did,
            "name": generated.dataset_name,
            "source": "builtin",
            "status": "ready",
            "port_config": "khalifa",
            "event_count": len(events),
            "case_count": len(generated.cases),
            "active_case_count": len(risk.cases),
            "time_range": [generated.window_start.isoformat(), generated.window_end.isoformat()],
            "activities": generated.activities,
            "resources": generated.resources,
        },
    )
    frame = build_dataset(events)
    _, _, test = chronological_split(frame)
    metrics = evaluate(
        "committed risk-hgb-v1", test[LABEL_COLUMN].astype(int), model.predict_proba(test)
    )
    report = {
        "model": asdict(metrics),
        "test_prefixes": len(test),
        "event_count": len(events),
        "active_cases": len(risk.cases),
        "bottleneck": discovery.bottlenecks[0].activity,
        "scenario": spec.model_dump(mode="json"),
        "objective": opt.objective_value,
        "solver_status": opt.solver_status,
        "simulation": sim.model_dump(mode="json")["headline"],
        "limitations": sim.assumptions,
    }
    (BACKEND.parent / "DOCS" / "REFERENCE_EVALUATION.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(metrics.row())
    print(
        f"{opt.solver_status}; {len(opt.assignments)} assignments; objective {opt.objective_value}"
    )
    for key, pair in sim.headline.items():
        print(f"{key}: {pair[0].value:.3f} -> {pair[1].value:.3f} {pair[0].unit}")


if __name__ == "__main__":
    main()

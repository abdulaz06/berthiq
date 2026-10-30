"""Private subprocess entry point. JSON stdin/stdout; never an HTTP endpoint."""

from __future__ import annotations

import contextlib
import json
import os
import sys
import threading
from typing import Any


def main() -> None:
    payload = json.load(sys.stdin)
    # A second bound survives an abruptly killed supervisor. It affects failure
    # handling only; no wall clock enters numerical functions or successful results.
    watchdog = threading.Timer(float(payload["watchdog_seconds"]), lambda: os._exit(124))
    watchdog.daemon = True
    watchdog.start()
    # Third-party import notices must not contaminate the JSON result channel.
    with contextlib.redirect_stdout(sys.stderr):
        from app.schemas.scenarios import (
            OptimizationResult,
            ScenarioSpec,
            SimulationRequest,
            SimulationResult,
        )
        from app.services import optimization, simulation
        from app.services.jobs import restore

        data, cfg = restore(payload["snapshot"])
        spec = ScenarioSpec.model_validate(payload["spec"])
        result: OptimizationResult | SimulationResult
        response: dict[str, Any]
        try:
            if payload["kind"] == "optimization":
                result = optimization.solve(data, cfg, spec)
            elif payload["kind"] == "simulation":
                result = simulation.compare(
                    data,
                    cfg,
                    spec,
                    OptimizationResult.model_validate(payload["optimized"]),
                    SimulationRequest.model_validate(payload["request"]),
                )
            else:
                raise ValueError("Unknown computation type.")
            response = {"result": result.model_dump(mode="json")}
        except ValueError as exc:
            response = {"error": str(exc)}
    print(json.dumps(response))
    watchdog.cancel()


if __name__ == "__main__":
    main()

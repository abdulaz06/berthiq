"""A hard wall-time boundary around each CPU job, separate from numerical logic."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


class ComputeTimeout(TimeoutError):
    pass


def run_process(command: list[str], payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    env = {
        **os.environ,
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    # No shell and no database access in the child. Only trusted code, typed input.
    with subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
        cwd=Path(__file__).resolve().parents[2],
    ) as process:
        try:
            output, _ = process.communicate(json.dumps(payload), timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            process.kill()
            process.communicate()
            raise ComputeTimeout(
                "Computation exceeded its time limit. Try a smaller scenario."
            ) from exc
        if process.returncode:
            raise RuntimeError("Computation worker stopped unexpectedly.")
    response = json.loads(output)
    if "error" in response:
        raise ValueError(response["error"])
    return response["result"]


def calculate(payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    return run_process(
        [sys.executable, "-m", "app.services.compute_worker"],
        {**payload, "watchdog_seconds": timeout + 5},
        timeout,
    )

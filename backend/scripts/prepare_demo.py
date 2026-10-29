"""Idempotent demo seed: existing datasets and private scenarios are preserved."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generate_dataset import generate, load_into_db, load_port_config  # noqa: E402


def main() -> int:
    try:
        load_into_db(generate(load_port_config("khalifa")), replace=False)
    except Exception as exc:
        print(f"Demo preparation failed ({type(exc).__name__}). Check DB access and migrations.")
        return 1
    print("Built-in demo ready; existing datasets and scenarios preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

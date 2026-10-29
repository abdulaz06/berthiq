"""Fail early on mixed Python ABIs without reading or printing credentials."""

from __future__ import annotations

import importlib
import re
import sys
import sysconfig
from pathlib import Path


def main() -> int:
    if not (3, 12) <= sys.version_info[:2] < (3, 13):
        print("Use Python 3.12; never copy site-packages between Python versions.")
        return 1
    expected = f"{sys.version_info.major}{sys.version_info.minor}"
    if sys.platform == "win32":
        stale = [
            p.name
            for p in Path(sysconfig.get_path("platlib")).rglob("*.pyd")
            if (tag := re.search(r"\.cp(\d+)\-", p.name)) and tag[1] != expected
        ]
        if stale:
            print(f"Mixed compiled extensions: expected cp{expected}; found {stale[:4]}.")
            print("Environment preserved. Follow the rename-and-rebuild steps in DOCS/SETUP.md.")
            return 1
    print(f"Python {sys.version.split()[0]} · interpreter/extension ABI consistent")
    if "--runtime-only" in sys.argv:
        return 0
    try:
        for name in (
            "numpy",
            "pydantic_core",
            "psycopg2",
            "sklearn",
            "shap",
            "ortools",
            "simpy",
            "fastapi",
            "uvicorn",
            "sqlalchemy",
            "pm4py",
        ):
            importlib.import_module(name)
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from app.services.prediction import load_default_model

        load_default_model()
    except Exception as exc:
        print(f"Dependency/model check failed ({type(exc).__name__}).")
        print("Run just setup. For compiled import failures, see DOCS/SETUP.md. Files preserved.")
        return 1
    print("Native dependencies and committed model load successfully. No database changes made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

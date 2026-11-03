"""Generate THIRD_PARTY_NOTICES.md and enforce the runtime license policy.

Python: the runtime dependency closure of ``berthiq-backend`` (no dev extras),
resolved for the production target (Linux, CPython 3.12) so the output is the
same on every developer OS. Licenses come from pip-licenses; a package that is
not installable on this OS (e.g. uvloop on Windows) falls back to its PyPI
metadata at the version pinned in requirements.lock.

npm: every non-dev package in frontend/package-lock.json (all platforms).

    python scripts/third_party_notices.py          # rewrite THIRD_PARTY_NOTICES.md
    python scripts/third_party_notices.py --check  # fail on any GPL/AGPL runtime dep
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tomllib
import urllib.request
from importlib import metadata
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
OUTPUT = ROOT / "THIRD_PARTY_NOTICES.md"
PROJECT = "berthiq-backend"

# Production marker environment: the Docker image (python:3.12-slim, Linux).
TARGET = {
    "sys_platform": "linux",
    "platform_system": "Linux",
    "os_name": "posix",
    "platform_machine": "aarch64",
    "platform_python_implementation": "CPython",
    "implementation_name": "cpython",
    "python_version": "3.12",
    "python_full_version": "3.12.8",
}

# Strong copyleft. LGPL (psycopg2, libvips) is a weak copyleft and permitted.
_FORBIDDEN = re.compile(r"\bA?GPL\b|\bGNU (Affero )?General Public License", re.I)


def forbidden(license_text: str) -> bool:
    return bool(_FORBIDDEN.search(license_text.replace("LGPL", "").replace("Lesser", "")))


def _pins() -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in (BACKEND / "requirements.lock").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Za-z0-9_.\-]+)==([^\s;]+)", line)
        if m:
            pins[canonicalize_name(m.group(1))] = m.group(2)
    return pins


def _pypi(name: str, version: str) -> dict[str, object]:
    url = f"https://pypi.org/pypi/{name}/{version}/json"
    with urllib.request.urlopen(url, timeout=20) as resp:  # noqa: S310 — fixed https host
        info: dict[str, object] = json.load(resp)["info"]
    return info


def _requires(name: str, pins: dict[str, str]) -> list[str]:
    if name == PROJECT:  # the source of truth, not possibly stale installed metadata
        project = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))
        return list(project["project"]["dependencies"])
    try:
        return metadata.requires(name) or []
    except metadata.PackageNotFoundError:
        reqs = _pypi(name, pins[canonicalize_name(name)]).get("requires_dist")
        return list(reqs) if isinstance(reqs, list) else []


def runtime_closure(pins: dict[str, str]) -> list[str]:
    seen: dict[str, set[str]] = {}
    queue: list[tuple[str, set[str]]] = [(PROJECT, set())]
    while queue:
        name, extras = queue.pop()
        key = canonicalize_name(name)
        known = seen.get(key)
        if known is not None and extras <= known:
            continue
        seen[key] = (known or set()) | extras
        for raw in _requires(name, pins):
            req = Requirement(raw)
            if req.marker and not any(
                req.marker.evaluate({**TARGET, "extra": extra}) for extra in ({""} | extras)
            ):
                continue
            queue.append((req.name, set(req.extras)))
    return sorted(k for k in seen if k != canonicalize_name(PROJECT))


def python_rows() -> list[tuple[str, str, str, str]]:
    pins = _pins()
    names = runtime_closure(pins)
    out = subprocess.run(
        [sys.executable, "-m", "piplicenses", "--from=mixed", "--format=json",
         "--with-urls", "--packages", *names],
        check=True, capture_output=True, text=True,
    ).stdout
    found = {canonicalize_name(p["Name"]): p for p in json.loads(out)}
    rows = []
    for name in names:
        if name in found:
            p = found[name]
            rows.append((p["Name"], p["Version"], p["License"], p["URL"]))
            continue
        info = _pypi(name, pins[name])
        classifiers = [str(c) for c in info.get("classifiers") or []]
        license_text = str(
            info.get("license_expression")
            or next((c.split(" :: ")[-1] for c in classifiers if c.startswith("License ::")), "")
            or info.get("license")
            or "UNKNOWN"
        )
        urls = info.get("project_urls") or {}
        url = str(info.get("home_page") or next(iter(dict(urls).values()), "") or "")  # type: ignore[call-overload]
        rows.append((str(info["name"]), pins[name], license_text, url))
    return rows


def npm_rows() -> list[tuple[str, str, str, str]]:
    lock = json.loads((ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
    rows = []
    for path, pkg in lock["packages"].items():
        if not path or pkg.get("dev") or pkg.get("devOptional"):
            continue
        name = pkg.get("name") or path.rsplit("node_modules/", 1)[-1]
        rows.append((name, pkg.get("version", ""), pkg.get("license", "UNKNOWN"),
                     f"https://www.npmjs.com/package/{name}"))
    return sorted(set(rows), key=lambda r: (r[0].lower(), r[1]))


def _short(license_text: str) -> str:
    """Some packages put the whole license text in metadata; keep its first line."""
    first = license_text.strip().splitlines()[0] if license_text.strip() else "UNKNOWN"
    return first if len(first) <= 90 else first[:87] + "..."


def _table(rows: list[tuple[str, str, str, str]]) -> str:
    lines = ["| Package | Version | License | Source |", "| --- | --- | --- | --- |"]
    for name, version, lic, url in rows:
        lic = _short(lic).replace("|", "/")
        lines.append(f"| {name} | {version} | {lic} | {url} |")
    return "\n".join(lines)


def render(py: list[tuple[str, str, str, str]], js: list[tuple[str, str, str, str]]) -> str:
    return f"""# Third-party notices

BerthIQ itself is source-available with all rights reserved; see [LICENSE](LICENSE).
It is built on the open-source packages below, each under its own license. This
file is generated by `backend/scripts/third_party_notices.py` (`just notices`);
do not edit it by hand. CI fails if any runtime dependency is GPL or AGPL.

## Backend runtime (Python, production image)

{_table(py)}

## Frontend runtime (npm, non-development packages)

{_table(js)}
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="enforce policy; write nothing")
    args = parser.parse_args()
    py, js = python_rows(), npm_rows()
    bad = [f"{n} {v}: {_short(lic)}" for n, v, lic, _ in py + js if forbidden(lic)]
    if bad:
        print("GPL/AGPL runtime dependencies are not allowed:\n  " + "\n  ".join(bad))
        return 1
    if args.check:
        print(f"License policy OK: {len(py)} Python and {len(js)} npm runtime packages.")
        return 0
    OUTPUT.write_text(render(py, js), encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.name}: {len(py)} Python and {len(js)} npm runtime packages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# BerthIQ task runner — cross-platform (Windows + macOS).
# See CLAUDE.md "Commands" and docs/ARCHITECTURE.md §8.
#
# On Windows, `just` needs a POSIX shell; Git ships one. If your Git isn't at the
# default path below, override `windows-shell` for your machine (this line is
# ignored on macOS).
set windows-shell := ["C:/Program Files/Git/usr/bin/sh.exe", "-cu"]

# OS-aware paths. `just` resolves these at parse time on each machine.
venv_python := if os_family() == "windows" {
    justfile_directory() / "backend/.venv/Scripts/python.exe"
} else {
    justfile_directory() / "backend/.venv/bin/python"
}
sys_python := if os_family() == "windows" { "python" } else { "python3" }
npm_cmd := if os_family() == "windows" { "npm.cmd" } else { "npm" }
npx_cmd := if os_family() == "windows" { "npx.cmd" } else { "npx" }

# Default: list available recipes.
default:
    @just --list

# One-time setup: Python venv + backend deps + Node deps (Postgres installed separately).
setup:
    {{sys_python}} -m venv backend/.venv
    "{{venv_python}}" -m pip install --upgrade pip
    "{{venv_python}}" -m pip install -e "./backend[dev]"
    {{npm_cmd}} install
    {{npm_cmd}} install --prefix frontend
    @echo ""
    @echo "Setup done. Next: ensure Postgres is running, copy .env.example to .env,"
    @echo "then 'just migrate' (once M0-2 lands) and 'just dev'."

# npx concurrently keeps it portable — no shell backgrounding (&), which macOS
# and Windows disagree about.
#
# Run backend + frontend together with ONE command on both OSes.
dev:
    {{npx_cmd}} concurrently -k -n backend,frontend -c blue,green "\"{{venv_python}}\" -m uvicorn app.main:app --app-dir backend --reload --port 8000" "npm --prefix frontend run dev"

# Apply Alembic migrations (schema lands in M0-2).
migrate:
    cd backend && "{{venv_python}}" -m alembic upgrade head

# (Re)generate + load the deterministic built-in Khalifa dataset (M0-6).
seed:
    cd backend && "{{venv_python}}" scripts/generate_dataset.py

# Train the miss-risk model offline; writes backend/models/risk_model.joblib (M1-06).
# Reads the seeded DB by default; `just train --generate` trains from khalifa.json (no DB).
train *ARGS:
    cd backend && "{{venv_python}}" scripts/train_models.py {{ARGS}}

# Regenerate frontend/lib/types/api.ts from the backend's OpenAPI (M0-4).
# api.ts is committed and generated — never hand-edit it (a banner says so).
types:
    "{{venv_python}}" -c "import json, pathlib, sys; sys.path.insert(0, 'backend'); from app.main import app; pathlib.Path('backend/openapi.json').write_text(json.dumps(app.openapi(), indent=2))"
    cd frontend && node node_modules/openapi-typescript/bin/cli.js ../backend/openapi.json -o lib/types/api.ts
    cd frontend && node scripts/prepend-generated-banner.mjs lib/types/api.ts

# Run backend + frontend test suites.
test:
    just test-backend
    {{npm_cmd}} --prefix frontend run test

# Fail-closed database isolation, creating a dedicated test DB when needed.
test-backend *ARGS="-q":
    "{{venv_python}}" backend/scripts/test_backend.py {{ARGS}}

# Run the golden-path end-to-end test (lands in M1-15).
golden:
    @echo "golden: the Playwright golden-path E2E is built in M1-15."

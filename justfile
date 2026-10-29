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

# Preserves existing .env and venv; refuses mixed Python ABIs.
setup:
    node scripts/setup.mjs

doctor:
    node scripts/doctor.mjs

# Direct argv process spawning fixes Windows paths with spaces.
dev:
    node scripts/dev.mjs

# Apply Alembic migrations (schema lands in M0-2).
migrate:
    cd backend && "{{venv_python}}" -m alembic upgrade head

# Seed missing built-in data without deleting existing scenarios or datasets.
seed:
    cd backend && "{{venv_python}}" scripts/prepare_demo.py

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

# Against the seeded development DB; creates and cleans only its private scenarios.
# Production frontend build required. Starts/reuses backend and frontend servers.
golden:
    cd frontend && {{npm_cmd}} run golden

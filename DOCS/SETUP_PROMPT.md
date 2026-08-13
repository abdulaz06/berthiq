# SETUP_PROMPT — Abdul (Windows), one time only

This gets your **Windows** laptop ready and then scaffolds the repository (task **M0-1**). You do Part A and Part B by hand; Claude Code does Part C. Shravani does **not** run this — she runs `ONBOARDING_PROMPT.md` after the repo exists.

---

## Part A — Windows prerequisites (do these first, by hand)

Open **PowerShell** and install the toolchain (`winget` ships with Windows 11 and recent 10):

```
winget install Git.Git
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL
winget install Casey.Just
```

Notes:
- During the PostgreSQL install, **set and remember a password for the `postgres` superuser** — you'll put it in your local `.env`. Postgres installs as an auto-starting Windows service.
- **Close and reopen PowerShell** after installing so PATH updates take effect.

Confirm everything (each should print a version):
```
git --version
python --version        # 3.12.x
node --version          # 18+
just --version
psql --version          # if not found, add PostgreSQL's \bin folder to PATH
```

If `winget` isn't available: install the same tools from git-scm.com, python.org (tick "Add Python to PATH"), nodejs.org, postgresql.org, and `just` via `scoop install just` or `choco install just`.

---

## Part B — create the repo and add the docs (by hand)

1. Create an empty private GitHub repo named `berthiq` and clone it locally.
2. Put the documents I gave you in place:
   - `docs/` ← PRODUCT_DEFINITION.md, ARCHITECTURE.md, DATA_CONTRACTS.md, DATABASE.md, ROADMAP.md, BACKLOG.md, WORKFLOW.md, RECOVERY.md
   - repo root ← CLAUDE.md, ACTIVE_WORK.md, HANDOFF.md
3. Commit and push to `main`.
4. Open the repo in Claude Code and paste the Part C prompt.

(The AIS collector keeps running separately on this same laptop. It joins the repo later as `backend/scripts/collect_ais.py`; leave it alone for now.)

---

## Part C — the scaffold prompt (paste into Claude Code)

```
You are setting up the BerthIQ repository on Windows. This is task M0-1 (repo
scaffold) only — build the skeleton, not any features. The other developer works
on macOS, so ALL tooling must be cross-platform.

First read these files already in the repo and treat them as authoritative:
  CLAUDE.md
  docs/ARCHITECTURE.md   (esp. the cross-platform dev topology and repo structure)
  docs/DATA_CONTRACTS.md
  docs/DATABASE.md
  docs/BACKLOG.md        (the M0-1 acceptance criteria)
  docs/WORKFLOW.md
If any project files already exist (e.g. a port config or the collector), treat
them as authoritative and integrate around them — do NOT overwrite them.

Scaffold the structure in ARCHITECTURE.md §9, with cross-platform tooling.

Cross-platform tooling (important — Windows + macOS team):
- Use `just` as the task runner (a `justfile` at the repo root), NOT make.
  Recipes: dev, migrate, seed, types, test, golden, setup.
- The `dev` recipe must run backend and frontend together with ONE command on
  both OSes — use `npx concurrently` to run uvicorn and `next dev`. Do NOT use
  shell backgrounding (`&`), which isn't portable.
- Python is invoked via the project venv; detect the OS in the justfile for the
  venv path (Windows: backend/.venv/Scripts/python.exe; macOS: backend/.venv/bin/
  python) so recipes run on both.
- Add a .gitattributes with `* text=auto eol=lf` (mark .sh files eol=lf) so line
  endings normalize and the Windows checkout doesn't introduce CRLF churn.

Backend (Python, FastAPI):
- pyproject.toml with fastapi, uvicorn, pydantic, sqlalchemy, alembic, pytest,
  ruff, mypy. (Do NOT add pm4py / ortools / simpy / sklearn / shap yet.)
- app/main.py (FastAPI app + router registration), app/config.py (Settings;
  APP_NAME = "BerthIQ"), and empty packages app/core, app/schemas, app/api,
  app/services, app/db with __init__.py.
- One working endpoint GET /api/health -> {status:"ok", version, app_name}.
- alembic initialized (no migrations yet — that's M0-2).

Frontend (Next.js App Router + TypeScript + Tailwind):
- App Router + Tailwind configured.
- app/page.tsx fetches GET /api/health and renders it, via a small typed client
  in lib/api/ that reads NEXT_PUBLIC_USE_FIXTURES.
- Empty component folders per ARCHITECTURE.md §6 with placeholders.

Database:
- Assume a NATIVE Postgres running as a service on each machine (do NOT require
  Docker for dev). Read DATABASE_URL from .env.
- .env.example documents DATABASE_URL with a note: Windows installs have a
  postgres superuser password, macOS Homebrew usually doesn't — each developer
  sets their own local .env (gitignored).
- Also provide docker-compose.yml with ONLY a Postgres 15 service as a
  reproducibility fallback (not used in daily dev).

Repo plumbing:
- .gitignore: .env, aisstream_key.txt, ais_data/, node_modules/, __pycache__/,
  *.joblib, .next/, .venv/, and generated dataset folders.
- README.md: one-paragraph intro + quickstart (install just + Postgres, then
  `just setup`, `just dev`), with short "Windows" and "macOS" prerequisite notes.
- .github/workflows/ci.yml on ubuntu-latest running: ruff, mypy, pytest
  (backend); eslint, tsc, vitest (frontend). Call the tools DIRECTLY (do not
  depend on `just` inside CI). Add a placeholder Playwright job that loads the
  app and passes.

Verify before finishing:
- `just dev` starts the stack on Windows against the native Postgres, and the
  health page shows live status.
- `just test` passes (empty/near-empty suites are fine).
- Backend has one test asserting GET /api/health returns ok.

Then: create branch task/M0-1-scaffold, commit in logical chunks, push, confirm
CI is green, squash-merge to main, delete the branch. Update ACTIVE_WORK.md
(M0-1 -> Done; move M0-2, M0-3, M0-5, M0-7, M0-8 into Ready) and append a
HANDOFF.md entry. Do not start any other task.
```

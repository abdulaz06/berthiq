# BerthIQ

A maritime port-call operations tool. It reconstructs how port calls actually run
from event logs, predicts which active calls will miss their service window, and
recommends a solver-backed change to berth (and later reviewer) assignments —
showing the constraints, the evidence, and a simulated before/after for every
recommendation. Single application, single analyst, no login. It is a
simulation-backed workflow model on **synthetic operational data with real port
geography** — not a digital twin and not real AD Ports data.

Full context lives in [`CLAUDE.md`](CLAUDE.md) and [`DOCS/`](DOCS)
(product definition, architecture, data contracts, database, workflow, backlog).

---

## Stack

- **Backend:** FastAPI + Pydantic, SQLAlchemy + Alembic, PostgreSQL
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind
- **Task runner:** [`just`](https://github.com/casey/just) (cross-platform)
- **Tests / CI:** pytest, Vitest, Playwright, GitHub Actions

The team is cross-platform — Windows + macOS (8GB M1 Air) — so tooling is
OS-neutral and **daily development does not require Docker**. Postgres runs as a
native service; `docker-compose.yml` is a reproducibility fallback only.

---

## Prerequisites

Install these once per machine.

### Windows

- **Git for Windows** (provides the `sh` that `just` uses) — https://git-scm.com
- **just** — `winget install Casey.Just`
- **Node.js 20+** — `winget install OpenJS.NodeJS.LTS`
- **Python 3.11+** — `winget install Python.Python.3.11`
- **PostgreSQL** — `winget install PostgreSQL.PostgreSQL.16`
  (the installer sets a `postgres` superuser **password** — remember it)

### macOS

- **just** — `brew install just`
- **Node.js 20+** — `brew install node`
- **Python 3.11+** — `brew install python@3.11`
- **PostgreSQL 15** — `brew install postgresql@15 && brew services start postgresql@15`
  (Homebrew's default role is your Mac username with **no password**)

> If your Git on Windows isn't at `C:\Program Files\Git`, update the
> `set windows-shell` line at the top of the `justfile`.

---

## Quickstart

```bash
# 1. Clone and enter
git clone https://github.com/abdulaz06/berthiq.git
cd berthiq

# 2. Create the database (once). With native Postgres running:
createdb berthiq

# 3. Configure your per-machine environment
cp .env.example .env        # Windows: copy .env.example .env
#   then edit DATABASE_URL — Windows needs the postgres password,
#   macOS Homebrew usually omits the password entirely.

# 4. One-time toolchain setup (Python venv + backend deps + Node deps)
just setup

# 5. Run backend + frontend together (one command, both OSes)
just dev
```

Then open **http://localhost:3000** — the page shows the live backend health
fetched from **http://localhost:8000/api/health**. The backend's interactive API
docs are at **http://localhost:8000/docs**.

---

## Common commands

```
just setup    # one-time: venv + backend deps + node deps
just dev      # run backend + frontend together (npx concurrently)
just migrate  # apply Alembic migrations
just seed     # (re)generate + load the built-in Khalifa dataset
just types    # regenerate frontend/lib/types/api.ts from the backend OpenAPI
just test     # run backend + frontend test suites
just golden   # run the golden-path end-to-end test
```

Run `just` with no arguments to list every recipe.

---

## How we work

BerthIQ is built by two people from a **claim-based task queue**, not by
ownership. Before starting anything: read `CLAUDE.md`, check
[`ACTIVE_WORK.md`](ACTIVE_WORK.md) and the latest [`HANDOFF.md`](HANDOFF.md)
entry, claim a task, branch, build to its acceptance criteria, get CI green, and
squash-merge to `main`. The full rules are in [`DOCS/WORKFLOW.md`](DOCS/WORKFLOW.md).

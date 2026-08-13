# BerthIQ — Architecture

**Status:** Approved foundation
**Reads with:** `PRODUCT_DEFINITION.md`, `DATA_CONTRACTS.md`, `DATABASE.md`
**Audience:** both developers' Claude Code sessions, and any engineer reviewing the repo

---

## 1. Shape of the system in one paragraph

BerthIQ is a **modular monolith**: one Next.js frontend, one FastAPI backend, one PostgreSQL database. The backend contains six clearly separated service modules — ingestion, discovery, prediction, optimization, simulation, explanation — that talk to each other only through plain Python function signatures, never by reaching into each other's internals. The frontend talks to the backend only through typed REST endpoints. Model training happens **offline** in a script and produces a saved artifact the backend loads at startup; nothing heavy trains inside a request. The two slow operations (optimization, simulation) run as **background jobs** tracked in a database table that the frontend polls. There is **no authentication, no message queue, no microservices, and no runtime LLM** — every one of those was an explicit non-goal, and leaving them out is what makes this buildable by two people at an hour a day.

---

## 2. Principles that decide arguments

When a design question comes up mid-build, these are the tie-breakers, in order:

1. **Contracts before code.** Every seam between frontend and backend, and between backend modules, is a written contract in `DATA_CONTRACTS.md` with a committed example fixture. Nobody waits for someone else's implementation — they build against the fixture. This is the single most important rule; it is what makes the task queue work.
2. **Determinism.** Same dataset + same seed → identical output, every time. No wall-clock, no randomness without a seed, no network calls in the core path.
3. **Provenance is not optional.** Every number the UI shows is tagged `observed` / `predicted` / `simulated` / `optimized`. This is enforced at the type level (see §6), not by convention.
4. **The solver, model, and simulator produce the numbers. Templates phrase them.** No component invents a metric.
5. **Runs on an 8GB M1 Air.** Every infrastructure choice is measured against this. It is why Postgres is native, training is offline, and there is no Redis.
6. **Boring where it doesn't matter, sharp where it does.** Standard tools for plumbing; the interesting engineering goes into the generator, the optimizer, and the honesty layer.

---

## 3. Technology stack (final)

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| Frontend framework | **Next.js (App Router) + React + TypeScript** | File-system routing, Server Components, the modern default recruiters expect. |
| Styling | **Tailwind CSS** | Fast, no bikeshedding, consistent. |
| Process graph | **React Flow** | Purpose-built for interactive node/edge diagrams; the DFG is exactly that. |
| Berth Gantt | **Custom React + SVG component** | A Gantt (berths × time, two panels side by side) fights every charting library's assumptions. A focused SVG component is ~200 lines and gives total control over the baseline-vs-optimized layout. |
| Charts (KPIs, calibration) | **Recharts** | Simple declarative charts for the non-Gantt visuals. |
| Map | **MapLibre GL JS + OpenFreeMap tiles** | Free, no API key, no usage limits. Berth geometry from OpenStreetMap, committed as static GeoJSON. |
| Backend framework | **FastAPI + Pydantic** | Typed Python API; Pydantic models *are* the data contracts; auto-generates the OpenAPI spec that drives frontend types. |
| Process mining | **PM4Py** | Covers DFG discovery, variants, performance, conformance out of the box. |
| Prediction | **scikit-learn HistGradientBoosting** (primary), logistic regression + majority-class (baselines) | Strong on tabular prefix features; interpretable-enough; ships with sklearn so no extra native wheel. XGBoost is a drop-in swap if we want it, but sklearn keeps the 8GB install lean. |
| Explanations | **SHAP** | Ties feature attributions to the actual model. |
| Optimization | **OR-Tools CP-SAT** | Built for integer scheduling — interval variables, no-overlap, precedence. Exactly the primitives berth+reviewer scheduling needs. |
| Simulation | **SimPy** | Process-based discrete-event simulation, pure Python, deterministic with seeds. |
| Database | **PostgreSQL** | JSONB for derived artifacts, real constraints for the transactional tables. |
| ORM + migrations | **SQLAlchemy + Alembic** | Standard, versioned schema changes. |
| Background work | **FastAPI async + threadpool executor, job state in Postgres** | No Redis, no Celery. OR-Tools and numpy release the GIL during native solving, so a threadpool keeps the API responsive. Process pool is the documented upgrade if ever needed. |
| Frontend types | **openapi-typescript** generating TS types from the backend's OpenAPI spec | One source of truth (Pydantic) → generated TS types → no frontend/backend drift. |
| Tests | **pytest** (backend), **Vitest + React Testing Library** (frontend), **Playwright** (golden-path E2E) | |
| CI | **GitHub Actions** | Runs the full suite on every push; this is the "reviewer." |
| Container (reproducibility only) | **Docker Compose** | Provides Postgres + the full stack for a clean-room run. Not required for daily development. |
| Task runner | **just** (cross-platform) | `just dev/test/seed/golden`. Chosen over make because the team is Windows + macOS; the `dev` recipe uses `concurrently` to run both servers with one command on either OS. |

---

## 4. The seam that makes parallel work possible

This is the core of the whole collaboration model, so it gets its own section.

```
Pydantic schema (backend/app/schemas/*.py)   ← single source of truth
        │
        ├──► FastAPI endpoint implements it
        │
        ├──► OpenAPI spec generated (openapi.json, committed)
        │        │
        │        └──► openapi-typescript → frontend/lib/types/api.ts (committed)
        │
        └──► Example fixture (committed to BOTH
             backend/tests/fixtures/ and frontend/lib/fixtures/)
```

A concrete illustration. Suppose the risk board (frontend) and the risk model (backend) are two separate queue tasks picked up by two people on different days:

- The `CaseRisk` schema and its fixture (`case_risk.example.json`) are committed **first**, as part of defining the contract.
- Whoever builds the **risk board** imports the fixture, renders the whole board, sorts, drills in — never touching Python. Their task is "done" when it renders the fixture correctly.
- Whoever builds the **risk model** implements the endpoint to *return* that exact shape, verified by a test asserting the response matches the fixture.
- When both land, the frontend flips one flag from `useFixture` to the real fetch. It already works, because both sides were built against the same committed shape.

Neither task ever blocks the other. That is the entire point.

---

## 5. Backend module architecture

The backend has three layers. Requests flow **api → services → db**, never sideways or backward.

```
api/        thin routers: validate input, call a service, return a schema. No logic.
services/   all real logic, framework-agnostic (no FastAPI imports). Unit-testable in isolation.
db/         SQLAlchemy models + session. Services depend on this; nothing depends on services.
schemas/    Pydantic contracts. Imported by api/ and services/. The source of truth.
core/       cross-cutting pieces: EvidenceRecord, provenance types, settings.
```

The six service modules and their single responsibilities:

| Module | Owns | Key dependency | Contract it fulfils |
|---|---|---|---|
| `ingestion` | Parse CSV/XLSX, map columns, validate, persist a versioned dataset | pandas | `DatasetSummary`, `DataQualityReport` |
| `discovery` | DFG, variants, bottleneck ranking, performance metrics | PM4Py | `ProcessModel` |
| `prediction` | Prefix feature extraction, model inference, SHAP per case | sklearn, SHAP | `CaseRisk`, `CaseExplanation` |
| `optimization` | Build and solve the CP-SAT berth(+reviewer) model | OR-Tools | `OptimizationResult` + `EvidenceRecord` |
| `simulation` | Run baseline & optimized plans through SimPy, same seeds | SimPy | `SimulationResult` |
| `explanation` | Assemble `EvidenceRecord`s, render deterministic text | — | `Explanation` (via `ExplanationProvider`) |

**The explanation seam.** `ExplanationProvider` is an interface with one method, `render(evidence: EvidenceRecord) -> str`. The only v1 implementation is `TemplateExplainer`. If an LLM phrasing layer is ever wanted, it is a second implementation and zero other code changes. This is the one-class seam promised in the Pack.

**Provenance enforcement.** Services never return a bare `float` for a KPI. They return a `KpiValue { value, unit, provenance }`. The type system makes it hard to emit an untagged number, so the honesty guarantee is structural rather than a thing someone has to remember.

---

## 6. Frontend architecture

```
app/                    Next.js routes (one folder per screen)
  page.tsx              Dataset selection / dashboard
  discover/page.tsx     Process map + variants + bottlenecks
  risk/page.tsx         Risk board
  scenario/page.tsx     Scenario Studio (build → optimize → compare)
components/
  gantt/                Berth Gantt (custom SVG, baseline vs optimized)
  process-graph/        React Flow DFG
  map/                  MapLibre view
  risk-board/           Sortable active-call table
  tradeoff/             Gains-and-costs panel
  provenance/           <ProvenanceBadge/> — renders the observed/predicted/simulated/optimized tag
  evidence/             Renders an EvidenceRecord
lib/
  api/                  Typed client (one function per endpoint)
  fixtures/             Committed example responses (shared source of truth with backend tests)
  types/api.ts          Generated from OpenAPI — do not hand-edit
  provenance.ts         The provenance union type + colour mapping
```

**Rule:** any component that displays a KPI must render it through `<ProvenanceBadge>`. A raw number with no provenance tag should fail code review (and there's a lint check for it). This mirrors the backend's structural guarantee on the frontend.

---

## 7. How a Scenario Studio request actually flows

End to end, for the marquee interaction:

```
1. User sets constraints + objective weights, clicks "Optimize"
2. Frontend  POST /api/scenarios                 → { scenario_id }
3. Frontend  POST /api/scenarios/{id}/optimize   → { job_id }   (returns immediately)
4. Backend   creates jobs row (status=pending), kicks off background task
5. Background task (threadpool):
     optimization.solve(scenario)  → OptimizationResult + EvidenceRecord
     writes optimization_runs row, updates jobs row (status=succeeded)
6. Frontend  polls GET /api/jobs/{job_id} every ~1s until succeeded
7. Frontend  GET /api/optimization/{run_id}      → OptimizationResult
8. Frontend  POST /api/scenarios/{id}/simulate   → { job_id }   (baseline + optimized)
9. Same job pattern; simulation runs BOTH plans through one SimPy model, shared seed
10. Frontend GET /api/simulation/{run_id}        → SimulationResult (KPI distributions)
11. UI renders: berth Gantt (baseline | optimized), tradeoff panel, evidence,
    every KPI wrapped in a ProvenanceBadge
```

Steps 5 and 9 are the only slow parts, and they never block the API because they run in the executor with status in Postgres.

---

## 8. Local development topology (cross-platform, 8GB-aware)

The team is cross-platform — Abdul on **Windows**, Shravani on **macOS** (8GB M1 Air) — so tooling is OS-neutral, and daily development does not require Docker (Docker Desktop alone can eat ~2GB, which the 8GB Air can't spare).

```
Task runner   → just (winget/scoop/choco on Windows; brew on macOS)
Postgres      → native service on each OS (winget PostgreSQL on Windows; brew
                postgresql@15 on macOS). Same DATABASE_URL shape, per-machine .env
Backend       → native, uvicorn --reload
Frontend      → native, next dev
Concurrency   → `just dev` runs backend + frontend together via `npx concurrently`
                (portable; no shell backgrounding)
Model training → offline script, run occasionally, writes backend/models/*.joblib
Docker Compose → in the repo for a clean reproducibility run only; never required
Line endings  → .gitattributes normalizes to LF so the Windows checkout stays clean
```

Peak dev memory is Postgres + one Python process + one Node process — comfortable on 8GB. Training, the heaviest step, is decoupled: it produces `backend/models/risk_model.joblib`, which the app just loads. `just setup` (run once on each machine) installs and verifies the toolchain.

---

## 9. Repository structure

```
berthiq/
├── CLAUDE.md                    # Shared context every Claude Code session reads first
├── ACTIVE_WORK.md               # Live task-claiming board (who is on what, right now)
├── HANDOFF.md                   # Rolling session handoff log
├── README.md                    # Human-facing project intro + quickstart
├── justfile                     # just dev / test / seed / golden / setup (cross-platform)
├── .gitattributes               # normalize line endings to LF (Windows + macOS team)
├── docker-compose.yml           # Postgres + full stack, reproducibility only
├── .env.example                 # Copy to .env; documents every variable
├── .github/
│   └── workflows/
│       └── ci.yml               # Lint + typecheck + pytest + vitest + playwright on every push
├── docs/
│   ├── PRODUCT_DEFINITION.md
│   ├── ARCHITECTURE.md          # (this file)
│   ├── DATA_CONTRACTS.md
│   ├── DATABASE.md
│   ├── ROADMAP.md
│   ├── WORKFLOW.md
│   ├── BACKLOG.md
│   └── RECOVERY.md
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py              # FastAPI app + router registration
│   │   ├── config.py            # Settings; APP_NAME = "BerthIQ" lives here
│   │   ├── core/
│   │   │   ├── evidence.py      # EvidenceRecord
│   │   │   └── provenance.py    # Provenance enum, KpiValue
│   │   ├── schemas/             # Pydantic contracts (source of truth)
│   │   │   ├── events.py  dataset.py  discovery.py  prediction.py
│   │   │   ├── optimization.py  simulation.py  explanation.py  jobs.py
│   │   ├── api/                 # Thin routers
│   │   │   ├── ingestion.py  discovery.py  prediction.py
│   │   │   ├── optimization.py  simulation.py  jobs.py
│   │   ├── services/            # All logic, framework-agnostic
│   │   │   ├── ingestion/  discovery/  prediction/
│   │   │   ├── optimization/  simulation/  explanation/
│   │   └── db/
│   │       ├── session.py
│   │       ├── models.py        # SQLAlchemy ORM
│   │       └── migrations/      # Alembic versions
│   ├── scripts/
│   │   ├── generate_dataset.py  # Synthetic generator (seeded)
│   │   ├── train_models.py      # Offline training → backend/models/*.joblib
│   │   ├── validate_simulator.py# Sim-vs-ground-truth validation experiment
│   │   └── collect_ais.py       # OPTIONAL live AIS collector
│   ├── models/                  # Saved model artifacts (committed; small)
│   ├── data/
│   │   ├── ports/               # khalifa.json, zayed.json, fujairah.json
│   │   ├── geo/                 # Berth GeoJSON per port (from OSM)
│   │   └── datasets/            # Generated datasets (regenerable via seed)
│   └── tests/
│       ├── fixtures/            # Example payloads — shared shape with frontend fixtures
│       └── ...
└── frontend/
    ├── package.json
    ├── app/                     # Routes (see §6)
    ├── components/              # (see §6)
    └── lib/
        ├── api/                 # Typed client
        ├── fixtures/            # Committed example responses
        ├── types/api.ts         # Generated from OpenAPI — do not hand-edit
        └── provenance.ts
```

---

## 10. What is deliberately absent, and why it's safe

| Absent | Why it's fine |
|---|---|
| Redis / Celery | Single user, two slow ops, threadpool + Postgres job table covers it. |
| Auth / users / orgs | Single-analyst workstation. No tables, no middleware, no login screen. |
| Microservices | One user, one machine. A monolith with clean module seams generalizes later if ever needed. |
| Object storage (S3) | Datasets are ~7k events. JSONB in Postgres and files under `data/` suffice. |
| Runtime LLM | Deterministic templates over EvidenceRecords. $0 runtime cost, and the "not wrapperware" claim becomes literally true. |
| Kubernetes / cloud infra | Runs locally; `docker-compose up` is the entire "deploy." |

Each of these is a documented upgrade path, not a missing feature. That distinction is worth stating plainly in an interview: *"I scoped infrastructure to the actual problem — single user, one machine — and left clean seams for the parts that would change under real load."*

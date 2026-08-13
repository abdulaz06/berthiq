# BerthIQ — Backlog (M0 + M1)

**Status:** Approved foundation
**How this works:** this is a **queue, not an assignment sheet.** Whoever is free picks the next task whose dependencies are all merged. Nobody is the "frontend person" or "backend person." Tracks (`backend` / `frontend` / `data` / `infra`) are hints for what a task touches, not ownership.

**Task lifecycle:** pick from the *Ready* set → claim it in `ACTIVE_WORK.md` → branch `task/<id>-<slug>` → build to the acceptance criteria → write the listed tests → push → CI green → self-merge → update `ACTIVE_WORK.md` + `HANDOFF.md`. Full rules in `WORKFLOW.md`.

**A task is only "done" when:** its acceptance criteria are met, its tests exist and pass, CI is green, and it's merged to `main`. "Works on my branch" is not done.

Each backend/frontend pair that consumes a shared shape depends on that shape's **fixture** existing (from M0-3), not on the other half being built. That is what lets the two halves proceed in parallel.

---

## M0 — Foundations

### M0-1 — Repository scaffold
`infra` · Depends: none · **This is the one-time SETUP_PROMPT task (Abdul, on Windows).**
Build: the full skeleton from `ARCHITECTURE.md` §9 with **cross-platform tooling** — backend FastAPI app, frontend Next.js+Tailwind app, a `justfile` (`dev`/`test`/`seed`/`types`/`golden`/`setup`) whose `dev` recipe runs both servers via `npx concurrently` and whose Python path is OS-aware, `.gitattributes` (`* text=auto eol=lf`), `docker-compose.yml` (Postgres only, reproducibility fallback), `.env.example` (per-machine DATABASE_URL; Windows has a postgres password, macOS Homebrew usually doesn't), `.gitignore` (`.env`, `aisstream_key.txt`, `ais_data/`, `node_modules/`, `__pycache__/`, `*.joblib`, `.next/`, `.venv/`), `README.md`, `.github/workflows/ci.yml`.
Acceptance: `just dev` starts backend + frontend against a native Postgres on Windows and the health page loads; repo pushes to `main`; CI (ubuntu-latest, tools called directly) runs and is green.
Tests: CI executes `pytest` and `vitest` (empty suites pass); a smoke test asserts the backend boots.

### M0-2 — Database bootstrap
`backend` · Depends: M0-1
Build: SQLAlchemy models for the M1 core tables (`datasets`, `events`, `cases`, `jobs`) per `DATABASE.md`; the `provenance`/`job_*`/`dataset_*`/`case_outcome` enums; Alembic init + first migration; `just migrate`.
Acceptance: `just migrate` creates the schema on a clean DB; a round-trip test inserts and reads a dataset + events.
Tests: migration up/down runs clean; ORM round-trip test for each table.

### M0-3 — Contracts + fixtures (the seam)
`backend` · Depends: M0-1
Build: Pydantic schemas for the M1 contracts in `DATA_CONTRACTS.md` (`DatasetSummary`, `DataQualityReport`, `ProcessModel`, `CaseRisk`/`RiskBoard`, `ScenarioSpec`, `OptimizationResult`, `SimulationResult`, `JobStatus`, `KpiValue`, `EvidenceRecord`); a realistic example fixture per response schema, committed to **both** `backend/tests/fixtures/` and `frontend/lib/fixtures/` (identical content).
Acceptance: every fixture validates against its schema; the two fixture folders are byte-identical for shared schemas.
Tests: a parametrized test loads each fixture and validates it against its Pydantic model.

### M0-4 — Type generation + API client stub
`frontend` · Depends: M0-3
Build: `just types` → export backend OpenAPI → `openapi-typescript` → `frontend/lib/types/api.ts` (committed, header says "generated, do not edit"); a typed API client in `frontend/lib/api/` that reads `NEXT_PUBLIC_USE_FIXTURES` and returns the fixture when true.
Acceptance: `api.ts` matches the current schemas; toggling `USE_FIXTURES` swaps a fixture for a live call with no other code change.
Tests: a test imports a generated type and a fixture and asserts they're structurally compatible.

### M0-5 — Health-check vertical slice
`backend`+`frontend` · Depends: M0-1
Build: `GET /api/health` → `{status, version, app_name}`; a frontend page that fetches it and renders the result.
Acceptance: the page shows the live backend's health through the real client (not a fixture); proves the stack talks end to end.
Tests: backend unit test on `/api/health`; a Playwright test loads the page and asserts the status renders.

### M0-6 — Synthetic generator skeleton + seed
`data` · Depends: M0-2
Build: `generate_dataset.py` producing a small but *valid* Khalifa event log (case_id/activity/timestamps/resource/status + maritime attributes), seeded; `data/ports/khalifa.json` (berths with length/draft, reviewer/pilot pool sizes) and a placeholder `data/geo/khalifa.geojson`; `just seed` loads it into the DB and rebuilds `cases`.
Acceptance: `just seed` produces ≥1 built-in dataset with active + completed cases; deterministic under a fixed seed (two runs → identical rows).
Tests: seed twice, assert identical event hashes; assert every case has ordered events and a valid outcome.

### M0-7 — Provenance primitives
`backend`+`frontend` · Depends: M0-1
Build: `Provenance` enum + `KpiValue` (backend `core/provenance.py`); `EvidenceRecord` dataclass (`core/evidence.py`); `<ProvenanceBadge>` component + `provenance.ts` (union type + colour map) on the frontend.
Acceptance: a `KpiValue` cannot be constructed without a provenance tag; `<ProvenanceBadge>` renders all four states distinctly.
Tests: backend test that an untagged KPI construction fails typing/validation; a component test rendering each provenance value.

### M0-8 — CI hardening
`infra` · Depends: M0-1
Build: add `ruff` + `mypy` (backend), `tsc` + `eslint` (frontend), `pytest`, `vitest`, and a placeholder Playwright job to `ci.yml`; a lint rule/check flagging a KPI rendered without `<ProvenanceBadge>`.
Acceptance: CI runs all of the above on every push and blocks merge on failure.
Tests: CI itself is the test; include one intentionally-checked example proving the provenance lint fires.

---

## M1 — The vertical slice

### M1-01 — Generator maturation (realistic Khalifa dataset)
`data` · Depends: M0-6
Build: mature the generator to the Pack's spec — ~600 completed calls, ~7k events, ~25 active, 6 months; **causal** delays (missing docs → rework; reviewer overload → longer approval queues; vessel size → berth conflicts; weather → longer service); the 9-stage flow with the rework loop; hidden ground truth (true bottleneck, per-case delay cause, reference assignment) written as a sibling artifact, never into `events`.
Acceptance: distributions look plausible (waiting times, rework rate in a sane range); ground-truth file present and never queryable by the app; deterministic.
Tests: assert injected bottleneck is the statistically dominant one; assert ground-truth artifact is separate from the event log; seed-stability test.

### M1-02 — Ingestion service (parse + map + validate)
`backend` · Depends: M0-2, M0-3
Build: CSV/XLSX parsing, auto column-mapping suggestion, deterministic validation (missing case/timestamp = fatal; duplicates, negative durations, impossible order, unknown resource = warning); persist a versioned dataset; `POST /datasets`, `POST /datasets/builtin/{name}`, `GET/POST …/mapping`, `GET …/validation`.
Acceptance: responses match the `DatasetSummary` / `DataQualityReport` fixtures; a deliberately dirty file yields the right issues; a clean file reaches `ready`.
Tests: unit tests per validation rule; endpoint tests asserting responses match fixtures.

### M1-03 — Upload + mapping + validation UI
`frontend` · Depends: M0-4 (fixtures), M0-3
Build: dataset selection (built-ins + upload), a column-mapping confirmation screen, a data-quality report view that blocks only on fatal issues.
Acceptance: renders entirely from fixtures with `USE_FIXTURES=true`; flips to live once M1-02 merges; fatal issues block "proceed," warnings don't.
Tests: component tests from fixtures; Playwright covering select → map → validate.

### M1-04 — Discovery service (DFG + variants + bottlenecks)
`backend` · Depends: M1-01, M0-3
Build: PM4Py-based DFG (nodes/edges with median + p90 waits), ranked variants, bottleneck ranking with metrics, rework quantification; `POST …/discover` (job) + `GET /discovery/{dataset_id}`.
Acceptance: returns a `ProcessModel` matching the fixture; the flagged top bottleneck equals the injected one; <5s on the reference dataset.
Tests: unit test on a tiny hand-built log with a known DFG; assert bottleneck == ground truth; fixture-match test.

### M1-05 — Process graph + bottleneck panel UI
`frontend` · Depends: M0-4, M0-3
Build: React Flow DFG with rare-path filtering + variant selection; a bottleneck panel ranking stages with their metrics.
Acceptance: renders from the `ProcessModel` fixture; filter threshold visibly prunes edges; goes live when M1-04 merges.
Tests: component tests from fixture; interaction test for the filter.

### M1-06 — Offline training pipeline (risk model)
`data`/`backend` · Depends: M1-01
Build: `train_models.py` — leakage-safe prefix feature extraction, chronological split, majority-class + logistic baselines, HistGradientBoosting main model, metrics (PR-AUC, AUROC, Brier, calibration), SHAP wiring; writes `backend/models/risk_model.joblib` + a metrics report.
Acceptance: main model beats baselines on PR-AUC on the reference dataset; split is strictly chronological (a test proves no future leakage); artifact loads standalone.
Tests: assert no feature uses post-prediction info; assert model file loads and predicts; assert metrics computed on the held-out future window.

### M1-07 — Risk endpoint (inference + SHAP)
`backend` · Depends: M1-06, M0-3
Build: load the artifact, score active cases, per-case SHAP; `GET …/risk` (fast, synchronous) + `GET /cases/{id}/explanation`.
Acceptance: `RiskBoard` + `CaseExplanation` match fixtures; probabilities in [0,1]; explanation lists signed top factors.
Tests: endpoint tests vs fixtures; a determinism test (same input → same score).

### M1-08 — Risk board UI
`frontend` · Depends: M0-4, M0-7, M0-3
Build: sortable active-call table (probability, current stage, top factors, window), each probability shown with a `<ProvenanceBadge provenance="predicted">`; a case drill-in showing the explanation.
Acceptance: renders from fixtures; sorts by miss probability; every number carries a provenance badge; live when M1-07 merges.
Tests: component tests from fixtures; sort interaction test; a check that no KPI renders without a badge.

### M1-09 — Optimization service (c1: berth assignment)
`backend` · Depends: M1-01, M0-3
Build: OR-Tools CP-SAT model — assign vessels to compatible berths with start intervals, no-overlap, LOA/draft limits, pilot non-double-booking, release after approval+arrival; soft penalties for plan change; objective over waiting + tardiness + plan-changes; compare vs no-change/FIFO/greedy; emit `OptimizationResult` + `EvidenceRecord`; `POST /scenarios`, `POST …/optimize` (job), `GET /optimization/{run_id}`.
Acceptance: solver returns OPTIMAL/FEASIBLE within 10s (best-found on timeout); **all hard constraints provably satisfied** in the result; infeasible scenarios return the conflicting constraint set; beats FIFO on the objective.
Tests: constraint-verification test (no overlaps, all LOA/draft respected) on the solution; an intentionally infeasible scenario returns infeasibility; fixture-match test.

### M1-10 — Scenario Studio UI (build + run + recommendation)
`frontend` · Depends: M0-4, M0-7, M0-3
Build: scenario controls (constraints + the five objective weights), run button, recommendation view (assignments, changed decisions, solver status, evidence narrative), infeasibility display.
Acceptance: renders from fixtures; weights map one-to-one to `ObjectiveWeights`; shows the evidence panel; live when M1-09 merges.
Tests: component tests from fixtures; a test that an infeasible fixture shows the conflict, not a crash.

### M1-11 — Simulation service (baseline vs optimized)
`backend` · Depends: M1-09, M0-3
Build: SimPy model (arrivals, review queue, berth occupancy, pilots, weather effect); run **baseline and optimized through the same model with the same seed**; multiple replications with mean/spread; `POST …/simulate` (job) + `GET /simulation/{run_id}`; the three hero KPIs + tradeoff KPIs, tagged `simulated`.
Acceptance: `SimulationResult` matches fixture; baseline and optimized share a seed; reports distributions not single points; the honest tradeoff (overtime/imbalance) is present alongside the gains.
Tests: assert identical seed across the two runs; assert multiple replications; a determinism test.

### M1-12 — Berth Gantt + tradeoff panel UI
`frontend` · Depends: M0-4, M0-7, M0-3
Build: custom SVG berth Gantt (berths × time) rendered **baseline | optimized side by side**; a tradeoff panel showing gains and costs together; every KPI via `<ProvenanceBadge>`.
Acceptance: renders from fixtures; the two Gantts align on a shared time axis; costs shown next to gains; live when M1-11 merges.
Tests: component tests from fixtures; a snapshot test of the Gantt layout.

### M1-13 — Explanation layer (evidence → text)
`backend` · Depends: M1-07, M1-09
Build: `ExplanationProvider` interface + `TemplateExplainer` rendering `EvidenceRecord`s into sentences for recommendations and risks; wire narratives into the optimization and risk responses.
Acceptance: narratives are template-rendered from evidence only (no invented numbers); swapping the provider changes nothing else; every rendered figure traces to a field in the record.
Tests: given a fixed `EvidenceRecord`, assert exact rendered text; assert no numeric appears in text that isn't in the record.

### M1-14 — Simulator validation experiment
`data`/`backend` · Depends: M1-11
Build: `validate_simulator.py` — run the simulator on the generator's scenario and compare its KPI distributions to the recorded ground truth; produce a short report with the tolerance.
Acceptance: simulated KPI distributions match ground truth within a stated tolerance; the report states the tolerance plainly.
Tests: assert the error metric is within the documented bound on the reference dataset.

### M1-15 — Golden path (automated E2E)
`infra` · Depends: M1-02…M1-13
Build: a headless Playwright/integration test running the whole loop on the Khalifa seed: select → validate → discover → risk → scenario → optimize → simulate → compare; assert **KPI direction** and **constraint satisfaction**, not exact values; wire into CI.
Acceptance: runs headless in CI on every push; deterministic under the fixed seed; fails loudly if any stage breaks.
Tests: this task *is* the test; it must be green before M1 is declared done.

---

## Picking the first tasks

M0-1 is the single serial task (repo must exist first). After it merges, M0-2/3/5/7/8 can be worked in parallel by whoever's free. Once M0-3 lands, every M1 frontend task can start against fixtures even before its backend twin exists. `ACTIVE_WORK.md` always lists the current *Ready* set so no one has to work out dependencies by hand.

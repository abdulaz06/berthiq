# HANDOFF.md — session log

Append one entry at the end of **every** session, even if you stopped mid-task. Newest entry on top. The **Next step** line is the baton — write it so the *other* person's Claude Code could resume without guessing. This file is what makes recovery work (`docs/RECOVERY.md`).

Keep it to real signal; when it gets long, older entries can be trimmed to a one-line summary.

---

<!-- Copy this template for each entry:

## YYYY-MM-DD — <Name> — <session length>
**Task(s):** <id(s)>
**Branch:** <branch, or "main" for coordination-only>
**Did:** <what actually changed — files, endpoints, decisions>
**State:** <merged / on branch, CI green or red, what works and what doesn't yet>
**Next step:** <the single most actionable thing to do next — precise enough for the other person to start cold>
**Gotchas:** <anything surprising: a workaround, a flaky test, a decision that needs revisiting>

-->

## 2026-08-20 — Abdul — M0-6 synthetic generator + seed (M0 COMPLETE)
**Task(s):** M0-6 (Synthetic generator + seed)
**Branch:** task/M0-6-generator → squash-merged to main (branch deleted)
**Did:** Built the deterministic Khalifa generator and wired `just seed`.
- **`backend/scripts/generate_dataset.py`** — pure `generate(cfg)` producing the
  9 stages (PRODUCT_DEFINITION §5) with the stage-4→stage-2 rework loop, plus a
  CSV/ground-truth writer, a DB loader that rebuilds `cases`, and a post-seed
  distribution summary. All timing is a fn of the config `seed` + a fixed base
  date (no wall-clock). Per-case RNG = `Random(seed*1_000_003 + idx)`; content
  identity is a hash over event columns excluding the serial id.
- **Causal levers** (all in `khalifa.json`, tunable without code): missing docs →
  rework; finite reviewers on a night-shortage shift calendar → approval queue
  (the dominant bottleneck); vessel LOA/draft vs berth → contention; seeded daily
  weather → longer pilot/cargo service. Queues *emerge* from capacity.
- **Ground truth** (true bottleneck, per-case delay cause, `doc_completeness`,
  reference assignment) → `backend/data/datasets/khalifa/ground_truth.json`
  (**gitignored**). `GROUND_TRUTH_KEYS` is the forbidden-name set; a test proves
  none of them appear in `events`/`cases`/`datasets.stats` or the CSV.
- **`khalifa.json`** (committed): 8 berths (KCT/KBT/KGT with LOA/draft/terminal),
  reviewer pool + day/night shifts, pilots, planners, vessel mix, weather, levers,
  seed=20260601. **`khalifa.geojson`** placeholder committed.
- **Fixed `backend/alembic.ini`** logging handler `args=(sys_stderr,)` →
  `(sys.stderr,)`. `just migrate` was broken for anyone (the migration test uses a
  programmatic Config that skips `fileConfig`, so it never caught it).
- **Tests** (`backend/tests/test_generator.py`, 12): determinism (content hash +
  ground truth + stable dataset id), ordered events + valid outcomes, ground-truth
  separation (pure + DB), reviewer-bottleneck dominance, target volumes, idempotent
  byte-identical DB reseed.
**Numbers (seed=20260601):** 6539 events, 624 cases → **26 active / 598 completed**,
**36% rework**, **39% late**. Dominant bottleneck **Authority review /
reviewer_overload** by total caused delay: reviewer 314k min vs missing_docs 204k
vs berth 55k vs weather 6k (≈1.5–1.7× the runner-up); reviewer is also the #1
per-case cause and #1 among late-only cases. Events are ~6.5k (target "~7k"): I
kept completed anchored at ~600 rather than inflating case counts to hit a round
number — bump `targets.completed_cases` if you want it nearer 7k.
**State:** Merged to main; branch CI was GREEN (backend/frontend/e2e). Verified
locally: `just migrate` + real `just seed` against local `berthiq` load 6539
events/624 cases; full suite 38 passed against `berthiq_test`; ruff + mypy clean.
`main` is green and runnable.
**Next step:** M1 is open. Start **M1-04 (Discovery service)** or **M1-06
(training)** or **M1-09 (optimizer)** against the seeded dataset — or do the light
**M1-01** validation pass (dirty/stress variants + distribution checks vs the
Pack). For discovery/eval, read the answer key from
`backend/data/datasets/khalifa/ground_truth.json` (regenerate with `just seed`);
`true_bottleneck.stage` == "Authority review".
**Gotchas:**
- **Never run pytest against your seed DB.** The `session` fixture drops tables
  via `Base.metadata`, desyncing `alembic_version`; `test_migrations` then fails
  `DROP TABLE jobs`. Use `DATABASE_URL=...:5432/berthiq_test pytest`. Repair a
  polluted seed DB with `alembic stamp base && alembic upgrade head && just seed`.
- `data/datasets/` is gitignored, so `events.csv` + `ground_truth.json` are
  regenerable, never committed — the seed in the config is the source of truth.
- Anchorage wait (stage 8) is largely a *symptom* of approval lag (short travel
  makes approval gate berthing), so raw stage-wait would flag anchorage; the
  ground truth attributes the *cause* to reviewer_overload. M1-04's bottleneck
  ranking should reflect controllable cause, not just raw wait.
- `gh` still not installed; watched CI via the git-credential token + GitHub API.

## 2026-08-18 — Abdul — M0-4 type generation + typed API client
**Task(s):** M0-4 (Type generation + API client)
**Branch:** task/M0-4-typegen → squash-merged to main (branch deleted)
**Did:** Resolved the M0-3 open question and wired the generated-types seam.
- **Stub routes** — `backend/app/api/contract_stubs.py`: a scaffolding router
  (mounted under `/api` in `main.py`) with GET/POST stubs for the §5 endpoints,
  each returning **501**, whose `response_model`/request-body references publish
  all M1 contracts into OpenAPI. Result: `app.openapi()` now exposes **26**
  component schemas (was ~2). `_not_implemented()` is typed `NoReturn` so mypy
  accepts the declared response models. Clearly marked "delete the stub when the
  real route lands."
- **`just types`** now runs a third step, `prepend-generated-banner.mjs`, adding a
  "GENERATED FILE — DO NOT EDIT BY HAND" banner (openapi-typescript emits none).
- **`frontend/lib/types/api.ts`** regenerated — full `paths` + 26 `components`
  schemas, 960+ lines (was an empty `Record<string, never>` placeholder).
  Committed; `backend/openapi.json` stays gitignored (intermediate).
- **`frontend/lib/api/contracts.ts`** — typed accessors `getDataset`,
  `getValidation`, `getDiscovery`, `getRisk`, `getOptimization`, `getSimulation`,
  `getJob`. Return types come from the generated `components["schemas"][…]`. Each
  returns the committed fixture when `NEXT_PUBLIC_USE_FIXTURES==="true"`, else
  `apiGet` to the backend — one flag flips every call, no other change.
- **`contracts.test.ts`** — per-fixture structural-compatibility check. Uses a
  `Widen<T>` mapped type so benign JSON widening (`"builtin"`→`string`,
  `[string,string]`→`string[]`) is tolerated while a *real* missing/wrong-shaped
  field still fails `tsc`. Plus flag-behavior tests (fixtures mode returns the
  fixture without touching `fetch`; live mode calls the right URL via a mock).
**State:** Merged to main. Branch CI fully green (backend ruff/mypy/pytest,
frontend eslint/tsc/vitest — now **10** tests — + provenance, e2e). Local verified:
stub `GET /api/jobs/abc` → 501, `GET /api/health` → 200, backend 21 passed/6
DB-skips; `just types` regenerates cleanly end-to-end on Windows.
**Next step:** **M0-6 (Synthetic generator skeleton + seed)** is the LAST M0 task
— `backend/scripts/generate_dataset.py` producing a small valid seeded Khalifa
event log, `data/ports/khalifa.json` + placeholder `data/geo/khalifa.geojson`,
and `just seed` loading it + rebuilding `cases` (deterministic under a fixed seed;
two runs → identical rows). Depends on M0-2 (done). After M0-6, M0 is complete.
**Gotchas:**
- CI does NOT regenerate `api.ts` — it type-checks the committed one. So after any
  schema change you MUST run `just types` and commit the result, or the generated
  types silently drift from the backend. (A CI "regenerate + git diff --exit-code"
  guard would catch this; not built — candidate for a future infra task.)
- `just types` needs the backend importable (venv) AND node/npx. The stub routes
  are what make the output non-empty; if you delete a stub before its real route
  exists, that contract drops out of `api.ts`.
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe` (not on PATH).

## 2026-08-18 — Abdul — M0-7 provenance primitives (+ M0-5 closed)
**Task(s):** M0-7 (Provenance primitives); also marked M0-5 Done (no build).
**Branch:** task/M0-7-provenance → squash-merged to main (branch deleted)
**Did:**
- **M0-5 closed without a build** — the health-check vertical slice was already
  satisfied by the M0-1 scaffold (live `/api/health` page rendering end-to-end
  through the real client). Recorded in ACTIVE_WORK Done; nothing rebuilt.
- **M0-7 = frontend half only.** The backend half of the backlog item already
  exists and was reused, not duplicated: `Provenance` enum in
  `backend/app/core/provenance.py` and the `KpiValue` Pydantic schema (required
  `provenance` field → can't construct untagged) from M0-2/M0-3. Built:
  - `frontend/lib/provenance.ts`: `Provenance` union (observed/predicted/
    simulated/optimized, mirroring the backend enum), `PROVENANCE_STYLES`
    colour+label+tooltip map (four far-apart hues: slate/amber/sky/emerald),
    `isProvenance` guard.
  - `frontend/components/provenance/ProvenanceBadge.tsx`: the pill — distinct
    colour + label + tooltip per state, `data-provenance` hook. Pure component
    (no "use client" needed).
  - `ProvenanceBadge.test.tsx`: renders all four states distinctly.
  - `frontend/vitest.config.ts`: added the `@/*` alias (vitest doesn't read
    tsconfig `paths`) and `esbuild.jsx: "automatic"` so `.tsx` component tests
    transform without importing React. **This unblocks all future M1 component
    tests that use `@/…` imports or JSX.**
**State:** Merged to main. Branch CI fully green (backend, frontend incl. the new
badge tests + provenance lint, e2e). Local: frontend tsc/eslint/vitest (7 tests)
+ provenance scan green; backend still green (21 passed, 6 DB-skips). The M0-8
provenance lint passes against the real badge — the GOOD fixture (KpiValue +
`<ProvenanceBadge>`) points at this real component and passes; BAD is still flagged.
**Next step:** Only **M0-4 (Type generation + API client stub)** and **M0-6
(Synthetic generator skeleton + seed)** remain to finish M0. M0-4 is the natural
next pick — it wires `just types` (backend OpenAPI → `openapi-typescript` →
`frontend/lib/types/api.ts`) and the fixture-returning typed client. **Watch-out
for M0-4:** the M0-3 contract schemas are NOT in the OpenAPI output yet (no route
references them), so decide there whether to add thin stub routes / `response_model`
refs so the types actually emit, or sequence type-gen to fill in as M1 endpoints
land. The GOOD/BAD provenance fixtures import `@/lib/types/api` — once M0-4
generates that file, those imports resolve for real.
**Gotchas:**
- If a future KPI component renders a `KpiValue` without `<ProvenanceBadge>`, the
  CI `provenance check` step fails — that's intended. Import the badge from
  `@/components/provenance/ProvenanceBadge`.
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe` (not on PATH).

## 2026-08-18 — Abdul — M0-8 CI hardening
**Task(s):** M0-8 (CI hardening)
**Branch:** task/M0-8-ci-hardening → squash-merged to main (branch deleted)
**Did:** Hardened `.github/workflows/ci.yml` and added the provenance lint.
- **Job timeouts:** `timeout-minutes` on every job (backend 15, frontend 10,
  e2e 15) + an 8-min **step** timeout on the Playwright install. This directly
  fixes the M0-3 incident where that step hung 26 min (GitHub's default job
  timeout is 6 h). A wedged step now fails fast.
- **Playwright cache:** e2e caches `~/.cache/ms-playwright` keyed on the resolved
  Playwright version (`actions/cache@v4`). First run per version downloads
  Chromium and populates the cache; later runs restore in seconds. (Cache scope:
  a cache saved on a feature branch is NOT visible to `main`, so the first run on
  `main` after this merge is still a miss — the hit shows up on the next main run.)
- **Provenance lint (CLAUDE.md rule #3):** `frontend/scripts/check-provenance.mjs`
  flags any `*.tsx` that references `KpiValue` but never renders `<ProvenanceBadge>`
  (comments are stripped first, so a mention in a comment doesn't count). Wired as
  `npm run check:provenance` — a step in the frontend job scanning the real app
  (`app/`, `components/`) — plus a vitest **proof** (`check-provenance.test.mjs`)
  that the rule fires on a BAD fixture and passes a GOOD one. Fixtures live under
  `frontend/scripts/__fixtures__/` (outside tsconfig `include` and Next's lint
  dirs, so tsc/eslint ignore them); vitest picks up `scripts/**/*.test.mjs` via an
  added include glob.
- Frontend job renamed to `frontend (eslint · tsc · vitest · provenance)`.
**State:** Merged to main. Branch CI fully green — all three jobs pass, including
the new provenance step and the cached e2e. Local: backend `21 passed, 6 skipped`
+ ruff/mypy clean; frontend eslint/tsc/vitest(4 tests incl. the provenance proof)
+ real provenance scan all green. All six required checks (ruff, mypy, pytest,
eslint, tsc, vitest — plus provenance) run on every push.
**Next step:** Pick the next open M0 task — **M0-4 (Type generation + API client
stub)** or **M0-7 (Provenance primitives)** are the highest-leverage. If you take
M0-7, build `<ProvenanceBadge>` + `provenance.ts` against the four values in
`backend/app/core/provenance.py`; once a real KPI component exists, the CI
provenance lint will require the badge — the GOOD/BAD fixtures under
`frontend/scripts/__fixtures__/` show the exact shape the rule expects.
**Gotchas:**
- "Blocks merge on failure" is enforced by process (WORKFLOW.md: never merge
  red), not by branch-protection rules — I did **not** enable required-status-check
  branch protection, because the team pushes docs/ACTIVE_WORK/HANDOFF *directly*
  to main and a strict rule would block those. If you ever want a hard gate, add
  branch protection that requires the `backend`/`frontend`/`e2e` checks but keep
  direct-to-main allowances in mind.
- The provenance rule is intentionally conservative (keys off the `KpiValue` type
  name). Tighten it to track real JSX when KPI components land if false
  positives/negatives show up.
- `gh` still lives at `C:\Program Files\GitHub CLI\gh.exe` (not on PATH).

## 2026-08-18 — Abdul — M0-3 contracts + fixtures
**Task(s):** M0-3 (Contracts + fixtures — the seam)
**Branch:** task/M0-3-contracts → squash-merged to main (branch deleted)
**Did:** Implemented the M1 contract schemas from `docs/DATA_CONTRACTS.md` and the
committed example fixtures that let the two halves build in parallel.
- `backend/app/core/provenance.py`: the **canonical** `Provenance` enum (single
  source of truth). Refactored M0-2's `app/db/models.py` to import it from here
  instead of defining its own — same four values, DB enum name unchanged, **no
  migration change** needed.
- `backend/app/schemas/`: split by domain — `common.py` (`KpiValue`), `evidence.py`
  (`EvidenceRecord`, `ShapFactor`, `ConstraintRef`), `datasets.py`
  (`DatasetSummary`, `ValidationIssue`, `DataQualityReport`), `discovery.py`
  (`ProcessModel` + `DfgNode`/`DfgEdge`/`Variant`/`Bottleneck`), `risk.py`
  (`CaseRisk`, `RiskBoard`), `scenarios.py` (`ScenarioSpec`, `ScenarioConstraints`,
  `ObjectiveWeights`, `Assignment`, `OptimizationResult`, `KpiDistribution`,
  `SimulationResult`), `jobs.py` (`JobStatus`). `__init__.py` re-exports all.
  `KpiValue.provenance` (and `KpiDistribution`) use the `Provenance` enum.
- **10 fixtures** committed byte-identically to `backend/tests/fixtures/` and
  `frontend/lib/fixtures/`: kpi_value, evidence_record, dataset_summary,
  data_quality_report, process_model, risk_board, scenario_spec,
  optimization_result, simulation_result, job_status. Realistic Khalifa data —
  berths KCT-1..5, vessels (MSC Shristi, CMA CGM Jaguar, MV Ghantoot, …), +04:00
  timestamps, the 9-stage flow with the documentation→customs rework loop.
- `backend/tests/test_fixtures.py`: parametrized — every fixture validates against
  its Pydantic model, and each backend fixture is byte-identical to its frontend
  copy.
**State:** Merged to main. Branch CI fully green (backend ruff/mypy/pytest,
frontend eslint/tsc/vitest, e2e). Local: backend `21 passed, 6 skipped` (the 6 are
the M0-2 DB tests skipping with no local DB), frontend typecheck/lint/vitest all
pass. Verified with `gh run watch --exit-status` (now that gh is installed — but
it's NOT on PATH; it lives at `C:\Program Files\GitHub CLI\gh.exe`, call by full
path).
**Next step:** Pick **M0-4 (Type generation + API client stub)** — now unblocked by
M0-3. It runs `just types` (export backend OpenAPI → `openapi-typescript` →
`frontend/lib/types/api.ts`) and adds a typed client in `frontend/lib/api/` that
returns the fixture when `NEXT_PUBLIC_USE_FIXTURES=true`. **Important:** the M0-3
schemas are NOT yet in the OpenAPI output because no API route references them
(only `/api/health` is wired), so `just types` today won't emit the contract
types. M0-4 either (a) adds thin stub routes/`response_model=` refs so the schemas
surface in OpenAPI, or (b) is sequenced to fill in as M1 endpoints land — decide
this at the start of M0-4. Alternatively M0-7 (Provenance primitives, frontend
half) is a clean parallel pick.
**Gotchas:**
- `gh` is installed but not on the Bash/PowerShell PATH → use
  `"/c/Program Files/GitHub CLI/gh.exe"`. Auth is fine (account abdulaz06).
- Fixtures must stay byte-identical across the two folders — `test_fixtures.py`
  enforces it. If you edit a fixture, edit the backend copy and re-copy to
  frontend (or vice versa) in the same change, or that test fails.
- Provenance now has ONE home: `core/provenance.py`. Don't reintroduce a second
  enum in M0-7 — import/align with it (see the ACTIVE_WORK note).

## 2026-08-18 — Abdul — M0-2 database bootstrap
**Task(s):** M0-2 (Database bootstrap)
**Branch:** task/M0-2-db-bootstrap → squash-merged to main (branch deleted)
**Did:** Built the DB layer for the four M1 core tables per `docs/DATABASE.md`.
- `backend/app/db/base.py`: `Base(DeclarativeBase)` + constraint naming convention.
- `backend/app/db/models.py`: the six enum types (`dataset_source`,
  `dataset_status`, `case_outcome`, `provenance`, `job_type`, `job_status`;
  `sim_run_type` deferred to the sim tables) as str-Enums, and ORM models
  `Dataset`, `Event`, `Case`, `Job` — real core columns + JSONB `attributes`,
  FK `ON DELETE CASCADE`, indexes matching the doc. `provenance` is created now
  even though no M0-2 table uses it (kpis/contracts depend on it later).
- `backend/app/db/session.py`: `engine` + `SessionLocal` + `get_db` dependency.
- `migrations/versions/0001_core_tables.py`: hand-written first migration —
  creates all six enums explicitly (so the unused `provenance` type lands), then
  the tables/indexes; downgrade drops tables then enums. `env.py` now points
  `target_metadata` at `Base.metadata`.
- Tests: `test_migrations.py` (upgrade→downgrade leaves a clean schema, asserts
  tables + enum types appear/disappear), `test_models_roundtrip.py` (ORM
  round-trip per table + server-default checks + unique constraint + cascade
  delete). `conftest.py` provides a session engine that **skips** the DB suite
  when no Postgres is reachable.
- CI: added a `postgres:16` service + `DATABASE_URL` env to the backend job so
  the DB tests run for real in CI.
**State:** Merged to main. Branch CI was fully green — backend/frontend/e2e all
pass, and the backend `pytest` step reported **7 passed** against the CI Postgres
(DB tests executed, not skipped; the `duplicate key ... uq_cases_dataset_case`
line in the log is the intentional unique-constraint test). Verified locally:
ruff + mypy clean, `alembic heads/history` load the revision, health test passes,
DB tests skip cleanly with no local DB. `just migrate` will apply this migration
against any `DATABASE_URL`. NOTE: I did **not** run the DB tests against a live DB
locally (no local pg password on hand) — CI is the live-DB verification.
**Next step:** Pick the next Ready M0 task. Highest-leverage is **M0-3 (Contracts
+ fixtures)** — it's the seam that unblocks every M1 frontend task and M0-4. When
building M0-3's `KpiValue`/`provenance` shapes, align with the DB-level
`Provenance` enum already defined in `backend/app/db/models.py` (values:
observed/predicted/simulated/optimized) rather than introducing a second one —
same caveat applies to M0-7's `core/provenance.py`. **M0-6 (generator + seed) is
now unblocked** too (depends on M0-2) if someone wants the data track moving.
**Gotchas:**
- DB tests read `DATABASE_URL` (same var Alembic uses) — see the expanded
  "DB tests" note in `ACTIVE_WORK.md`. On macOS: `createdb berthiq_test` then
  `DATABASE_URL=postgresql+psycopg2://<mac-user>@localhost:5432/berthiq_test just test`.
- The migration creates enums with `create_type=False` + explicit `.create()`,
  so **offline** `alembic upgrade --sql` won't work (checkfirst needs a live
  connection). Run migrations online (the normal path); that's what `just
  migrate` and CI do.
- `jobs.scenario_id` is a plain `BIGINT` (no FK) for now — the `scenarios` table
  doesn't exist yet. Add the FK when that table lands (later milestone).

## 2026-08-12 — Abdul — scaffold session
**Task(s):** M0-1 (repository scaffold)
**Branch:** task/M0-1-scaffold → squash-merged to main (branch deleted)
**Did:** Built the full cross-platform skeleton per ARCHITECTURE.md §9.
- Tooling: `justfile` (dev/setup/migrate/seed/types/test/golden), OS-aware venv
  path, Git `sh` as `windows-shell`; `dev` runs both servers via `npx
  concurrently`. `.gitattributes` (LF), `.gitignore`, `.env.example`, root
  `package.json` (hosts concurrently), `docker-compose.yml` (Postgres 15 only).
- Backend: FastAPI app, `config.py` (APP_NAME=BerthIQ), `GET /api/health` with
  CORS for :3000; empty core/schemas/api/services/db packages; alembic
  initialized (NO migrations yet); pyproject with ruff/mypy/pytest; health test.
- Frontend: Next.js 15 App Router + TS + Tailwind; `app/page.tsx` renders live
  `/api/health` through a typed client reading `NEXT_PUBLIC_USE_FIXTURES`;
  fixture + `lib/types/api.ts` placeholder; empty component folders per §6;
  vitest (1 passing test) + Playwright smoke E2E.
- CI: `.github/workflows/ci.yml` — backend (ruff/mypy/pytest), frontend
  (eslint/tsc/vitest), e2e (Playwright), tools called directly.
**State:** Merged to main. CI on the branch was GREEN (all 3 jobs). Verified
locally on Windows: backend+frontend both boot via the running servers and the
health page shows live "Online" (status=ok, app=BerthIQ, version=0.1.0). All
lint/type/test suites pass. `main` is green and runnable.
**Next step:** Shravani runs `DOCS/ONBOARDING_PROMPT.md` on macOS to `just setup`
+ `just dev` and confirm the health page loads. In parallel, any Ready M0 task
(M0-2 DB bootstrap, M0-3 contracts+fixtures, M0-5 health slice tests, M0-7
provenance primitives, M0-8 CI hardening) can be claimed — all depend only on
the scaffold, which now exists.
**Gotchas:**
- `just` on Windows needs a POSIX shell; `windows-shell` is pinned to Git's
  `sh.exe`. Update that one line if Git lives elsewhere on a given machine.
- `next-env.d.ts` is committed (not gitignored) so CI's standalone `tsc` is
  deterministic; Next may rewrite it locally.
- This box has Postgres 16, not 15 — fine; the compose fallback still pins 15.
  `just seed`/`just migrate` are placeholders until M0-6/M0-2 land.
- `gh` isn't installed here; CI status was read via the GitHub API using the
  stored git credential.

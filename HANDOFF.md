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

## 2026-08-25 — Abdul — M1-07 risk endpoint (inference + SHAP)
**Task(s):** M1-07 (risk endpoint — serve predictions).
**Branch:** task/M1-07-risk-endpoint → squash-merged to main (PR #3, branch deleted).
**Did:** Two inference-only endpoints over the committed model (DATA_CONTRACTS §5.3),
reusing the M1-06 seams — no training in the request path.
- **`backend/app/api/risk.py`** — `GET /api/datasets/{id}/risk` → RiskBoard (one
  CaseRisk per *active* case: miss_probability, current_stage, vessel_type,
  service_window_end, top-4 signed SHAP factors); `GET
  /api/cases/{case_id}/explanation?dataset_id=…` → CaseExplanation (miss_probability
  + EvidenceRecord kind='risk' with the top-8 SHAP factors + a narrative). Both fast
  + synchronous. 404 for unknown/dataset-mismatch and for non-active (completed) cases.
- **`backend/app/services/prediction.py`** (extended) — inference helpers:
  `load_default_model()` (lru_cached load of the committed artifact),
  `_active_case_rows()` (latest prefix per case that never berthed),
  `score_risk_board()`, `score_case()`, and `_top_factors()` (SHAP → signed
  ShapFactor; positive SHAP = increases_risk). Added `service_window_end` as a meta
  column for display.
- **`backend/app/services/explanation.py`** — `TemplateExplainer.render_risk()`:
  deterministic, template-only narrative from the evidence numbers (a FEATURE_LABELS
  map + risk band + Oxford-comma join), and `build_risk_evidence()`. No LLM, invents
  no numbers (CLAUDE.md rule #4).
- **Contract:** added the `CaseExplanation` Pydantic schema (was referenced in §5.3
  but never built) + a committed `case_explanation.example.json` (backend+frontend,
  byte-identical; registered in `test_fixtures.py`). Removed the `/risk` stub;
  regenerated `frontend/lib/types/api.ts` (adds CaseExplanation + both routes).
**Decision — committed the model artifact (as instructed).** Un-ignored the single
file `backend/models/risk_model.joblib` (`!backend/models/risk_model.joblib` after
the broad `*.joblib` ignore); `*.joblib binary` in `.gitattributes` keeps it from
LF-mangling. It's small and deterministic (seed 20260601), so a committed copy and a
fresh `just train` agree — CI and serving just `RiskModel.load()` it, no train step.
`just train` still regenerates it.
**Fix that made the committed artifact viable — timezone normalization.** psycopg2
returns `timestamptz` in the DB *session* timezone, which differs by machine (UTC in
CI, UTC-06:00 on this box) — so `hour_of_day`/`is_night`/window features (and thus
the model + its scores) depended on where you ran it. `prediction._normalize` now
converts every timestamp to the port wall clock (`PORT_TZ = +04:00`, Khalifa). After
this, `just train` from the DB and from `--generate` produce **identical** metrics
(PR-AUC 0.8777), and the committed artifact scores consistently on CI. If a later
task adds multi-port support, take `PORT_TZ` from the port config instead of the
constant.
**Provenance note (rule #3 vs the frozen contract).** §5.3 types `miss_probability`
and `predicted_remaining_min` as bare floats, and the committed `risk_board` fixture
matches — so I did **not** wrap them in `KpiValue`. They're model outputs =
`predicted` provenance; the RiskBoard's `model_version` is the anchor and M1-08's UI
badges them as predicted. `predicted_remaining_min` is `None` (no remaining-time
regressor yet — a §14 SHOULD).
**State:** Merged to main; PR #3 CI fully GREEN (backend 60 passed incl. the
artifact-load + determinism + no-retrain tests **on CI's Linux/UTC**, which is the
real proof the committed binary + tz-normalization work cross-platform; frontend;
e2e). Local: ruff + mypy clean; full suite 60 passed vs `berthiq_test`; frontend
tsc/eslint/vitest(10)/provenance green; live smoke through the real endpoints against
the seeded `berthiq` DB returns 26 active cases scored (probs 0.28–0.99) + narratives.
`main` green and runnable.
**Next step:** **M1-08 (risk board UI)** is unblocked — build against
`risk_board.example.json` + `case_explanation.example.json`, then flip
`NEXT_PUBLIC_USE_FIXTURES=false` to hit the two live routes. Add a
`getCaseExplanation` accessor to `frontend/lib/api/contracts.ts`. Badge
`miss_probability` as `predicted`. (Or take **M1-09 optimizer** on the backend.)
**Gotchas:**
- The committed `risk_board.example.json` is still the old illustrative example
  (stage "Documentation Review", feature "documentation_returns"); the real endpoint
  returns actual stage names + real feature names (`current_stage`, `reviewers_busy`,
  `window_slack_min`, …). M1-07 only needed *shape* match (holds). Recommend M1-08
  refresh both fixtures from live output — keep the two copies byte-identical
  (`test_fixtures.py` enforces).
- The endpoint scores only **active** cases (never reached "Berthed, cargo start").
  `GET …/explanation` 404s for completed cases by design.
- `load_default_model()` is `lru_cache`d — the artifact is read once per process. If
  you retrain and want a running server to pick it up, restart it (or clear the cache).
- If `backend/models/risk_model.joblib` is ever missing, the risk endpoints 500 on
  first call — run `just train`. It's committed, so a clean checkout has it.
- shap still emits 3 harmless matplotlib PendingDeprecationWarnings on import.

## 2026-08-24 — Abdul — M1-06 offline training pipeline (miss-risk model)
**Task(s):** M1-06 (offline risk-model training).
**Branch:** task/M1-06-training → squash-merged to main (PR #2, branch deleted).
**Did:** The leakage-safe, prefix-based miss-risk classifier (PRODUCT_DEFINITION §14).
- **`backend/app/services/prediction.py`** — the *reusable* half (M1-07 will import
  it). `build_dataset(events)` emits one row per case-prefix (state at each
  completed event, excluding the terminal berthing — mirroring how an active case
  is scored). Features: case-trajectory (stage, elapsed, time-in-stage, rework/
  review counts, missing docs, LOA/draft, vessel/cargo type, window slack, weather,
  hour/night) + **cross-case system state** (reviewers_busy, reviewer_queue_len,
  cases_awaiting_berth, active_cases). `chronological_split` splits by *case* along
  the anchor timeline (all prefixes of a case share a split). `RiskModel` =
  HistGradientBoosting (native categoricals via ordinal codes) + SHAP TreeExplainer;
  `save`/`load` a standalone joblib artifact.
- **Leakage discipline.** A feature at prediction time `t` uses only info
  observable by `t`. The system-state features are half-open interval counters over
  event *times ≤ t* (e.g. reviewer queue = passed completeness-checks by t minus
  reviews started by t), so **deleting every event that starts after t leaves every
  feature unchanged** — asserted directly by the leakage test. Forbidden target-
  derived names (outcome, actual_berthing, final rework_count, service_window_end)
  are barred from FEATURE_COLUMNS by another test.
- **`backend/scripts/train_models.py`** (`just train`; `--generate` for no-DB) —
  builds the dataset, splits train/val/test in time, trains majority + logistic
  baselines and the HGB main model (**refit on train+val**, hyperparameters chosen
  on val), reports PR-AUC/AUROC/Brier + a calibration curve on the held-out FUTURE
  window, prints top SHAP, and writes `backend/models/risk_model.joblib`.
- **Deps:** scikit-learn (pinned `>=1.9,<1.10` so CI reproduces the margin), shap,
  joblib, numpy, pandas. `*.joblib` already gitignored — the artifact is
  regenerable, never committed.
**Numbers (seed 20260601, 60/20/20 chrono split, test n=1121):** HGB **PR-AUC
0.878** > logistic 0.862 > majority 0.330; AUROC 0.915 vs 0.909; Brier 0.103.
Calibration curve tracks closely (0.02→0.01 … 0.93→0.95). Top SHAP:
`current_stage`, `reviewers_busy`, `reviewer_queue_len`, `hour_of_day`, LOA — i.e.
reviewer overload + the night shift dominate, consistent with the M1-04 bottleneck.
**Key decisions:**
- **No post-hoc calibration.** Isotonic collapsed the HGB scores into ~17 tied
  levels and dropped PR-AUC 0.81→0.69; the raw HGB is already well-calibrated
  (Brier 0.10). So the model is used directly and the calibration *curve* is
  reported as a diagnostic. (Calibration is a SHOULD, not a MUST.)
- **HGB regularized hard** (max_depth 3, min_samples_leaf 40, lr 0.03, l2 3, 400
  iters, no early-stopping). The chronological test window is distribution-shifted
  (base rate drops from 46%→33%); an over-flexible HGB overfits the training period
  and *loses* to plain logistic. Shallow + regularized + refit-on-train+val gives a
  stable ~+0.015 PR-AUC win. Config lives in `HGB_PARAMS`.
- **Dropped `reviewer_load`** (= reviewers_busy / pool_size): the pool size is a
  global-log quantity → the leakage test caught it changing when future events were
  removed. It was perfectly collinear with `reviewers_busy` (constant pool), so no
  info lost.
**State:** Merged to main; PR #2 CI fully GREEN (backend 51 passed incl. the
baseline-beating + leakage tests on CI's Linux/sklearn, frontend, e2e). Local: ruff
+ mypy clean; full suite 51 passed against `berthiq_test`; `just train` /
`--generate` both produce the report + artifact. `main` green and runnable.
**Next step:** **M1-07 (risk endpoint + SHAP)** is unblocked. Load the artifact via
`RiskModel.load(backend/models/risk_model.joblib)`, score active cases with
`build_dataset(events, include_active=True)` (take the latest prefix per active
case), map SHAP → `ShapFactor` for `CaseRisk.top_factors`. Serve `GET
/api/datasets/{id}/risk` (RiskBoard) and `GET /api/cases/{cid}/explanation`
(CaseExplanation — that schema isn't built yet; it's in DATA_CONTRACTS §5.3). Delete
the `/risk` stub + `just types`. **Decide the model-artifact story for CI/inference:**
it's gitignored/regenerable, so either run `just train` in the risk endpoint's
setup/CI, or train-and-cache on first request; the endpoint can't assume a committed
`.joblib`.
**Gotchas:**
- Tests run on the generator's in-memory log (`g.generate(...).events`) — no seeded
  DB needed, and they honor the "never pytest against berthiq" rule automatically.
- shap imports matplotlib and builds a font cache on first import (one-time, a few
  seconds in CI) and emits 3 harmless PendingDeprecationWarnings — not errors.
- The `predicted_remaining_min` field on `CaseRisk` (a SHOULD in §14) has no model
  yet — M1-07 can leave it `None` or add a per-stage-median regressor later.
- `just train` reads the DB by default; use `just train --generate` on a machine
  without the seed loaded.

## 2026-08-24 — Abdul — M1-04 discovery service (DFG + variants + bottlenecks)
**Task(s):** M1-04. Also closed **M1-01** as *absorbed into M0-6* (generator
already delivers its scope; residual work is `khalifa.json` tuning, not a rebuild).
**Branch:** task/M1-04-discovery → squash-merged to main (PR #1, branch deleted).
**Did:** A PM4Py-based synchronous discovery service over the seeded event log.
- **`backend/app/services/discovery.py`** — pure `discover_process_model(events,
  dataset_id) -> ProcessModel`. PM4Py gives the DFG edge set + frequencies and the
  trace variants; **all timing is computed from the real timestamps** (node median
  duration; edge median/p90 wait = `max(0, next.start - prev.end)`; variant totals).
  Determinism: PM4Py is fed a log whose timestamp is synthesized strictly-increasing
  in **`seq`** order, so instant stages sharing a real timestamp can't reorder — its
  topology is identical to seq-order. Also has DB helpers `run_discovery` /
  `get_saved_process_model`.
- **Bottleneck ranking is causal, not raw wait.** Stages are ranked by
  *controllable delay* = total inbound queue wait + rework redo service. This puts
  **Authority review** (reviewer overload, 4,443h total queue) at #1, ahead of the
  anchorage *symptom* (525k min of passive duration but only 35k queue) — exactly
  the trap the M0-6 handoff warned about. Each bottleneck is tagged one of
  `resource_load` / `rework_rate` / `median_wait` with a KpiValue + EvidenceRecord
  notes. The reviewer queue I compute from timestamps (266,577 min) cross-checks the
  generator's injected `review_wait_min` sum (266,578) to the minute.
- **Endpoints** (`backend/app/api/discovery.py`, mounted in `main.py`): `POST
  /api/datasets/{id}/discover` (computes, caches, records an *already-succeeded*
  discovery job, returns that JobStatus) and `GET /api/discovery/{dataset_id}`
  (returns the cached ProcessModel; 404 if not discovered). Deleted the GET
  /discovery stub from `contract_stubs.py`; regenerated `frontend/lib/types/api.ts`.
- **DB:** new `process_models` table (docs/DATABASE.md §5.1) — ORM `ProcessModelRow`
  + migration `0002_process_models` (JSONB dfg/variants/bottlenecks/metrics, UNIQUE
  on dataset_id so re-discovery replaces).
- **Dependency:** added `pm4py>=2.7,<3` to `backend/pyproject.toml`. It pulls
  pandas/numpy/scipy/matplotlib (~40MB wheels) — fine on 8GB, installs via
  `pip install -e ".[dev]"`. **pm4py is AGPL v3** ("commercial use requires
  open-sourcing"): acceptable for this internal, non-distributed single-analyst
  tool, but revisit if BerthIQ is ever shipped. Noted in pyproject + the service
  docstring.
- **Tests** (`backend/tests/test_discovery.py`, 6): tiny hand-built log with exact
  nodes/edges/waits (incl. a rework back-edge); **top bottleneck == "Authority
  review"** run over the generator's own in-memory log (no DB needed) with a <5s
  assert and a ground-truth cross-check; all-KPIs-provenance-tagged; fixture-shape
  validation; DB persistence round-trip; API endpoint flow (404 → discover → get).
**Decision — synchronous for M1 (deliberate simplification of the DATA_CONTRACTS
job envelope).** Discovery is <2s, so `POST …/discover` runs inline instead of
spawning a worker; it still returns a `JobStatus{status:"succeeded",
result_type:"process_model"}` so the frontend poll loop works unchanged (sees
succeeded immediately, then GETs). The real async job/worker/polling machinery is
deferred to **M1-09 (optimization)**, where operations are genuinely slow. `GET
/api/jobs/{id}` therefore stays a 501 stub for now (nothing needs to poll it yet).
**Numbers (seed=20260601):** 9 nodes, 10 edges (incl. the two rework back-edges),
22 variants (happy path count 381). Metrics: throughput 23.3/wk, rework 35.6%,
avg_utilization 23.0% (all `observed`). Discovery ~1.7s on the reference dataset.
**State:** Merged to main; PR #1 CI fully GREEN (backend 44 passed, frontend
eslint/tsc/vitest/provenance, e2e). Verified locally: ruff + mypy clean; full suite
44 passed against `berthiq_test`; frontend tsc/eslint/vitest(10)/provenance green;
live smoke test through the real endpoints against the seeded `berthiq` DB returns
Authority review as #1. Applied migration 0002 to the local `berthiq` seed DB.
`main` is green and runnable.
**Next step:** **M1-05 (process graph + bottleneck panel UI)** is now live-able —
build against `frontend/lib/fixtures/process_model.example.json`, then flip
`NEXT_PUBLIC_USE_FIXTURES=false` to hit `GET /api/discovery/{id}`. Or take **M1-06
(training)** / **M1-09 (optimizer)** on the backend.
**Gotchas:**
- **The committed `process_model` fixture is now out of step with reality** — it
  shows rank-1 rework on "Documentation Review" + rank-2 "Anchorage Wait" (old
  illustrative names/story), but the real endpoint returns **Authority review**
  (`resource_load`) at #1 with the actual 9 Khalifa stage names. I left it as the
  *shape* contract (M1-04 only needed shape-match, which holds). Recommend M1-05
  regenerate it from live discovery so the UI demo matches the golden path — keep
  the backend + frontend copies byte-identical (`test_fixtures.py` enforces).
- The seeded-bottleneck test runs the **pure generator in-memory** (`generate(cfg)`
  → `discover_process_model`), so it needs no seeded DB and runs in CI's empty
  `berthiq_test`. Don't rewrite it to query a seeded DB.
- Edge waits are clamped at 0: the generator lets a vessel physically arrive before
  its berth frees (the "Berth assigned → anchorage" edge would otherwise read a
  negative median wait). Anchorage's real cost lives in its *node duration*, not its
  inbound edge wait — which is why raw-wait ranking would mis-flag it and the causal
  ranking doesn't.
- pm4py prints an AGPL banner to stdout on import; it's imported lazily inside the
  service so it doesn't fire at app import or in the type-gen step.
- `gh` now works (v2.97, at `C:\Program Files\GitHub CLI\gh.exe`, not on PATH).
  `gh run watch <id> --exit-status` + `gh pr merge --squash --delete-branch`.

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

# ACTIVE_WORK.md — live board

The single source of truth for **who is doing what right now.** Update this the moment you claim or release a task. It may be committed directly to `main` (see `docs/WORKFLOW.md` §3).

How to use it: pick the top task from **Ready to pick up** whose dependencies are all in **Done** → move it to **In progress** with your name, branch, and date → when merged, move it to **Done** and pull the next task(s) into **Ready**.

---

## In progress

- [M1-07] Risk endpoint (inference + SHAP) — Abdul — branch task/M1-07-risk-endpoint — started 2026-08-25

<!-- format:
- [M1-09] berth optimizer — Abdul — branch task/M1-09-berth-optimizer — started 2026-08-14
-->

---

## Blocked

_None._

<!-- format:
- [M1-11] simulation — blocked on M1-09 (needs the optimizer's assignments)
-->

---

## Ready to pick up

**M0 is COMPLETE.** M1 (the vertical slice) is now open. **M1-01 (Generator
maturation) is absorbed into M0-6** (see Done) — the deterministic generator with
causal levers, ~600+~26 cases/~6.5k events, hidden ground truth, and the
seed-stability + reviewer-bottleneck-dominance assertions all shipped in M0-6. Any
residual M1-01 work is *distribution tuning* (confirm vs the Pack, optional
dirty/stress variants) — a `khalifa.json`-only follow-up, not a rebuild, and it
does **not** block the M1 backend tasks. Those depend on M0-6, which is done.

- [M1-05] Process graph + bottleneck panel UI — **now live-able** (M1-04 merged).
  Build against `frontend/lib/fixtures/process_model.example.json`, then flip
  `NEXT_PUBLIC_USE_FIXTURES=false` to hit the real `GET /api/discovery/{id}`.
  ⚠️ The committed fixture still tells the *old* story (rank-1 rework on
  "Documentation Review", rank-2 "Anchorage Wait") — the real endpoint returns
  **Authority review** (resource_load) as #1. Consider regenerating the fixture
  from live discovery output so the UI demo matches the golden path (small task;
  keep both fixture copies byte-identical — `test_fixtures.py` enforces it).
- [M1-07] Risk endpoint (inference + SHAP) — **now unblocked** (M1-06 merged).
  Reuse `app/services/prediction.py`: `RiskModel.load(backend/models/risk_model.joblib)`
  + `build_dataset(events, include_active=True)` to score active cases, and
  `RiskModel.shap_values` for per-case `ShapFactor`s. Serve `GET
  /api/datasets/{id}/risk` (RiskBoard) + `GET /api/cases/{cid}/explanation`
  (CaseExplanation — add that schema; it's referenced in DATA_CONTRACTS §5.3 but
  not yet a Pydantic model). Delete the `/risk` stub + `just types`. Note the
  artifact is gitignored/regenerable — decide whether M1-07/CI runs `just train`
  or ships a committed model (currently must run `just train` first).
- [M1-09] Optimization service (berth assignment) — depends on M0-6 (done), M0-3

All M1 *frontend* prerequisites now exist: the M0-3 fixtures, the M0-7
`<ProvenanceBadge>`, and the M0-4 typed client (`frontend/lib/api/contracts.ts`,
generated `lib/types/api.ts`). M1 frontend tasks (M1-03/05/08/10/12) can be built
against fixtures now; flip `NEXT_PUBLIC_USE_FIXTURES=false` once each backend twin
lands.

Heads-up for M1 backend tasks: real endpoints live behind **stub routes** in
`backend/app/api/contract_stubs.py` (each returns 501). When you implement a real
route at one of those paths (e.g. `GET /api/discovery/{id}`), delete its stub from
that file in the same change, then run `just types` to refresh `api.ts`.

Note on provenance: the canonical `Provenance` enum lives in
`backend/app/core/provenance.py` (values: observed/predicted/simulated/optimized).
M0-2's DB model and M0-3's `KpiValue` schema both import it. **M0-7 should build
`<ProvenanceBadge>` + `provenance.ts` against these same four values and reuse the
existing `core/provenance.py`, not create a second definition.** The CI provenance
lint (`frontend/scripts/check-provenance.mjs`) will flag any `*.tsx` that uses
`KpiValue` without rendering `<ProvenanceBadge>`, so M0-7's badge is what makes
future KPI components pass that check.

---

## Done

- [M1-06] Offline training pipeline (risk model) — Abdul — merged 2026-08-24
  (PR #2). Leakage-safe prefix features + chronological split; majority + logistic
  baselines vs a HistGradientBoosting main model. HGB PR-AUC **0.878** > logistic
  0.862 > majority 0.330 on the held-out future window; AUROC 0.915, Brier 0.103.
  Reviewer-overload signals (reviewers_busy, reviewer_queue_len, hour_of_day) top
  the SHAP ranking, matching M1-04. `just train` writes
  `backend/models/risk_model.joblib` (gitignored). Reusable
  `app/services/prediction.py` (feature extraction + `RiskModel`) for M1-07. 51
  backend tests green.
- [M1-04] Discovery service (DFG + variants + bottlenecks) — Abdul — merged
  2026-08-24 (PR #1). PM4Py-based DFG (edge freqs + variants) with timing from
  real timestamps; bottleneck ranking by controllable delay (queue wait + rework
  redo) → independently rediscovers **Authority review** as the #1 bottleneck
  (matches ground truth, <5s). Synchronous `POST …/discover` + `GET
  /discovery/{id}`; new `process_models` table (migration 0002). 44 backend tests
  green.
- [M1-01] Generator maturation — **absorbed into M0-6** — closed 2026-08-24. M0-6
  delivered the generator's substantive scope (9-stage causal-lever generator,
  hidden ground truth, seed-stability + reviewer-bottleneck-dominance tests). Any
  remaining work is `khalifa.json` distribution tuning, not a rebuild, and blocks
  nothing. Reopen as a small tuning task only if the Pack demands different
  distributions.
- [M0-6] Synthetic generator + seed — Abdul — merged 2026-08-20 (deterministic
  9-stage Khalifa generator with rework loop + causal levers; ~600 completed /
  ~26 active / ~6.5k events; hidden ground truth in gitignored sibling artifact;
  reviewer overload is the dominant bottleneck; `just seed` loads it. Also fixed
  `alembic.ini` so `just migrate` works.) **M0 COMPLETE.**
- [M0-4] Type generation + API client — Abdul — merged 2026-08-18 (generated
  api.ts + typed fixtures-or-live client; stub routes publish the contracts)
- [M0-7] Provenance primitives — Abdul — merged 2026-08-18 (frontend badge +
  lib/provenance.ts; backend enum/KpiValue already existed from M0-2/M0-3)
- [M0-5] Health-check vertical slice — satisfied by the M0-1 scaffold (live
  /api/health page rendering end-to-end through the real client); no separate
  build needed — closed 2026-08-18
- [M0-8] CI hardening — Abdul — merged 2026-08-18
- [M0-3] Contracts + fixtures — Abdul — merged 2026-08-18
- [M0-2] Database bootstrap — Abdul — merged 2026-08-18
- [M0-1] Repository scaffold — Abdul — merged 2026-08-12

---

## Notes / decisions in flight

- **`just` on Windows needs a POSIX shell.** The `justfile` sets
  `windows-shell` to Git's bundled `sh.exe` (`C:\Program Files\Git\usr\bin\sh.exe`).
  If a Windows machine has Git elsewhere, update that one line.
- **`next-env.d.ts` is committed** (not gitignored) so CI's standalone `tsc`
  is deterministic. Next may rewrite it locally — commit the change if it does.
- **Frontend env:** non-secret dev defaults live in committed
  `frontend/.env.development` (`NEXT_PUBLIC_USE_FIXTURES=false`,
  `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`); secrets/overrides go in
  gitignored `.env` / `.env.local`.
- **Postgres:** this machine has PostgreSQL **16** (docs assumed 15). The
  `docker-compose.yml` fallback pins 15; native 16 works fine for dev.
- **Seed vs. test DB (M0-6):** `just seed` and `just migrate` target the DB in
  your `.env` `DATABASE_URL` (e.g. `berthiq`). Do **not** point `pytest` at that
  same DB: the `session` fixture drops/recreates tables via `Base.metadata`,
  which desyncs Alembic's `alembic_version` and makes `test_migrations` fail
  (`DROP TABLE jobs` on missing tables). Run tests against a throwaway DB, e.g.
  `DATABASE_URL=...:5432/berthiq_test pytest`. CI already does this. If you ever
  seed and then test against the same DB by accident, repair with
  `alembic stamp base && alembic upgrade head && just seed`.
- **Generator lever balance (M0-6):** tuned so **Authority review /
  reviewer_overload is the dominant bottleneck** by total caused delay (~1.7× the
  runner-up) — the golden-path story (§18). Key levers in `khalifa.json`: 2 day /
  1 night reviewers, 230-min mean review; 12-h vessel travel so approval gates
  berthing; short (7-h) berth occupancy so berth conflict doesn't swamp reviewer.
  ~36% rework, ~39% late. Re-tune via `khalifa.json` (no code change) and re-check
  with the post-seed distribution summary if you touch it.
- **DB tests (M0-2 onward):** they need a real Postgres and read the connection
  from `DATABASE_URL` — the *same* source Alembic's env.py uses, so tests and
  migrations always target the same DB. Point them at a throwaway DB, e.g.
  `createdb berthiq_test` then run with
  `DATABASE_URL=postgresql+psycopg2://<user>[:<pw>]@localhost:5432/berthiq_test`.
  If no DB is reachable the DB tests **skip** (not fail), so `just test` stays
  green on a machine without Postgres configured. **CI runs them for real** via a
  `postgres:16` service in the backend job (see `.github/workflows/ci.yml`); a
  green backend job with the DB tests *skipped* would be a false green, so if you
  touch that job, keep the service + `DATABASE_URL` env.

# Codex portfolio launch sprint

Active since 2026-10-28 (America/Chicago). Current branch: `codex/decision-engine`.
User brief: full BerthIQ takeover, functional decision loop, premium maritime
desktop/mobile console, public-demo readiness. Historical scope deferrals no
longer apply. Do not mark a feature complete without executable evidence.

## Verified takeover

- Base `2d47250`; merged PRs #1 discovery, #2 training, #3 inference inspected.
- Existing PM4Py discovery, leakage-safe HGB training, SHAP inference, deterministic
  generator, PostgreSQL schema, and provenance components are real implementations.
- Ingestion, scenarios, optimization, simulation and job lookup were 501 stubs.
- Frontend was a health screen; visualization folders contain README placeholders.
- Reference config has 8 synthetic berths; geographic points explicitly approximate.
- Model artifact exists and is committed; historical PR-AUC 0.8777 must be reproduced.
- PostgreSQL 16/18 services, Python venv, Node, just, and authenticated gh available.
- Initial user change: deletion of `.env.example`. Preserve; do not stage it.
- Critical audit finding: original pytest fixtures dropped tables at DATABASE_URL,
  which defaults to the development DB. Fix safety before running the suite.

## Milestones

| Area | Verified state |
| --- | --- |
| A: instructions, branch, audit | Complete; PR #4 merged after all CI checks passed |
| B: ingestion and validation | CSV/XLSX, mapping, validation, immutable persistence; tested |
| B: optimizer, simulation, evidence | Joint reviewer/berth CP-SAT + matched SimPy; tested; historical simulator validation remains |
| B: scenarios, jobs, exports, map API | Durable jobs/results, snapshots, session scope, quotas, TTL, export, replay API; tested |
| C: design system, landing, navigation | Missing at takeover |
| D: map, selection, event playback | Missing at takeover |
| E: process, risk, studio, comparisons | Missing at takeover |
| F: integrated E2E, CI, hosting, assets | Missing at takeover |

## Architecture decisions

Preserve the modular monolith, model and event semantics. No Redis/Celery. Keep
heavy Python work on persistent hosting. A Sites Worker is unsuitable for this
backend; the existing Next.js/PostgreSQL stack remains the implementation target.
Use explicit bounded jobs and persist result/evidence payloads in PostgreSQL.

## Test evidence

- Baseline: 60 backend tests passed on `berthiq_launch_test`, zero skips (76.87s).
- Frontend: eslint, TypeScript, 10 Vitest tests and provenance lint passed.
- Safe runner `backend/scripts/test_backend.py` derives/creates a dedicated test DB;
  fixtures reject any URL without explicit matching TEST_DATABASE_URL and `_test` name.
- Run backend type checks from `backend/` so pyproject configuration is loaded.
  A root-directory mypy invocation incorrectly omitted the existing configuration.

## Current implementation work

2026-10-29: backend decision-engine milestone implemented. CSV/XLSX parsing has
5 MiB/50k-row bounds, zipped workbook expansion checks, mapping, fatal/warning
validation, private immutable versions. Public uploads default off. CP-SAT handles
berth type/length/draft, arrivals, approvals, reviewer shifts and caps, pilot
capacity, closures, observed commitments, locks, priorities, all five objective
terms, and FIFO/greedy/no-change baselines. Returned schedules are independently
checked. UNKNOWN is distinct from INFEASIBLE. Parallel review is explicitly
rejected, never silently accepted. SimPy uses matched per-case random streams,
review queues/rework, pilots, berth occupancy and weather-adjusted service. Reports
distributions and staffing/overtime/imbalance costs. Current dataset is already
late at cutoff: no claim that every KPI improves.

Scenarios snapshot configuration and observable inputs, expire after 24h, and use
unguessable UUID session tokens. Two worker slots; per-IP write limits, per-session
and global row quotas; restart recovery; private JSON export/reset. Run one backend
process (no multiprocess job recovery). Contract stubs removed. API operations data
and readiness endpoint implemented. `just types` repaired for Windows npx/WSL issue.

80 backend tests pass on disposable PostgreSQL, zero skips; Ruff and mypy pass.
Frontend generated types and 10 existing unit tests pass. `refresh_fixtures.py`
rebuilds paired fixtures from real service outputs; fixture runtime is zero by
convention. Existing HGB artifact untouched. Verified stored-model held-out metrics:
PR-AUC 0.8777, AUROC 0.9154, Brier 0.1030. Reference 20-replication simulation:
62.874h → 45.067h waiting; 0% → 0% compliance; 0 → 0 conflicts. More staffed reviewer
hours are a real cost. Exact evaluation in `REFERENCE_EVALUATION.json`.

The generator's active Case summaries contain post-cutoff attributes; new decision
services must derive state solely from observed event prefixes. Existing prediction
already follows that boundary. Preserve model/generator until a deliberate revision.

## Git workflow

User authorizes automatic milestone commits, pushes, PR creation, CI repair,
squash merge after green CI and deletion of merged branches. Do not merge incomplete
milestones. Initial safety checkpoint uses `codex/berthiq-launch-sprint`; subsequent
milestones may use separate `codex/` branches. Preserve the initial `.env.example`
deletion outside our commits. Primary visual references are the two supplied MarineX
images (dark immersive maps, polished panels, dedicated mobile composition).

## Known gaps / external dependencies

No verified public deployment. Hosting credentials may be needed after repository
work is complete. No map geometry has been independently verified yet. No browser
or responsive inspection completed yet. PM4Py distribution licensing needs an
accurate source disclosure for the public deployment (historical comment assumed
an internal-only application).

## Exact next action

Push the decision-engine milestone, create/monitor its PR, fix any CI failures and
merge when green. Continue frontend implementation on the next branch: build dark
design system, real API state and desktop/mobile console, map and playback, then
all analysis/scenario screens. npm install of maplibre-gl/@xyflow/react/lucide-react
is in progress (frontend package changes belong to that next milestone).

Remaining backend launch work: simulator historical-ground-truth validation
experiment, stronger hostile-upload coverage, stale-job timeout recovery, production
dependency lock/startup/seed configuration, full browser golden path. No visual
verification or deployment has occurred yet. Read-only Caravan reference clone:
Windows temp `berthiq-caravan-reference`; source inspected for tokens, landing,
case study, navigation and safe-area/motion patterns; never modify it.

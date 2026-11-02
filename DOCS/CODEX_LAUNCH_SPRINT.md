# Codex portfolio launch sprint

Active since 2026-10-28 (America/Chicago). Non-blocked implementation and acceptance
completed November 2, 2026. Final milestone: [PR #11](https://github.com/abdulaz06/berthiq/pull/11)
from `codex/portfolio-finish`; GitHub records its final merge and main CI status.
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
| B: optimizer, simulation, evidence | Joint reviewer/berth CP-SAT + matched SimPy; historical backtest and limitations merged in #10 |
| B: scenarios, jobs, exports, map API | Durable jobs/results, snapshots, session scope, quotas, TTL, export, replay API; tested |
| C: design system, landing, navigation | Public landing, case study, guided demo and responsive maritime console merged in #8 |
| D: map, selection, event playback | MapLibre, OSM basemap/fallback, vessel/berth selection, prefix-safe replay, mobile detail sheet |
| E: process, risk, studio, comparisons | Complete real journey merged in #7; tested against PostgreSQL |
| F: integrated E2E, CI, hosting, assets | Nine real browser tests including accessibility; refreshed screenshots and deployment instructions; no public hosting authorized |

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

Public deployment is explicitly prohibited for this sprint. Licensing remains
pending by the user's decision: PM4Py licensing and the absence of a project
license block public launch; no contributor consent is assumed. Deployment
configuration is prepared, but live URLs, host-specific limits and backup restore
cannot be accepted without an authorized environment. Operational berth coordinates
remain approximate; geography uses attributed OpenFreeMap/OSM. Historical timing
intervals are not calibrated forecasts. See LAUNCH_ACCEPTANCE.md for the final
evidence matrix and clearly separated research and hosting limitations.

## Frontend milestone — 2026-10-29

PR #5 merged after all GitHub checks passed, main `2983ea4`. Preserved all
interrupted frontend package and console changes, and the unrelated `.env.example`
deletion. Console now calls real operations and risk APIs: datasets, vessel/berth
selection, observed event feed, latest-prefix risk and SHAP explanations, replay
clock and speeds, focused presentation mode, mobile navigation and detail sheet.
MapLibre uses version-matched same-origin worker and an attributed OpenFreeMap
OSM basemap, with a bounded-time local schematic fallback. Operational coordinates
and motion remain simulated/approximate. Risk stays explicitly fixed during replay.
Next updated to patched 15.5.28; production build added to CI.

Evidence: production build, lint/type checks, 12 unit tests, provenance check pass.
Three live Playwright tests pass against PostgreSQL-backed API + production frontend:
1920x1080 map/render/selection/playback, tile failure fallback, and 390x844 navigation/risk/detail sheet.
Screenshots inspected in DOCS/media. This is the initial console milestone, not
full launch acceptance. Full golden path will be added with Scenario Studio.
Remaining npm audit findings (mainly dev tooling) still require triage.

## Decision workspace — merged

PR #7 merged with every CI check green, including the new real PostgreSQL/API golden path (`7ace264`); PRs #4–7 are complete.
Current branch preserves the Scenario Studio, React Flow discovery explorer,
berth Gantt, comparison map, distribution charts and session API implementation.
Full real browser journey passed in its first run (five tests): desktop port,
offline map fallback, mobile risk, discovery → feasible optimization → 20 matched
simulations → private export → saved-result reload, and mobile infeasible lock.
16 frontend unit tests pass; production build passes. Final visual/semantics
refinements and rerun are in progress, before committing this milestone.

The deterministic FIFO solver baseline uses candidate staffing. The stochastic
no-change baseline retains original staffing; these must never share a misleading
label. Comparison now toggles between deterministic plans and replication-one
simulated schedules. Distribution charts show p10–p90 variability, not confidence
intervals. Staffing costs, zero compliance and unchanged conflicts remain visible.
CI now provisions isolated PostgreSQL, migrates and seeds, runs the real API and
production frontend, and executes the integrated browser suite. `just golden`
uses this same suite and creates/cleans only its own private demo session.

## Public entry and data workspace — verified locally

Dark maritime public landing with actual console imagery, guided in-console
walkthrough, engineering case study linked to the committed evaluation, app icon
and Open Graph image. Dataset workspace reads server capabilities, lists/validates
versions, uploads private CSV/XLSX, previews/corrects mappings and separates fatal
errors from warnings. Console requests now carry the private session token; uploaded
logs are identified separately from built-in synthetic data. Uploads remain off by
default; enabled only for isolated CI and local upload verification.

Evidence: 83 backend tests passed, zero skips; Ruff and mypy pass. 17 frontend
unit tests and provenance check pass; production build passes. Seven real browser
tests pass, adding public desktop/mobile entry, guided navigation, validation,
private CSV upload/mapping/use, denied anonymous access and fatal timestamp handling.
1920x1080 and 390x844 screenshots inspected in DOCS/media. Final metadata check and
milestone commit/CI are next. Existing `.env.example` deletion remains unstaged.

## Production runtime and dependency security — merged (#9)

PR #8 verified green and squash-merged as `bd2c6b1`. Preserved the user's local
configuration, repaired Python 3.12 venv and unrelated `.env.example` deletion.
Updated Next/React, Vitest/Vite, ESLint, FastAPI/Starlette and pytest; npm audit and
pip-audit report zero known dependency vulnerabilities. Universal Python lock and
Node 24/Python 3.12 runtime declarations added. Pinned scikit-learn 1.9.0 to match
the committed artifact (no retraining). Flat ESLint and OXC JSX config migrated.

Direct-argv Node launcher replaces nested-shell concurrently commands. `just dev`
started both servers on Windows; API readiness, homepage and console returned 200.
Ctrl+C stopped the owned servers (Git shell reports interrupt as exit 512).
Doctor checks mixed extension ABIs, native imports and model loading. Setup keeps
existing venv/configuration and refuses mixed ABIs; repair steps preserve a backup.
`just seed` now inserts only if missing, preserving scenario/dataset history.
Production preflight requires explicit DB/HTTPS origins, migration head, seeded
data and loadable model. Release/start/setup guidance is in SETUP.md/DEPLOYMENT.md.

Initial upgrade regression: 83 backend tests, 17 frontend tests, lint, typecheck,
provenance, production build and seven PostgreSQL-backed browser tests passed.
Desktop console and mobile simulation screenshots inspected: layout preserved;
mobile SVG labels remain a refinement candidate. Added release/idempotent-seed
tests: 87 backend tests now pass with no skips; Ruff/mypy and pip check pass. Final browser rerun and CI remain before merging this milestone.

## Historical validation and reliability — merged (#10)

PR #9 merged with all six CI checks green as `01990f6`. The interrupted work was
preserved on `codex/validation-resilience`; `.env.example` deletion stays excluded.

Eight-cutoff historical backtest is reproducible from the frozen generator.
Seven windows (22 call/cutoff observations) produce forecasts; one fails because
KHL-0487's historical KBT-1 assignment violates the current terminal policy.
No constraints were weakened and neither the generator nor model was replaced.
Timing MAE ranges 0.02–9.30h; p10–p90 coverage varies 0–100% on tiny samples.
Investigation traces underestimation to simplified rework and overestimation to
unobservable in-flight review. These are conditional simulation ranges, not
calibrated arrival forecasts. Full per-case data and limitations are recorded in
SIMULATOR_VALIDATION.json/.md; tests poison future events and reproduce the report.

Optimization/simulation now execute in bounded subprocesses with a 90s default
hard timeout, sanitized failures, cleanup-before-slot-release and an independent
child watchdog. Recovery preserves completed jobs and fails interrupted ones.
Upload parsing rejects oversized/expanded ZIPs, forged worksheet dimensions,
XML entities, malformed CSV, NULs, non-finite JSON and excessive nesting. Request
body reception has a 15s deadline. Added process timeout/crash, capacity recovery,
restart, slow-body, parser and historical evaluation regression tests.

README rewritten with architecture diagram, feature walkthrough, actual screenshots,
setup, model/decision evidence and deployment limitations. Case study reflects the
backtest. Mobile distribution labels enlarged after inspecting the 390x844 render.
Previous full verification: 106 backend tests, no skips; mypy 43 files, Ruff,
17 frontend tests, lint/typecheck/provenance/build and 7 real browser tests pass.
Final rerun after watchdog addition also passed: 106 backend tests and all seven browser tests. Both dependency audits reported no known vulnerabilities. All six GitHub CI checks passed before #10 was merged.

## Portfolio, accessibility and deployment acceptance — complete

PR #10 merged with all checks green as `83ec2d0`. Historical limitations and the
bounded worker/upload implementation are backed up on main. Licensing remains
pending by explicit user decision; no license added or public deployment attempted.

Automated axe WCAG A/AA scans now cover the landing, case study and every console
view at 1920x1080 and 390x844. Fixed secondary text contrast and attribution link
styling. Added workspace/case-study skip links, Escape dismissal and detail focus
restoration, including preserving keyboard focus when MapLibre rebuilds markers.
Real keyboard regression covers mobile skip, vessel selection, close/restore and
guided-tour dismissal. Nine Playwright tests passed together, including the full
real decision loop. Mobile chart labels and data-section hierarchy are refined.

Architecture documentation now matches implemented services, subprocess lifecycle,
custom charts and approximate geography. Component READMEs point to real code;
product screenshots refreshed. Added illustrative systemd units with explicit
paths, non-root execution, memory/task bounds and process-group shutdown; these
are examples, not an installed Linux deployment. Production test starts the real
serve.py on an ephemeral local port against migrated/seeded disposable PostgreSQL,
checks readiness and exact-origin CORS, then terminates the owned server.

November 2 final regression found and repaired a genuine determinism defect:
CP-SAT's ten-second wall cutoff could publish different incumbents under CPU
contention. Search now uses only deterministic effort; the external job deadline
still kills overdue processes and publishes failure. The repeatability regression
also asserts the solver configuration. Recomputed reference objective and all
20-replication headline metrics are unchanged. Two additional hostile-upload
checks reject NUL headers and lone Unicode surrogate JSON before persistence.

The new minimatch advisory GHSA-g3hv-75wg-m249 was published to GitHub's database
after the earlier clean audit. Modern minimatch is pinned to patched 11.0.4.
Legacy dev-only 3.1.5/5.1.9 copies lack the vulnerable preprocessing implementation;
the full-tree audit policy documents a narrow exception with fail-closed tests.
Raw full npm audit is not clean. Runtime npm and Python audits have no findings.
See DEPENDENCY_SECURITY.md; no forced ESLint downgrade or blanket suppression.

Final local verification on November 2: `ruff check app scripts tests` passed;
`mypy app` passed (43 files); `python scripts/test_backend.py -q` passed all 108
tests against isolated PostgreSQL, zero skips (82.67s). This includes migrations,
insert-only seed, real production startup, readiness and CORS. `just doctor`
verified Python 3.12.10 native imports and the saved model. Frontend lint,
TypeScript, 21 unit tests, provenance and production build passed. All nine
PostgreSQL-backed Playwright tests passed, including desktop/mobile axe scans,
keyboard focus restoration, discovery through private export, infeasible locks,
tile failure and private upload/mapping. Screenshots inspected at 1920x1080 and
390x844. Security audit evidence and its exact exception are recorded above.

GitHub verified implementation commit `b40044f9486c52f58bc26c28738f00dae6960b37`:
all six push/PR checks passed, including both real PostgreSQL browser runs.
Evidence: [PR CI](https://github.com/abdulaz06/berthiq/actions/runs/41412222242)
and [branch CI](https://github.com/abdulaz06/berthiq/actions/runs/41412185203).
This final tracker update is documentation-only; its PR revision must also pass
CI before automatic squash merge, followed by the main-branch CI check.

## Completion and exact next action

No non-blocked implementation requirement remains; the acceptance matrix is in
LAUNCH_ACCEPTANCE.md. The application is ready for local portfolio demonstration
and prepared for persistent hosting, not publicly deployed. Run `just doctor`
then `just dev` and open `http://localhost:3000`; `/console?tour=1` starts the
guided walkthrough. On a fresh configured database use `just migrate` and
`just seed` first. Existing data and configuration are preserved.

There is no further autonomous deployment action authorized. Do not reopen the
licensing question or publicly deploy. The owner may later resolve contributor
licensing and authorize hosting; only then perform the live-URL, HTTPS/proxy,
backup-restore and host-limit acceptance in DEPLOYMENT.md. Calibration/external
validation, broader assistive-technology testing and enterprise identity/scaling
remain documented limitations, not incomplete claims. Preserve local .env,
existing DB, repaired venv and the unrelated .env.example deletion.

# Codex portfolio launch sprint

Active since 2026-10-28 (America/Chicago). Branch: `codex/berthiq-launch-sprint`.
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
| A: instructions, branch, audit | Instructions/tracker created; baseline verification in progress |
| B: ingestion and validation | Missing at takeover |
| B: optimizer, simulation, evidence | Missing at takeover |
| B: scenarios, jobs, exports, map API | Missing at takeover |
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

CSV/XLSX parsing, mapping and validation service is being implemented; not yet
verified or included in the safety checkpoint. OR-Tools/SimPy dependencies installed.
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

Repair destructive-test safety, run baseline backend/frontend checks, inspect
generator attributes and Caravan reference source, then implement ingestion and
the bounded CP-SAT/SimPy decision loop before the full console.

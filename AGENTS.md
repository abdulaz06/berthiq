# BerthIQ — active Codex instructions

The active objective is the portfolio launch sprint in `DOCS/CODEX_LAUNCH_SPRINT.md`.
Finish the real decision loop and the responsive maritime console; a passing build
or a fixture-backed screen alone is not completion. Preserve Abdul and Shravani's
working implementations and contribution history.

## Architecture and sources of truth

- Next.js App Router / React / TypeScript frontend; FastAPI modular monolith;
  SQLAlchemy + Alembic + PostgreSQL. Native development, no Docker requirement.
- `backend/app/schemas/` owns contracts; `api/` handles HTTP; `services/` owns
  computations; `db/` owns persistence. Training is offline in `backend/scripts/`.
- Read `DOCS/PRODUCT_DEFINITION.md`, `ARCHITECTURE.md`, `DATABASE.md`, and
  `DATA_CONTRACTS.md` for domain specifications; inspect implementation for status.
- `CLAUDE.md`, `ACTIVE_WORK.md`, `HANDOFF.md`, and the old roadmap/workflow are
  historical context. Their correctness rules remain valid. Two-person claims,
  one-hour sessions, deferred mobile/map scope, and checkout-main rituals are
  superseded by the user's launch sprint. Do not restart or switch away from
  ongoing launch work to follow those historical rituals.

## Non-negotiable correctness

- Contracts before implementation. Change Pydantic schemas, paired fixtures,
  and `just types` together. Never edit generated `frontend/lib/types/api.ts`.
- Same data and seed produce the same decisions and distributions. Runtime
  timing metadata may vary. No wall clock or network inside numerical logic.
- Observed, predicted, optimized, and simulated quantities stay distinct.
  KPIs carry provenance; render a ProvenanceBadge at every KPI display.
- Preserve prefix-only, chronological ML evaluation and the existing model.
  Never train during HTTP requests; never read hidden generator ground truth
  into application features, scheduling, or simulation.
- CP-SAT owns assignments, the model owns probabilities, SimPy owns
  counterfactuals, analytics owns facts, and templates only phrase evidence.
- Label synthetic operations, simulated movement, approximate berths, and
  public geographic sources. No live AIS or measured-savings claims.
- No runtime LLM, secret commits, paid services, or unnecessary infrastructure.
- Never run destructive fixtures on the development database. DB tests must
  require an explicit disposable test URL and reject non-test database names.

## Commands and verification

`just setup`, `just dev`, `just migrate`, `just seed`, `just train`, `just types`,
`just test`, `just golden`. On Windows the Python runtime is
`backend/.venv/Scripts/python.exe`; on macOS/Linux use `.venv/bin/python`.

Required checks: backend `ruff check app scripts tests`, `mypy app`, full pytest
against disposable PostgreSQL; frontend `npm run lint`, `npm run typecheck`,
`npm run test`, `npm run check:provenance`, `npm run build`; integrated Playwright
golden path and desktop/mobile browser inspection. Skipped DB tests are not proof.
The tracker records actual commands/results and any commands still being repaired.

## Resume and finish

1. Read the sprint tracker, `git status`, and recent commits. Preserve user changes.
2. Continue `codex/berthiq-launch-sprint` (or its current successor); do not reset.
3. Start at the tracker’s exact next action. Verify code before trusting status.
4. Update the tracker after each milestone with changes, evidence, limitations,
   and the exact next step. Commit stable checkpoints explicitly, excluding
   unrelated changes. Keep historical handoff documents intact.

Commit and push each meaningful verified milestone to its `codex/` branch.
Maintain milestone PRs; never force-push. The user authorizes automatically
squash-merging completed milestones after all CI checks pass, and deleting merged
branches. Never merge incomplete or failing milestones. Continue the next milestone
on a fresh branch when useful; no repeated merge approval is required.
Report latest commit, remote branch and push status at session end. The user's two
MarineX reference images set the primary visual quality bar: immersive dark map,
refined panels, strong desktop composition at 1920×1080 and dedicated mobile UX.

Launch-ready means the full real journey works: select/validate → discover →
risk → scenario → optimize → matched simulation → compare/export, with a polished
desktop/mobile interactive map and playback, CI, accurate documentation/assets,
bounded public writes, and deployment configuration. Never claim deployment
without verifying its real URL. Record unmet criteria plainly.

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

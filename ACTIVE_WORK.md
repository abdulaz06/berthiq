# ACTIVE_WORK.md — live board

The single source of truth for **who is doing what right now.** Update this the moment you claim or release a task. It may be committed directly to `main` (see `docs/WORKFLOW.md` §3).

How to use it: pick the top task from **Ready to pick up** whose dependencies are all in **Done** → move it to **In progress** with your name, branch, and date → when merged, move it to **Done** and pull the next task(s) into **Ready**.

---

## In progress

_Nothing claimed right now._

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

Open M0 set (all with merged deps) — only these two remain to finish M0:

- [M0-4] Type generation + API client stub  — depends on M0-3 (done)
- [M0-6] Synthetic generator skeleton + seed  — depends on M0-2 (done)

Every M1 *frontend* task can also be built against the committed M0-3 fixtures
(M1-03/05/08/10/12); its two prerequisites now exist — M0-7 (`<ProvenanceBadge>`
+ `lib/provenance.ts`) is merged, and M0-4 (typed client) is the remaining one.

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

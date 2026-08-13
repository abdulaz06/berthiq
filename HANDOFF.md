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

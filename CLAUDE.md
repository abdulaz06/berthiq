# CLAUDE.md — BerthIQ

This file is read automatically at the start of every Claude Code session, by both developers. It is the operating manual. Read it fully before doing anything.

---

## What BerthIQ is

A maritime port-call operations tool. It reconstructs how port calls actually run from event logs, predicts which active calls will miss their service window, and recommends a solver-backed change to berth (and later reviewer) assignments — showing the constraints, the evidence, and a simulated before/after for every recommendation. One application. Single-analyst, no login. Built by two people (Abdul and Shravani) at ~1 hour/day each.

Full spec: `docs/PRODUCT_DEFINITION.md`. Architecture: `docs/ARCHITECTURE.md`. Contracts: `docs/DATA_CONTRACTS.md`. Schema: `docs/DATABASE.md`.

---

## The rules that override everything

1. **Contracts before code.** Every seam has a Pydantic schema + a committed fixture in both `backend/tests/fixtures/` and `frontend/lib/fixtures/`. Build against the fixture; never wait for the other half to exist. If you change a schema, update it + both fixtures + regenerate `frontend/lib/types/api.ts`, all in the same branch.
2. **Determinism.** Same dataset + same seed → identical output. No wall-clock in logic, no unseeded randomness, no network calls in the core path.
3. **Provenance is mandatory.** Every KPI is a `KpiValue {value, unit, provenance}` tagged `observed`/`predicted`/`simulated`/`optimized`, and every KPI on screen renders through `<ProvenanceBadge>`. A raw untagged number is a bug.
4. **No runtime LLM.** The solver, the model, and the simulator produce the numbers; `TemplateExplainer` only phrases them from an `EvidenceRecord`. Never generate a metric, an event, or a decision in prose.
5. **The solver owns assignments, the model owns probabilities, analytics owns facts, the simulator owns counterfactuals.** Keep them separated; never let one fake another's output.
6. **Cross-platform + 8GB-friendly.** The team is Windows (Abdul) + macOS (Shravani, 8GB M1 Air). Task runner is `just`; Postgres runs natively as a service on each machine; the app runs native for dev; model training is offline. Keep everything OS-neutral, `.env` is per-machine, and line endings are LF (`.gitattributes`). No Redis, no Celery, no Docker required for daily work.
7. **Scope discipline.** Build the decision loop end-to-end before any secondary view. Don't add a feature that isn't in the current milestone (`docs/ROADMAP.md`).

---

## How we work (queue, not ownership)

Work is a claim-based queue. Nobody owns "frontend" or "backend." Whoever is free picks the next Ready task.

- Tasks and acceptance criteria: `docs/BACKLOG.md`
- Live board (claims / blocked / ready): `ACTIVE_WORK.md`
- Session handoff log: `HANDOFF.md`
- Git + merge rules: `docs/WORKFLOW.md`
- Recovery: `docs/RECOVERY.md`

**Start of session:** `git checkout main && git pull` → read `ACTIVE_WORK.md` + the latest `HANDOFF.md` entry → claim a task (add it under *In progress* in `ACTIVE_WORK.md`, commit that to `main`).

**Do the task:** branch `task/<id>-<slug>` → build to the acceptance criteria → write the listed tests → push → CI green → squash-merge to `main` → delete the branch.

**End of session (always, even mid-task):** update `ACTIVE_WORK.md` (release, or mark in-progress with exact state) → append a `HANDOFF.md` entry with what you did and the **exact next step** → push. Never end without this.

A task is done only when: acceptance criteria met, tests written and passing, CI green, merged to `main`.

---

## Definition of "green"

CI must pass: `ruff` + `mypy` (backend), `eslint` + `tsc` (frontend), `pytest`, `vitest`, and the Playwright golden path (once it exists). `main` is always green and always runnable. If `main` is red, fixing it is the next task anyone picks, ahead of everything.

---

## Commands (via `just` — cross-platform)

Postgres runs as a native background service on each machine (set up once); the app runs native. `just dev` does **not** start Postgres — ensure the service is running.

```
just dev      # run backend + frontend together (via npx concurrently)
just migrate  # apply Alembic migrations
just seed     # (re)generate + load the built-in Khalifa dataset (deterministic)
just types    # regenerate frontend/lib/types/api.ts from the backend OpenAPI
just test     # run backend + frontend test suites
just golden   # run the golden-path end-to-end test
just setup    # one-time environment setup + verification
```

---

## Where things live

```
backend/app/schemas/   contracts (source of truth)
backend/app/api/        thin routers (no logic)
backend/app/services/   all logic: ingestion, discovery, prediction, optimization, simulation, explanation
backend/app/db/         SQLAlchemy models + migrations
backend/app/core/       provenance + evidence primitives
backend/scripts/        generate_dataset.py, train_models.py, validate_simulator.py, collect_ais.py
backend/data/ports/     port config files (khalifa.json, ...)
frontend/app/           routes (one folder per screen)
frontend/components/    gantt/, process-graph/, map/, risk-board/, tradeoff/, provenance/, evidence/
frontend/lib/           api/ (client), fixtures/, types/api.ts (generated), provenance.ts
```

---

## Never

- Commit secrets or raw data: `.env`, `aisstream_key.txt`, `ais_data/`, model artifacts, `node_modules/`, `__pycache__/` stay gitignored.
- Push feature code to `main` (branch + CI only). Direct-to-`main` is allowed **only** for `ACTIVE_WORK.md`, `HANDOFF.md`, `docs/`, and `data/ports/*.json`.
- Hand-edit `frontend/lib/types/api.ts` (it's generated).
- Claim "digital twin," "measured savings," or "real AD Ports data." It's a simulation-backed workflow model on synthetic operational data with real port geography — say exactly that.
- Add an LLM to the runtime path, or add infra (Redis, queues, microservices) that a single-user local app doesn't need.

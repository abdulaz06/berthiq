# BerthIQ — Database Design

**Status:** Approved foundation
**Engine:** PostgreSQL 15+
**Access:** SQLAlchemy ORM + Alembic migrations
**Reads with:** `ARCHITECTURE.md`, `DATA_CONTRACTS.md`

---

## 1. Design stance

Three layers of data, kept apart on purpose (following the brief's guidance to separate transactional truth from derived analytics):

- **Transactional** — the raw event log and per-case summaries. Real columns, real constraints, normalized.
- **Derived** — discovery output, predictions, KPIs, optimization and simulation runs. These are *reproducible from the transactional layer*, so they lean on JSONB and are freely re-computable.
- **Coordination** — the `jobs` table, which tracks async work.

There are **no `users` or `organizations` tables** — single-analyst workstation, no auth. Ports are **config files**, not tables (`backend/data/ports/*.json`), referenced by name. This keeps the schema small and honest about what actually varies.

Large derived artifacts (a DFG, a SHAP matrix, a KPI distribution) live as **JSONB** in derived tables rather than being exploded into rows. They are always regenerable, they are read as a whole, and normalizing them would pollute the schema for no query benefit at this scale (~7k events, ~600 cases).

---

## 2. Enumerated types

```sql
CREATE TYPE dataset_source   AS ENUM ('builtin', 'uploaded', 'generated');
CREATE TYPE dataset_status   AS ENUM ('validating', 'invalid', 'ready');
CREATE TYPE case_outcome     AS ENUM ('active', 'on_time', 'late');
CREATE TYPE provenance       AS ENUM ('observed', 'predicted', 'simulated', 'optimized');
CREATE TYPE job_type         AS ENUM ('discovery', 'optimization', 'simulation');
CREATE TYPE job_status        AS ENUM ('pending', 'running', 'succeeded', 'failed');
CREATE TYPE sim_run_type      AS ENUM ('baseline', 'optimized');
```

`provenance` is the load-bearing one. Every KPI row and every KPI in an API response carries it.

---

## 3. Entity map

```
datasets ──┬──< events
           ├──< cases
           ├──1 process_models          (one current model per dataset)
           ├──< predictions
           ├──< kpis                     (scenario_id NULL = dataset-level baseline KPIs)
           ├──< scenarios ──┬──< optimization_runs
           │                └──< simulation_runs
           ├──< remark_labels            (strong version)
           └──< jobs
```

One dataset is the root aggregate. Deleting a dataset cascades to everything derived from it.

---

## 4. Transactional layer

### 4.1 `datasets`

The versioned root. An upload, a built-in, or a generator run.

```sql
CREATE TABLE datasets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    source          dataset_source NOT NULL,
    status          dataset_status NOT NULL DEFAULT 'validating',
    port_config     TEXT,                    -- e.g. 'khalifa'; NULL for non-maritime uploads
    seed            BIGINT,                  -- generator seed, for reproducibility
    event_count     INTEGER NOT NULL DEFAULT 0,
    case_count      INTEGER NOT NULL DEFAULT 0,
    time_range_start TIMESTAMPTZ,
    time_range_end   TIMESTAMPTZ,
    stats           JSONB,                   -- summary counts, activity list, resource list
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 `events`

The raw event log — the ground truth everything else derives from. Core columns are fixed; maritime and optional fields live in `attributes` JSONB so the same table serves both a generic upload and a rich port-call log.

```sql
CREATE TABLE events (
    id           BIGSERIAL PRIMARY KEY,
    dataset_id   UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    case_id      TEXT NOT NULL,              -- the port call
    activity     TEXT NOT NULL,              -- stage name
    start_ts     TIMESTAMPTZ,
    end_ts       TIMESTAMPTZ NOT NULL,       -- the one timestamp always required
    resource_id  TEXT,                       -- reviewer / planner / pilot / berth
    status       TEXT,                       -- completed / rejected / returned / awaiting_docs
    attributes   JSONB NOT NULL DEFAULT '{}',-- berth, vessel_type, loa, draft, eta, ata, etb,
                                             --   cargo_type, weather, remark_text, cost, ...
    seq          INTEGER                     -- ordinal within the case, set at ingest
);
CREATE INDEX idx_events_dataset_case ON events (dataset_id, case_id, seq);
CREATE INDEX idx_events_activity     ON events (dataset_id, activity);
```

**Why hybrid columns + JSONB:** the five core fields (`case_id`, `activity`, `end_ts`, `resource_id`, `status`) are what process mining universally needs and what we query and index on. The maritime module fields vary by domain and are read as part of a case, not filtered individually, so JSONB keeps ingestion flexible without a 20-column table full of NULLs.

### 4.3 `cases`

A derived-but-persisted per-call summary. Rebuilt from `events` at ingest. Exists so the risk board and dashboards don't re-aggregate the whole event table on every request.

```sql
CREATE TABLE cases (
    id                   BIGSERIAL PRIMARY KEY,
    dataset_id           UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    case_id              TEXT NOT NULL,
    is_active            BOOLEAN NOT NULL,       -- an in-flight port call
    current_stage        TEXT,
    first_event_ts       TIMESTAMPTZ,
    last_event_ts        TIMESTAMPTZ,
    service_window_start TIMESTAMPTZ,            -- target berthing window (set at approval)
    service_window_end   TIMESTAMPTZ,
    actual_berthing_ts   TIMESTAMPTZ,            -- NULL while active
    outcome              case_outcome NOT NULL,  -- active / on_time / late
    rework_count         INTEGER NOT NULL DEFAULT 0,
    vessel_type          TEXT,
    loa                  NUMERIC,
    draft                NUMERIC,
    cargo_type           TEXT,
    attributes           JSONB NOT NULL DEFAULT '{}',
    UNIQUE (dataset_id, case_id)
);
CREATE INDEX idx_cases_active ON cases (dataset_id, is_active);
```

`outcome` is technically derivable, but it's the single most-filtered field (risk board = active cases; evaluation = late vs on-time), so it's materialized.

---

## 5. Derived layer

### 5.1 `process_models`

Cached discovery output. One current row per dataset (re-discovery replaces it).

```sql
CREATE TABLE process_models (
    id           BIGSERIAL PRIMARY KEY,
    dataset_id   UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    dfg          JSONB NOT NULL,   -- nodes, edges, frequencies, median/p90 waits
    variants     JSONB NOT NULL,   -- ranked variant list with counts and durations
    bottlenecks  JSONB NOT NULL,   -- ranked stages with supporting metrics
    metrics      JSONB NOT NULL,   -- throughput, rework rate, utilization
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dataset_id)
);
```

### 5.2 `predictions`

One row per active case per scoring. `model_version` ties a score to the artifact that produced it.

```sql
CREATE TABLE predictions (
    id                       BIGSERIAL PRIMARY KEY,
    dataset_id               UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    case_id                  TEXT NOT NULL,
    model_version            TEXT NOT NULL,
    miss_probability         NUMERIC NOT NULL,      -- 0..1
    predicted_remaining_min  NUMERIC,               -- secondary target (SHOULD)
    prediction_point         TEXT,                  -- activity at which this was scored
    shap                     JSONB NOT NULL,        -- top signed feature contributions
    features                 JSONB NOT NULL,        -- the prefix feature vector (auditability)
    computed_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_predictions_dataset_case ON predictions (dataset_id, case_id);
```

### 5.3 `kpis`

The provenance-tagged KPI store. `scenario_id NULL` = dataset-level baseline KPI; non-NULL = a KPI belonging to a scenario's optimized/simulated result.

```sql
CREATE TABLE kpis (
    id           BIGSERIAL PRIMARY KEY,
    dataset_id   UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    scenario_id  BIGINT REFERENCES scenarios(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,            -- 'avg_waiting_time', 'window_compliance', 'berth_conflicts'
    value        NUMERIC NOT NULL,
    unit         TEXT NOT NULL,            -- 'hours', 'percent', 'count'
    provenance   provenance NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kpis_scope ON kpis (dataset_id, scenario_id, name);
```

This table is why a headline number can never lose its lineage: provenance is a NOT NULL column, so an untagged KPI cannot physically be stored.

### 5.4 `remark_labels` (strong version)

```sql
CREATE TABLE remark_labels (
    id              BIGSERIAL PRIMARY KEY,
    dataset_id      UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    case_id         TEXT,
    remark_text     TEXT NOT NULL,
    predicted_label TEXT NOT NULL,          -- delay reason class
    confidence      NUMERIC NOT NULL,
    model_version   TEXT NOT NULL
);
```

---

## 6. Scenario layer

### 6.1 `scenarios`

A saved what-if configuration.

```sql
CREATE TABLE scenarios (
    id                BIGSERIAL PRIMARY KEY,
    dataset_id        UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    constraints       JSONB NOT NULL,   -- capacity caps, locked assignments, parallelism flags
    objective_weights JSONB NOT NULL,   -- w1..w5 (see DATA_CONTRACTS optimization contract)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 `optimization_runs`

The result of solving one scenario. Carries the full `EvidenceRecord` so the explanation is reproducible without re-solving.

```sql
CREATE TABLE optimization_runs (
    id                BIGSERIAL PRIMARY KEY,
    scenario_id       BIGINT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    solver_status     TEXT NOT NULL,     -- OPTIMAL / FEASIBLE / INFEASIBLE
    objective_value   NUMERIC,
    runtime_ms        INTEGER NOT NULL,
    assignments       JSONB,             -- vessel→berth→slot, task→reviewer
    changed_decisions JSONB,             -- what differs from the existing plan
    evidence          JSONB NOT NULL,    -- serialized EvidenceRecord
    baseline_deltas   JSONB,             -- vs no-change / FIFO / greedy
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.3 `simulation_runs`

Baseline and optimized are **two rows sharing a seed** — that shared seed is the guarantee that the comparison isolates the plan change, per the Pack's simulation-vs-simulation rule.

```sql
CREATE TABLE simulation_runs (
    id                BIGSERIAL PRIMARY KEY,
    scenario_id       BIGINT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    run_type          sim_run_type NOT NULL,  -- baseline | optimized
    seed              BIGINT NOT NULL,
    replications      INTEGER NOT NULL,
    kpi_distributions JSONB NOT NULL,         -- per-KPI: mean, std, p10, p50, p90 across reps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Coordination layer

### 7.1 `jobs`

Every async operation (discovery, optimization, simulation) gets a row. The frontend polls `GET /api/jobs/{id}`.

```sql
CREATE TABLE jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type     job_type NOT NULL,
    status       job_status NOT NULL DEFAULT 'pending',
    dataset_id   UUID REFERENCES datasets(id) ON DELETE CASCADE,
    scenario_id  BIGINT REFERENCES scenarios(id) ON DELETE CASCADE,
    progress     NUMERIC NOT NULL DEFAULT 0,   -- 0..1, best-effort
    result_type  TEXT,                          -- 'optimization_run' | 'simulation_run' | 'process_model'
    result_id    TEXT,                          -- id of the produced row
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_status ON jobs (status);
```

---

## 8. Provenance model (the honesty guarantee, at the schema level)

Two mechanisms, one structural and one by construction:

1. **`kpis.provenance` is NOT NULL.** No KPI can be persisted without declaring where it came from.
2. **Which layer writes which tag:**

| Writer | Tag it emits |
|---|---|
| `discovery` / direct event aggregation | `observed` |
| `prediction` inference | `predicted` |
| `optimization` solver output | `optimized` |
| `simulation` run | `simulated` |

The API mirrors this: every KPI crosses the wire as `KpiValue { value, unit, provenance }` (see `DATA_CONTRACTS.md` §3), and the frontend renders it through `<ProvenanceBadge>`. A number therefore cannot travel from database to screen without its lineage attached.

---

## 9. Migrations and seeding

- **Migrations:** Alembic. Every schema change is a migration file; `just migrate` applies them. Never hand-edit a live schema.
- **Reproducible datasets:** a dataset is defined by its `seed` + `port_config`. `just seed` runs `generate_dataset.py` to (re)create the built-in datasets deterministically. Generated data under `backend/data/datasets/` is therefore regenerable and can be gitignored; the seed in the `datasets` row is the real source of truth.
- **Ground truth:** the generator writes its hidden truth (true bottleneck stage, true delay cause per case, reference assignment) alongside each dataset, for the evaluation experiments. This is stored as a sibling artifact, not mixed into `events`, so the app never accidentally sees the answers.

---

## 10. What a first cut can skip

To keep Milestone 1 honest but small, the MVP schema needs only: `datasets`, `events`, `cases`, `process_models`, `predictions`, `kpis`, `scenarios`, `optimization_runs`, `simulation_runs`, `jobs`. `remark_labels` arrives with the strong version. No table is added later that forces a rewrite of an earlier one — the derived tables are all independent of each other and cascade from `datasets`.
